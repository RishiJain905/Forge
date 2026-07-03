import { promises as fs } from "fs";
import path from "node:path";
import readline from "node:readline";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
  getBlockedWorkstreams,
  getExecutableWorkstreams,
  restoreExecuteState,
  buildMergePrerequisiteIds,
} from "./state-machine.js";
import { validateSplitArtifact } from "../split/schema.js";
import type {
  ExecuteCommandOptions,
  ExecuteCommandResult,
  ExecuteArtifact,
  AIExecutionResult,
} from "./types.js";
import type { ExecuteState } from "./state-machine.js";
import { writeExecuteArtifact } from "./artifact.js";
import { createExecuteReport } from "./report.js";
import type { SplitArtifact } from "../split/types.js";
import { buildWorkstreamPrompt } from "./prompt-builder.js";
import {
  executeWorkstream,
  getModelCallTimeoutForPrompt,
  getModelConfigError,
  isModelConfigured,
} from "./model-connector.js";
import { loadRepoDotenv } from "../repo-dotenv.js";

const SCHEMA_VERSION = "1.0.0";
const FORGE_VERSION = "0.0.1";

function getWorkstreamIndex(state: ExecuteState, id: string): number {
  return Array.from(state.workstreams.keys()).indexOf(id);
}

function truncateOneLine(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatPrerequisiteLabels(
  state: ExecuteState,
  depIds: string[],
  maxShow: number
): string {
  const keys = Array.from(state.workstreams.keys());
  const labels = depIds.map((depId) => {
    const idx = keys.indexOf(depId);
    return idx >= 0 ? `[${idx + 1}]` : depId;
  });
  if (labels.length <= maxShow) return labels.join(", ");
  return `${labels.slice(0, maxShow).join(", ")} (+${labels.length - maxShow} more)`;
}

function printDashboard(state: ExecuteState, mergeOrderMap: Map<string, string[]>): void {
  console.log("\n=== Workstream Status ===");
  console.log(
    "<id> = dashboard index (1, 2, …), optional brackets ([1]), or full workstream_id (e.g. ws-plan-config-1)."
  );
  console.log("[id] state       merge / notes        workstream_id");
  console.log("     title");

  let index = 1;
  for (const [, ws] of state.workstreams) {
    let blockedInfo: string;

    if (ws.state === "queued") {
      const requirements = getQueuedWorkstreamRequirements(
        ws.workstreamId,
        mergeOrderMap
      );
      const unmet = requirements.filter((req) => !state.mergedWorkstreams.has(req));

      if (unmet.length === 0) {
        blockedInfo = "ready";
      } else {
        blockedInfo = `after ${formatPrerequisiteLabels(state, unmet, 8)}`;
      }
    } else if (ws.state === "completed") {
      blockedInfo = "merged";
    } else if (ws.state === "failed") {
      blockedInfo = ws.error
        ? truncateOneLine(`failed: ${ws.error}`, 48)
        : "failed";
    } else if (ws.state === "running") {
      blockedInfo = ws.aiModelUsed
        ? truncateOneLine(`running (${ws.aiModelUsed})`, 48)
        : "running";
    } else {
      blockedInfo = "";
    }

    console.log(
      `[${index}] ${ws.state.padEnd(11)} ${truncateOneLine(blockedInfo, 36).padEnd(36)} ${ws.workstreamId}`
    );
    console.log(`     ${truncateOneLine(ws.title, 100)}`);
    index++;
  }
}

function getQueuedWorkstreamRequirements(
  id: string,
  mergeOrderMap: Map<string, string[]>
): string[] {
  return mergeOrderMap.get(id) ?? [];
}

function buildSummary(state: ExecuteState): string {
  const workstreams = Array.from(state.workstreams.values());
  const total = workstreams.length;

  let completed = 0;
  let failed = 0;
  let running = 0;
  let queued = 0;

  // ⚡ Bolt: Single pass aggregation replaces multiple filter().length calls
  // to eliminate O(N) redundant passes and intermediate array allocations
  for (const ws of workstreams) {
    if (ws.state === "completed") completed++;
    else if (ws.state === "failed") failed++;
    else if (ws.state === "running") running++;
    else if (ws.state === "queued") queued++;
  }

  const blocked = getBlockedWorkstreams(state).length;

  return `Total: ${total}, Completed: ${completed}, Failed: ${failed}, Running: ${running}, Queued: ${queued}, Blocked: ${blocked}`;
}

async function loadPlanArtifact(repoRoot: string): Promise<import("../plan/types.js").PlanArtifact | null> {
  const planPath = path.join(repoRoot, ".forge", "plan.json");
  try {
    const content = await fs.readFile(planPath, "utf-8");
    return JSON.parse(content) as import("../plan/types.js").PlanArtifact;
  } catch {
    return null;
  }
}

async function loadVerifyArtifact(repoRoot: string): Promise<import("../verify/types.js").VerifyArtifact | null> {
  const verifyPath = path.join(repoRoot, ".forge", "verify.json");
  try {
    const content = await fs.readFile(verifyPath, "utf-8");
    return JSON.parse(content) as import("../verify/types.js").VerifyArtifact;
  } catch {
    return null;
  }
}

async function executeWorkstreamWithAI(
  workstreamId: string,
  state: ExecuteState,
  repoRoot: string
): Promise<AIExecutionResult> {
  const ws = state.workstreams.get(workstreamId);
  if (!ws) {
    return { workstreamId, success: false, changes: [], modelUsed: "", error: "Workstream not found" };
  }

  console.log(`[AI] ${workstreamId}: loading plan.json, verify.json, split.json…`);
  const [planArtifact, verifyArtifact] = await Promise.all([
    loadPlanArtifact(repoRoot),
    loadVerifyArtifact(repoRoot),
  ]);

  if (!planArtifact || !verifyArtifact) {
    return {
      workstreamId,
      success: false,
      changes: [],
      modelUsed: "",
      error: "plan.json or verify.json not found. Run 'forge plan' and 'forge verify' first.",
    };
  }

  try {
    const splitJsonPath = path.join(repoRoot, ".forge", "split.json");
    const splitContent = await fs.readFile(splitJsonPath, "utf-8");
    const splitArtifact = JSON.parse(splitContent) as SplitArtifact;

    console.log(`[AI] ${workstreamId}: building workstream prompt…`);
    const { prompt } = await buildWorkstreamPrompt({
      workstreamId,
      splitArtifact,
      planArtifact,
      verifyArtifact,
      repoRoot,
    });

    const tmo = getModelCallTimeoutForPrompt(prompt.length);
    console.log(
      `[AI] ${workstreamId}: calling model (${prompt.length} chars; ~${Math.round(
        tmo / 1000
      )}s HTTP timeout${process.env.FORGE_MODEL_TIMEOUT_MS?.trim() ? " (from FORGE_MODEL_TIMEOUT_MS)" : " (scaled from prompt size; set FORGE_MODEL_TIMEOUT_MS to override)"}). No git/file updates until the API returns. FORGE_MODEL_DEBUG=1 logs each request on stderr.`
    );

    const startTime = Date.now();
    const result = await executeWorkstream(prompt, repoRoot);
    const executionDurationMs = Date.now() - startTime;

    console.log(
      `[AI] ${workstreamId}: model + apply finished in ${executionDurationMs}ms (${result.changes.length} file change(s))`
    );

    return {
      workstreamId,
      success: true,
      changes: result.changes.map((c) => ({
        path: c.path,
        action: c.action as "create" | "modify" | "delete",
        linesAdded: c.linesAdded,
        linesRemoved: c.linesRemoved,
      })),
      modelUsed: result.modelUsed,
      promptHash: result.promptHash,
      provider: result.provider,
      executionDurationMs,
    };
  } catch (err) {
    return {
      workstreamId,
      success: false,
      changes: [],
      modelUsed: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runExecuteCommand(
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  const repoRoot = path.resolve(options.repo ?? process.cwd());
  loadRepoDotenv(repoRoot);

  const splitJsonPath = path.join(repoRoot, ".forge", "split.json");

  console.log("Welcome to Forge Execute (V1)\n");
  console.log(`Reading split.json from ${splitJsonPath}...`);

  let splitArtifact: SplitArtifact;
  try {
    const content = await fs.readFile(splitJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    splitArtifact = validateSplitArtifact(parsed);
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT") {
      return {
        status: "failed",
        summary: "split.json not found. Run 'forge split' first.",
        artifactPath: "",
        outputRoot: repoRoot,
        failure: {
          code: "NO_SPLIT_ARTIFACT",
          message: "split.json not found. Run 'forge split' first.",
        },
      };
    }
    if (err instanceof Error) {
      return {
        status: "failed",
        summary: `Invalid split.json: ${err.message}`,
        artifactPath: "",
        outputRoot: repoRoot,
        failure: {
          code: "INVALID_SPLIT_ARTIFACT",
          message: err.message,
        },
      };
    }
    return {
      status: "failed",
      summary: "Failed to read split.json",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: {
        code: "INVALID_SPLIT_ARTIFACT",
        message: String(err),
      },
    };
  }

  const workstreamCount = splitArtifact.workstreams.length;
  console.log(`Found ${workstreamCount} workstreams.\n`);

  const outputDir = options.outputDir ?? path.join(repoRoot, ".forge");
  const executePath = path.join(outputDir, "execute.json");
  let state: ExecuteState;

  try {
    const existingContent = await fs.readFile(executePath, "utf-8");
    let existingArtifact: ExecuteArtifact;
    try {
      existingArtifact = JSON.parse(existingContent) as ExecuteArtifact;
    } catch {
      return {
        status: "failed",
        summary: `Existing execute.json is corrupt or invalid JSON. Use --force to start over.`,
        artifactPath: executePath,
        outputRoot: outputDir,
        exitCode: 1,
        failure: {
          code: "CORRUPT_EXECUTE_ARTIFACT",
          message: "execute.json exists but contains invalid JSON. Use --force to start over.",
        },
      };
    }
    if (options.resume) {
      state = restoreExecuteState(
        existingArtifact,
        splitJsonPath,
        splitArtifact
      );
      console.log("Resumed from existing execute.json");
    } else if (options.force) {
      state = createExecuteState(splitArtifact, splitJsonPath);
    } else {
      console.log(`Found existing execute.json from ${existingArtifact.createdAt}`);
      console.log("Use --resume to continue, or --force to start over.");
      return {
        status: "failed",
        summary: "Found existing execute.json. Use --resume to continue, or --force to start over.",
        artifactPath: executePath,
        outputRoot: outputDir,
        exitCode: 1,
      };
    }
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT") {
      state = createExecuteState(splitArtifact, splitJsonPath);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "failed",
        summary: `Failed to read execute.json: ${message}`,
        artifactPath: executePath,
        outputRoot: outputDir,
        exitCode: 1,
        failure: {
          code: "IO_ERROR",
          message,
        },
      };
    }
  }

  const mergeOrderMap = buildMergePrerequisiteIds(splitArtifact);

  if (state.workstreams.size === 0) {
    console.log("No workstreams to execute. All done.");
    const artifactPath = path.join(outputDir, "execute.json");
    const reportPath = path.join(outputDir, "execute-report.md");
    const artifact = buildExecuteArtifact(state, SCHEMA_VERSION, FORGE_VERSION);

    try {
      await fs.mkdir(outputDir, { recursive: true });
      await writeExecuteArtifact(artifactPath, artifact);
      await fs.writeFile(reportPath, createExecuteReport(artifact), "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failed",
        summary: `Failed to write execute outputs: ${message}`,
        artifactPath,
        reportPath,
        outputRoot: outputDir,
        exitCode: 1,
      };
    }

    return {
      status: "ready",
      summary: "No workstreams found.",
      artifactPath,
      reportPath,
      outputRoot: outputDir,
      exitCode: 0,
    };
  }

  const blocked = getBlockedWorkstreams(state);
  if (blocked.length === state.workstreams.size && state.workstreams.size > 0) {
    console.error("All workstreams are blocked by merge_order constraints.");
    console.error("Check that upstream dependencies have been completed first.");
  }

  printDashboard(state, mergeOrderMap);

  console.log(
    "\nCommands: run <id> | aiexecute <id> | done <id> | fail <id> [reason] | status | exit"
  );
  console.log("  run/aiexecute <id>: Execute workstream with AI (builds prompt, calls model, applies changes)");
  console.log("  done <id>:         Mark workstream as manually completed");
  console.log("  fail <id> [reason]: Mark workstream as failed");
  console.log("  status:            Show dashboard");
  console.log("  exit:              Exit REPL");
  console.log(
    "  Note: During an AI run this REPL handles one line at a time — the next `>` appears after the request finishes (see FORGE_MODEL_TIMEOUT_MS)."
  );
  const modelConfigErr = getModelConfigError(repoRoot);
  if (modelConfigErr) {
    console.log(`\nAI is off: ${modelConfigErr}`);
    console.log(
      "Fix: repo-root .env (e.g. FORGE_MODEL_API_KEY, FORGE_MODEL=openai/your-model) and/or .forge/config.yaml `execute.default_model`, then restart this command."
    );
  } else {
    console.log(
      "\nAI execution: model resolved from env / .forge/config.yaml (repo .env is loaded when present)."
    );
    console.log(
      "Ollama Cloud: use `ollama/<model>` with FORGE_MODEL_BASE_URL=https://ollama.com (or …/v1 — Forge maps to /api/chat) and FORGE_MODEL_API_KEY or OLLAMA_API_KEY."
    );
    console.log("Optional: FORGE_MODEL_BASE_URL, FORGE_MODEL_TIMEOUT_MS, FORGE_MODEL_DEBUG=1, FORGE_EXECUTE_AUTO");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  let completed = false;
  let exitResult: ExecuteCommandResult | null = null;

  function findWorkstreamByIndex(
    indexStr: string
  ): { id: string; ws: ReturnType<typeof state.workstreams.get> } | null {
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) return null;

    const keys = Array.from(state.workstreams.keys());
    const id = keys[index - 1];
    if (!id) return null;

    return { id, ws: state.workstreams.get(id) };
  }

  /** 1-based index, [n], or map key / workstream_id string */
  function resolveWorkstreamRef(
    raw: string
  ): { id: string; ws: ReturnType<typeof state.workstreams.get> } | null {
    const trimmed = raw.trim();
    const bracketed = trimmed.match(/^\[(\d+)\]$/);
    const normalized = bracketed ? bracketed[1]! : trimmed;

    if (/^\d+$/.test(normalized)) {
      return findWorkstreamByIndex(normalized);
    }

    const ws = state.workstreams.get(normalized);
    if (ws) return { id: normalized, ws };

    return null;
  }

  function getUnmet(id: string): string[] {
    const requirements = mergeOrderMap.get(id) ?? [];
    return requirements.filter((req) => !state.mergedWorkstreams.has(req));
  }

  function getIndexForId(id: string): number {
    return Array.from(state.workstreams.keys()).indexOf(id) + 1;
  }

  async function processLine(line: string): Promise<boolean> {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (cmd === "exit" || cmd === "quit") {
      return true;
    }

    if (cmd === "status") {
      printDashboard(state, mergeOrderMap);
      return false;
    }

    if (cmd === "run" && parts[1]) {
      const found = resolveWorkstreamRef(parts[1]);
      if (!found || !found.ws) {
        console.log(
          `Unknown workstream: ${parts[1]} (use index 1…${state.workstreams.size}, [n], or workstream_id)`
        );
        return false;
      }

      const ws = found.ws;
      const result = transitionState(found.id, "running", state);
      if (!result.success) {
        console.log(result.error);
        return false;
      }

      // If no model is configured, stay in manual mode (just transition to running)
      if (!isModelConfigured(repoRoot)) {
        console.log(`✓ ${ws.workstreamId} STARTED (manual mode)`);
        printDashboard(state, mergeOrderMap);
        return false;
      }

      console.log(
        "(REPL: your next line is not read until this workstream finishes — see FORGE_MODEL_TIMEOUT_MS.)"
      );

      const aiResult = await executeWorkstreamWithAI(found.id, state, repoRoot);

      if (!aiResult.success) {
        transitionState(found.id, "failed", state, aiResult.error);
        console.log(`✗ ${ws.workstreamId} FAILED (AI): ${aiResult.error}`);
        printDashboard(state, mergeOrderMap);
        return false;
      }

      // Populate AI metadata on the workstream
      ws.aiModelUsed = aiResult.modelUsed;
      ws.aiChangesCount = aiResult.changes.length;
      ws.aiLinesAdded = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
      ws.aiLinesRemoved = aiResult.changes.reduce((sum, c) => sum + c.linesRemoved, 0);
      if (aiResult.promptHash) ws.aiPromptHash = aiResult.promptHash;
      if (aiResult.provider) ws.aiProvider = aiResult.provider;
      if (aiResult.executionDurationMs !== undefined) ws.aiExecutionDurationMs = aiResult.executionDurationMs;
      ws.changesMade = aiResult.changes.map((c) => ({
        file: c.path.startsWith("/") ? c.path : path.resolve(repoRoot, c.path),
        action: c.action,
        diffHash: "",
        linesAdded: c.linesAdded,
        linesRemoved: c.linesRemoved,
      }));

      for (const change of aiResult.changes) {
        const lines = change.linesAdded > 0 ? `+${change.linesAdded} lines` : "";
        const removed = change.linesRemoved > 0 ? `-${change.linesRemoved} lines` : "";
        console.log(`[AI] ${change.action}: ${change.path} (${[lines, removed].filter(Boolean).join(", ")})`);
      }

      const doneResult = transitionState(found.id, "completed", state);
      if (!doneResult.success) {
        console.log(`Warning: could not mark as completed: ${doneResult.error}`);
      }

      const totalChanges = aiResult.changes.length;
      const totalLines = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
      console.log(`✓ ${ws.workstreamId} COMPLETED (AI) — ${totalChanges} files changed, +${totalLines} lines`);
      printDashboard(state, mergeOrderMap);
      return false;
    }

    if (cmd === "aiexecute" && parts[1]) {
      const found = resolveWorkstreamRef(parts[1]);
      if (!found || !found.ws) {
        console.log(
          `Unknown workstream: ${parts[1]} (use index 1…${state.workstreams.size}, [n], or workstream_id)`
        );
        return false;
      }

      const ws = found.ws;
      const result = transitionState(found.id, "running", state);
      if (!result.success) {
        console.log(result.error);
        return false;
      }

      console.log(
        "(REPL: your next line is not read until this workstream finishes — see FORGE_MODEL_TIMEOUT_MS.)"
      );

      const aiResult = await executeWorkstreamWithAI(found.id, state, repoRoot);

      if (!aiResult.success) {
        transitionState(found.id, "failed", state, aiResult.error);
        console.log(`✗ ${ws.workstreamId} FAILED (AI): ${aiResult.error}`);
        printDashboard(state, mergeOrderMap);
        return false;
      }

      // Populate AI metadata on the workstream
      ws.aiModelUsed = aiResult.modelUsed;
      ws.aiChangesCount = aiResult.changes.length;
      ws.aiLinesAdded = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
      ws.aiLinesRemoved = aiResult.changes.reduce((sum, c) => sum + c.linesRemoved, 0);
      if (aiResult.promptHash) ws.aiPromptHash = aiResult.promptHash;
      if (aiResult.provider) ws.aiProvider = aiResult.provider;
      if (aiResult.executionDurationMs !== undefined) ws.aiExecutionDurationMs = aiResult.executionDurationMs;
      ws.changesMade = aiResult.changes.map((c) => ({
        file: c.path.startsWith("/") ? c.path : path.resolve(repoRoot, c.path),
        action: c.action,
        diffHash: "",
        linesAdded: c.linesAdded,
        linesRemoved: c.linesRemoved,
      }));

      for (const change of aiResult.changes) {
        const lines = change.linesAdded > 0 ? `+${change.linesAdded} lines` : "";
        const removed = change.linesRemoved > 0 ? `-${change.linesRemoved} lines` : "";
        console.log(`[AI] ${change.action}: ${change.path} (${[lines, removed].filter(Boolean).join(", ")})`);
      }

      const doneResult = transitionState(found.id, "completed", state);
      if (!doneResult.success) {
        console.log(`Warning: could not mark as completed: ${doneResult.error}`);
      }

      const totalChanges = aiResult.changes.length;
      const totalLines = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
      console.log(`✓ ${ws.workstreamId} COMPLETED (AI) — ${totalChanges} files changed, +${totalLines} lines`);
      printDashboard(state, mergeOrderMap);
      return false;
    }

    if (cmd === "done" && parts[1]) {
      const found = resolveWorkstreamRef(parts[1]);
      if (!found || !found.ws) {
        console.log(
          `Unknown workstream: ${parts[1]} (use index 1…${state.workstreams.size}, [n], or workstream_id)`
        );
        return false;
      }

      const previouslyBlocked: string[] = [];
      for (const [id, ws] of state.workstreams) {
        if (ws.state === "queued" && getUnmet(id).length > 0) {
          previouslyBlocked.push(id);
        }
      }

      const result = transitionState(found.id, "completed", state);
      if (!result.success) {
        if (result.violations && result.violations.length > 0) {
          const violationNames = result.violations
            .map((v) => {
              const idx = getIndexForId(v);
              const ws = state.workstreams.get(v);
              return ws ? `[${idx}] ${ws.workstreamId}` : v;
            })
            .join(", ");
          console.log(
            `Cannot complete: merge_order not satisfied. Waiting on: ${violationNames}`
          );
        } else {
          console.log(result.error);
        }
      } else {
        console.log(`✓ ${found.ws.workstreamId} COMPLETED and MERGED`);
        if (found.ws.aiChangesCount !== undefined) {
          console.log(`  AI: ${found.ws.aiChangesCount} files changed, +${found.ws.aiLinesAdded ?? 0} lines, -${found.ws.aiLinesRemoved ?? 0} lines`);
        }
        const currentlyBlocked: string[] = [];
        for (const [id, ws] of state.workstreams) {
          if (ws.state === "queued" && getUnmet(id).length > 0) {
            currentlyBlocked.push(id);
          }
        }
        const newlyUnblocked = previouslyBlocked.filter(id => !currentlyBlocked.includes(id));
        if (newlyUnblocked.length > 0) {
          console.log(`Newly unblocked: ${newlyUnblocked.join(", ")}`);
        }
        printDashboard(state, mergeOrderMap);
      }
      return false;
    }

    if (cmd === "fail" && parts[1]) {
      const found = resolveWorkstreamRef(parts[1]);
      if (!found || !found.ws) {
        console.log(
          `Unknown workstream: ${parts[1]} (use index 1…${state.workstreams.size}, [n], or workstream_id)`
        );
        return false;
      }

      const reason = parts.slice(2).join(" ") || undefined;
      const result = transitionState(found.id, "failed", state, reason);
      if (!result.success) {
        console.log(result.error);
      } else {
        console.log(`✗ ${found.ws.workstreamId} FAILED${reason ? `: ${reason}` : ""}`);
        printDashboard(state, mergeOrderMap);
      }
      return false;
    }

    const runNoSpace = trimmed.match(/^(run|aiexecute)\[(\d+)\]$/i);
    if (runNoSpace) {
      const verb = runNoSpace[1]!.toLowerCase();
      const n = runNoSpace[2]!;
      console.log(`Tip: add a space — use \`${verb} [${n}]\` or \`${verb} ${n}\`, not \`${verb}[${n}]\`.`);
      return false;
    }

    console.log(`Unknown command: ${cmd}`);
    console.log(
      "Commands: run <id> | aiexecute <id> | done <id> | fail <id> [reason] | status | exit"
    );
    return false;
  }

  const lineQueue: Array<string | undefined> = [];
  let lineResolve: ((value: string | undefined) => void) | null = null;

  rl.on("line", (line: string) => {
    if (lineResolve) {
      const resolve = lineResolve;
      lineResolve = null;
      resolve(line);
    } else {
      lineQueue.push(line);
    }
  });

  rl.on("close", () => {
    lineQueue.push(undefined);
    if (lineResolve) {
      const resolve = lineResolve;
      lineResolve = null;
      resolve(undefined);
    }
  });

  const nextLine = (): Promise<string | undefined> => {
    if (lineQueue.length > 0) {
      return Promise.resolve(lineQueue.shift());
    }
    return new Promise<string | undefined>((resolve) => {
      lineResolve = resolve;
    });
  };

  // Auto-execute all unblocked workstreams if enabled
  const shouldAutoExecute = options.auto || !!process.env.FORGE_EXECUTE_AUTO;
  if (shouldAutoExecute) {
    let executable = getExecutableWorkstreams(state);
    if (executable.length > 0) {
      console.log(`\n[AI] Auto-executing unblocked workstreams...`);
      console.log(
        "[AI] Progress: you should see lines for load → build prompt → call model → apply files per workstream. No working-tree changes until after the model returns."
      );
      while (executable.length > 0) {
        for (const ws of executable) {
          console.log(`\n[AI] Executing: ${ws.workstreamId}…`);
          const runResult = transitionState(ws.workstreamId, "running", state);
          if (!runResult.success) {
            console.log(`Cannot run ${ws.workstreamId}: ${runResult.error}`);
            continue;
          }
          const aiResult = await executeWorkstreamWithAI(ws.workstreamId, state, repoRoot);
          if (!aiResult.success) {
            transitionState(ws.workstreamId, "failed", state, aiResult.error);
            console.log(`✗ ${ws.workstreamId} FAILED (AI): ${aiResult.error}`);
            continue;
          }

          // Populate AI metadata on the workstream
          ws.aiModelUsed = aiResult.modelUsed;
          ws.aiChangesCount = aiResult.changes.length;
          ws.aiLinesAdded = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
          ws.aiLinesRemoved = aiResult.changes.reduce((sum, c) => sum + c.linesRemoved, 0);
          if (aiResult.promptHash) ws.aiPromptHash = aiResult.promptHash;
          if (aiResult.provider) ws.aiProvider = aiResult.provider;
          if (aiResult.executionDurationMs !== undefined) ws.aiExecutionDurationMs = aiResult.executionDurationMs;
          ws.changesMade = aiResult.changes.map((c) => ({
            file: c.path.startsWith("/") ? c.path : path.resolve(repoRoot, c.path),
            action: c.action,
            diffHash: "",
            linesAdded: c.linesAdded,
            linesRemoved: c.linesRemoved,
          }));

          for (const change of aiResult.changes) {
            const lines = change.linesAdded > 0 ? `+${change.linesAdded} lines` : "";
            const removed = change.linesRemoved > 0 ? `-${change.linesRemoved} lines` : "";
            console.log(`[AI] ${change.action}: ${change.path} (${[lines, removed].filter(Boolean).join(", ")})`);
          }
          const doneResult = transitionState(ws.workstreamId, "completed", state);
          if (!doneResult.success) {
            console.log(`✗ ${ws.workstreamId} COMPLETION REJECTED: ${doneResult.error}`);
            continue;
          }
          const totalChanges = aiResult.changes.length;
          const totalLines = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
          console.log(`✓ ${ws.workstreamId} COMPLETED (AI) — ${totalChanges} files changed, +${totalLines} lines`);
        }
        // Recompute executable workstreams after completing a batch —
        // previously blocked workstreams may now be unblocked
        executable = getExecutableWorkstreams(state);
      }
      printDashboard(state, mergeOrderMap);
      completed = true;
    } else {
      console.log("No unblocked workstreams to auto-execute.");
    }
  }

  while (!completed) {
    try {
      rl.prompt();
      const input = await nextLine();
      if (input === undefined || input === null) {
        completed = true;
      } else {
        completed = await processLine(input);
      }
    } catch (err) {
      console.error("Error processing input:", err);
    }
  }

  rl.close();

  let exitCode = 0;
  for (const ws of state.workstreams.values()) {
    if (ws.state === "failed") {
      exitCode = 1;
      break;
    }
  }
  if (exitCode === 0) {
    for (const ws of state.workstreams.values()) {
      if (ws.state === "queued" || ws.state === "running") {
        exitCode = 2;
        break;
      }
    }
  }

  const artifactPath = path.join(outputDir, "execute.json");
  const reportPath = path.join(outputDir, "execute-report.md");

  await fs.mkdir(outputDir, { recursive: true });

  try {
    if (process.env.FORGE_EXECUTE_DEBUG === "1") {
      const debugPath = path.join(outputDir, "execute-debug.json");
      await fs.writeFile(debugPath, JSON.stringify(state, null, 2), "utf-8");
      console.log(`Debug artifact written to ${debugPath}`);
    }

    const artifact = buildExecuteArtifact(state, SCHEMA_VERSION, FORGE_VERSION);
    await writeExecuteArtifact(artifactPath, artifact);

    const report = createExecuteReport(artifact);
    await fs.writeFile(reportPath, report, "utf-8");
    console.log(`Report written to ${reportPath}`);
  } catch (err) {
    console.error("Failed to write execute artifact:", err);
    return {
      status: "failed",
      summary: `Failed to write execute outputs: ${err instanceof Error ? err.message : String(err)}`,
      artifactPath,
      reportPath,
      outputRoot: outputDir,
      exitCode: 1,
    };
  }

  return {
    status: "ready",
    summary: buildSummary(state),
    artifactPath,
    reportPath,
    outputRoot: outputDir,
    exitCode,
  };
}
