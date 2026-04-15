import { promises as fs } from "fs";
import path from "node:path";
import readline from "node:readline";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
} from "./state-machine.js";
import { validateSplitArtifact } from "../split/schema.js";
import type { ExecuteCommandOptions, ExecuteCommandResult } from "./types.js";
import type { ExecuteState } from "./state-machine.js";
import { writeExecuteArtifact } from "./artifact.js";
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

  return `Total: ${total}, Completed: ${completed}, Failed: ${failed}, Running: ${running}, Queued: ${queued}`;
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

  // 2. Initialize state
  const state = createExecuteState(splitArtifact, splitJsonPath);

  // Get the merge order requirements map from the state
  // We need to track which workstreams are waiting on which
  const mergeOrderMap = new Map<string, string[]>();
  for (const sw of splitArtifact.workstreams) {
    mergeOrderMap.set(sw.id, sw.mergeOrderRequirements);
  }

  // 3. Show welcome banner and initial dashboard
  printDashboard(state, mergeOrderMap);

  console.log("\nCommands: run <id> | done <id> | fail <id> [reason] | status | exit");

  // 4. Interactive read-eval-print loop
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

  // 5. Exit - write artifact
  const outputDir = options.outputDir ?? path.join(repoRoot, ".forge");
  const artifactPath = path.join(outputDir, "execute.json");

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const artifact = buildExecuteArtifact(state, SCHEMA_VERSION, FORGE_VERSION);
  await writeExecuteArtifact(artifactPath, artifact);

  const summary = buildSummary(state);
  return {
    status: "ready",
    summary,
    artifactPath,
    outputRoot: outputDir,
  };
}
