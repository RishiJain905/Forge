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
import { executeWorkstream } from "./model-connector.js";

const SCHEMA_VERSION = "1.0.0";
const FORGE_VERSION = "0.0.1";

function getWorkstreamIndex(state: ExecuteState, id: string): number {
  return Array.from(state.workstreams.keys()).indexOf(id);
}

function printDashboard(state: ExecuteState, mergeOrderMap: Map<string, string[]>): void {
  console.log("\n=== Workstream Status ===");
  console.log("[id] workstream_id    state       blocked by / merge order");

  let index = 1;
  for (const [id, ws] of state.workstreams) {
    let blockedInfo: string;

    if (ws.state === "queued") {
      const requirements = getQueuedWorkstreamRequirements(id, mergeOrderMap);
      const unmet = requirements.filter((req) => !state.mergedWorkstreams.has(req));

      if (unmet.length === 0) {
        blockedInfo = "✓ ready";
      } else {
        blockedInfo = `waiting on: [${unmet.join(", ")}]`;
      }
    } else if (ws.state === "completed") {
      blockedInfo = "✓ merged";
    } else if (ws.state === "failed") {
      blockedInfo = ws.error ? `✗ failed: ${ws.error}` : "✗ failed";
    } else if (ws.state === "running") {
      blockedInfo = ws.aiModelUsed ? `✓ running (AI: ${ws.aiModelUsed})` : "✓ running (AI)";
    } else {
      blockedInfo = "";
    }

    console.log(
      `[${index}] ${ws.workstreamId.padEnd(14)} ${ws.state.padEnd(10)} ${blockedInfo}`
    );
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
  const completed = workstreams.filter((ws) => ws.state === "completed").length;
  const failed = workstreams.filter((ws) => ws.state === "failed").length;
  const running = workstreams.filter((ws) => ws.state === "running").length;
  const queued = workstreams.filter((ws) => ws.state === "queued").length;
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

    const { prompt } = await buildWorkstreamPrompt({
      workstreamId,
      splitArtifact,
      planArtifact,
      verifyArtifact,
      repoRoot,
    });

    const result = await executeWorkstream(prompt, repoRoot);

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
  const repoRoot = options.repo ?? process.cwd();
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
      state = restoreExecuteState(existingArtifact, splitJsonPath);
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

  const mergeOrderMap = new Map<string, string[]>();
  for (const sw of splitArtifact.workstreams) {
    mergeOrderMap.set(sw.id, sw.mergeOrderRequirements);
  }

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

  console.log("\nCommands: run <id> | aiexecute <id> | done <id> | fail <id> [reason] | status | exit");
  console.log("  run/aiexecute <id>: Execute workstream with AI (builds prompt, calls model, applies changes)");
  console.log("  done <id>:         Mark workstream as manually completed");
  console.log("  fail <id> [reason]: Mark workstream as failed");
  console.log("  status:            Show dashboard");
  console.log("  exit:              Exit REPL");
  console.log("\nAI execution requires FORGE_MODEL_PROVIDER and FORGE_MODEL_NAME env vars.");
  console.log("Optional: FORGE_MODEL_API_KEY, FORGE_MODEL_BASE_URL, FORGE_EXECUTE_AUTO");

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

    if ((cmd === "run" || cmd === "aiexecute") && parts[1]) {
      const found = findWorkstreamByIndex(parts[1]);
      if (!found || !found.ws) {
        console.log(`Unknown workstream: ${parts[1]}`);
        return false;
      }

      const ws = found.ws;
      const result = transitionState(found.id, "running", state);
      if (!result.success) {
        console.log(result.error);
        return false;
      }

      console.log(`[AI] Calling model for workstream: ${ws.workstreamId}...`);

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
      const found = findWorkstreamByIndex(parts[1]);
      if (!found || !found.ws) {
        console.log(`Unknown workstream: ${parts[1]}`);
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
      const found = findWorkstreamByIndex(parts[1]);
      if (!found || !found.ws) {
        console.log(`Unknown workstream: ${parts[1]}`);
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

    console.log(`Unknown command: ${cmd}`);
    console.log("Commands: run <id> | aiexecute <id> | done <id> | fail <id> [reason] | status | exit");
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
    const executable = getExecutableWorkstreams(state);
    if (executable.length > 0) {
      console.log(`\n[AI] Auto-executing ${executable.length} unblocked workstreams...`);
      for (const ws of executable) {
        console.log(`[AI] Executing: ${ws.workstreamId}...`);
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
        for (const change of aiResult.changes) {
          const lines = change.linesAdded > 0 ? `+${change.linesAdded} lines` : "";
          const removed = change.linesRemoved > 0 ? `-${change.linesRemoved} lines` : "";
          console.log(`[AI] ${change.action}: ${change.path} (${[lines, removed].filter(Boolean).join(", ")})`);
        }
        transitionState(ws.workstreamId, "completed", state);
        const totalChanges = aiResult.changes.length;
        const totalLines = aiResult.changes.reduce((sum, c) => sum + c.linesAdded, 0);
        console.log(`✓ ${ws.workstreamId} COMPLETED (AI) — ${totalChanges} files changed, +${totalLines} lines`);
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
      if (ws.state === "queued") {
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
