import { promises as fs } from "fs";
import path from "node:path";
import readline from "node:readline";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
  getBlockedWorkstreams,
  restoreExecuteState,
} from "./state-machine.js";
import { validateSplitArtifact } from "../split/schema.js";
import type {
  ExecuteCommandOptions,
  ExecuteCommandResult,
  ExecuteArtifact,
} from "./types.js";
import type { ExecuteState } from "./state-machine.js";
import { writeExecuteArtifact } from "./artifact.js";
import { createExecuteReport } from "./report.js";
import type { SplitArtifact } from "../split/types.js";

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
      // Check if ready based on merge order requirements
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
      blockedInfo = "✓ ready";
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

export async function runExecuteCommand(
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  const repoRoot = options.repo ?? process.cwd();
  const splitJsonPath = path.join(repoRoot, ".forge", "split.json");

  // 1. Read split.json
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
    // Parse/validation error
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
    // Generic error
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

  // 2. Initialize state - check for existing execute.json first
  const outputDir = options.outputDir ?? path.join(repoRoot, ".forge");
  const executePath = path.join(outputDir, "execute.json");
  let state: ExecuteState;

  try {
    const existingContent = await fs.readFile(executePath, "utf-8");
    let existingArtifact: ExecuteArtifact;
    try {
      existingArtifact = JSON.parse(existingContent) as ExecuteArtifact;
    } catch {
      // Corrupt execute.json
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
    // Only treat ENOENT as "no existing state, start fresh"
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT") {
      state = createExecuteState(splitArtifact, splitJsonPath);
    } else {
      // Unexpected error reading execute.json
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

  // Get the merge order requirements map from the state
  // We need to track which workstreams are waiting on which
  const mergeOrderMap = new Map<string, string[]>();
  for (const sw of splitArtifact.workstreams) {
    mergeOrderMap.set(sw.id, sw.mergeOrderRequirements);
  }

  // 3. Early edge-case checks before entering REPL

  // Edge case 1: Empty workstream list
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

  // Edge case 2: All workstreams are blocked
  const blocked = getBlockedWorkstreams(state);
  if (blocked.length === state.workstreams.size && state.workstreams.size > 0) {
    console.error("All workstreams are blocked by merge_order constraints.");
    console.error("Check that upstream dependencies have been completed first.");
  }

  // 4. Show welcome banner and initial dashboard
  printDashboard(state, mergeOrderMap);

  console.log("\nCommands: run <id> | done <id> | fail <id> [reason] | status | exit");

  // 5. Interactive read-eval-print loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  let completed = false;
  let exitResult: ExecuteCommandResult | null = null;

  // Helper to find workstream by index (1-based)
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

  // Helper to get unmet requirements for a queued workstream
  function getUnmet(id: string): string[] {
    const requirements = mergeOrderMap.get(id) ?? [];
    return requirements.filter((req) => !state.mergedWorkstreams.has(req));
  }

  // Helper to get index display string for workstream
  function getIndexForId(id: string): number {
    return Array.from(state.workstreams.keys()).indexOf(id) + 1;
  }

  // Process a command line
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
      const found = findWorkstreamByIndex(parts[1]);
      if (!found || !found.ws) {
        console.log(`Unknown workstream: ${parts[1]}`);
        return false;
      }

      const result = transitionState(found.id, "running", state);
      if (!result.success) {
        console.log(result.error);
      } else {
        console.log(`✓ ${found.ws.workstreamId} STARTED`);
        printDashboard(state, mergeOrderMap);
      }
      return false;
    }

    if (cmd === "done" && parts[1]) {
      const found = findWorkstreamByIndex(parts[1]);
      if (!found || !found.ws) {
        console.log(`Unknown workstream: ${parts[1]}`);
        return false;
      }

      // Snapshot which queued workstreams are currently blocked (unmet.length>0)
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
        // Compute newly unblocked (was blocked before, now not)
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
    console.log("Commands: run <id> | done <id> | fail <id> [reason] | status | exit");
    return false;
  }

  // promisify the rl.question for async/await
  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  // Main interactive loop
  while (!completed) {
    try {
      rl.prompt();
      const input = await question("");
      completed = await processLine(input);
    } catch (err) {
      console.error("Error processing input:", err);
    }
  }

  rl.close();

  // 5. Determine exit code based on final state
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

  // 6. Exit - write artifact
  const artifactPath = path.join(outputDir, "execute.json");
  const reportPath = path.join(outputDir, "execute-report.md");

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Edge case 5: FORGE_EXECUTE_DEBUG=1
    if (process.env.FORGE_EXECUTE_DEBUG === "1") {
      const debugPath = path.join(outputDir, "execute-debug.json");
      await fs.writeFile(debugPath, JSON.stringify(state, null, 2), "utf-8");
      console.log(`Debug artifact written to ${debugPath}`);
    }

    const artifact = buildExecuteArtifact(state, SCHEMA_VERSION, FORGE_VERSION);
    await writeExecuteArtifact(artifactPath, artifact);

    // Write human-readable report
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

  const summary = buildSummary(state);
  return {
    status: "ready",
    summary,
    artifactPath,
    reportPath,
    outputRoot: outputDir,
    exitCode,
  };
}
