import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "node:path";
import { Readable } from "node:stream";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
} from "../src/execute/state-machine.js";
import { writeExecuteArtifact } from "../src/execute/artifact.js";
import { ExecuteArtifactSchema } from "../src/execute/schema.js";
import type { SplitArtifact, SplitWorkstream } from "../src/split/types.js";
import type { ExecuteState } from "../src/execute/state-machine.js";

// -------------------------------------------------------------------------------------
// Helper functions
// -------------------------------------------------------------------------------------

function makeSplitWorkstream(
  overrides: Partial<SplitWorkstream> & Pick<SplitWorkstream, "id" | "title">
): SplitWorkstream {
  return {
    description: `Workstream ${overrides.id}`,
    category: "safe_parallel" as const,
    sourcePlanItemIds: [],
    sourceVerificationCaseIds: [],
    sourceFindingIds: [],
    likelyAffectedPaths: [],
    streamDependencies: [],
    mergeOrderRequirements: [],
    constraints: [],
    blockedReason: null,
    ...overrides,
  };
}

function makeSplitArtifact(overrides?: Partial<SplitArtifact>): SplitArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "forge split",
    stage: "step4",
    status: "ready",
    purpose: "test",
    repoRoot: "/test/repo",
    requestedOutputRoot: null,
    outputRoot: "/test/output",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: "/test/output",
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: {
      artifactPath: null,
      reportPath: null,
      debugArtifactPath: "",
      debugWorkstreamsPath: "",
      debugMergeOrderPath: "",
      debugBlockedItemsPath: "",
      debugStreamConstraintsPath: "",
      debugReadinessPath: "",
    },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:01:00.000Z",
    summary: "test",
    boundaryNotes: [],
    source_verify: {} as any,
    source_plan: {} as any,
    workstream_contract: {
      requiredFields: ["id", "title"],
      categories: ["safe_parallel" as const],
      constraintSources: ["dependency_graph" as const],
    },
    workstreams: [],
    dependency_edges: [],
    merge_order: [],
    blocked_items: [],
    carried_forward_constraints: {} as any,
    split_diagnostics: {
      usability_status: "actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
    },
    split_readiness: {
      ready: true,
      status: "ready",
      summary: "",
      execution_scope: "all_streams" as const,
      blocked_workstream_count: 0,
      partially_blocked_item_count: 0,
      merge_order_rule_count: 0,
      later_step_gate: "proceed",
      material_execution_limits: [],
      warning_items: [],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: [],
      recommended_user_actions: [],
    },
    failure: null,
    ...overrides,
  };
}

// -------------------------------------------------------------------------------------
// Test scenario runner
// -------------------------------------------------------------------------------------

async function runScenario(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------------------------------
// Scenario 1: done <id> is blocked when merge_order not satisfied
// -------------------------------------------------------------------------------------

await runScenario("done <id> is blocked when merge_order not satisfied", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "Dependent",
        mergeOrderRequirements: ["ws-1"],
      }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Start and try to complete ws-2 WITHOUT completing ws-1
  transitionState("ws-2", "running", state);
  const result = transitionState("ws-2", "completed", state);

  assert.equal(result.success, false, "ws-2 should NOT be able to complete when ws-1 is not merged");
  assert.ok(result.violations, "should have violations");
  assert.deepEqual(result.violations, ["ws-1"], "violations should list ws-1");

  // ws-2 state should still be "running"
  const ws2 = state.workstreams.get("ws-2")!;
  assert.equal(ws2.state, "running", "ws-2 should remain in running state");

  // ws-1 should NOT be in mergedWorkstreams
  assert.equal(state.mergedWorkstreams.has("ws-1"), false, "ws-1 should not be merged");
});

// -------------------------------------------------------------------------------------
// Scenario 2: done <id> succeeds when merge_order satisfied
// -------------------------------------------------------------------------------------

await runScenario("done <id> succeeds when merge_order satisfied", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "Dependent",
        mergeOrderRequirements: ["ws-1"],
      }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Complete ws-1 first (run + done)
  transitionState("ws-1", "running", state);
  const ws1Result = transitionState("ws-1", "completed", state);
  assert.equal(ws1Result.success, true, "ws-1 should complete successfully");

  // ws-1 is now merged
  assert.equal(state.mergedWorkstreams.has("ws-1"), true, "ws-1 should be in mergedWorkstreams");

  // Now ws-2 can complete
  transitionState("ws-2", "running", state);
  const ws2Result = transitionState("ws-2", "completed", state);
  assert.equal(ws2Result.success, true, "ws-2 should complete when ws-1 is merged");

  const ws2 = state.workstreams.get("ws-2")!;
  assert.equal(ws2.state, "completed", "ws-2 should be completed");
  assert.ok(ws2.completedAt, "ws-2 should have completedAt timestamp");

  // Both should be merged
  assert.equal(state.mergedWorkstreams.has("ws-1"), true, "ws-1 still merged");
  assert.equal(state.mergedWorkstreams.has("ws-2"), true, "ws-2 now merged");
});

// -------------------------------------------------------------------------------------
// Scenario 3: writeExecuteArtifact writes valid JSON to temp file
// -------------------------------------------------------------------------------------

await runScenario("writeExecuteArtifact writes valid JSON to temp file", async () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
      makeSplitWorkstream({ id: "ws-2", title: "API layer" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Apply some transitions
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);
  transitionState("ws-2", "running", state);

  // Write artifact to temp file
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-execute-test-"));
  const artifactPath = path.join(tmpDir, "execute.json");

  await writeExecuteArtifact(state, artifactPath);

  // Verify file exists
  const exists = await fs.access(artifactPath).then(() => true).catch(() => false);
  assert.equal(exists, true, "execute.json should be created");

  // Read and parse
  const content = await fs.readFile(artifactPath, "utf-8");
  const parsed = JSON.parse(content);

  // Validate against schema
  const validated = ExecuteArtifactSchema.parse(parsed);
  assert.ok(validated, "artifact should pass Zod validation");

  // Verify required fields
  assert.equal(validated.schemaVersion, "1.0.0");
  assert.equal(validated.forgeVersion, "0.0.1");
  assert.ok(validated.createdAt, "should have createdAt");
  assert.equal(validated.splitSource, ".forge/split.json");
  assert.equal(validated.workstreams.length, 2, "should have 2 workstreams");
  assert.ok(Array.isArray(validated.mergeOrderGates), "mergeOrderGates should be array");
  assert.ok(validated.summary, "should have summary");

  // Clean up
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -------------------------------------------------------------------------------------
// Scenario 4: execute.json artifact has correct structure
// -------------------------------------------------------------------------------------

await runScenario("execute.json artifact has correct structure", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "Dependent",
        mergeOrderRequirements: ["ws-1"],
      }),
      makeSplitWorkstream({ id: "ws-3", title: "Independent" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Add transitions: ws-1 completes, ws-3 fails
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);
  transitionState("ws-3", "running", state);
  transitionState("ws-3", "failed", state, "Build error");

  // Build artifact
  const artifact = buildExecuteArtifact(state, "1.0.0", "0.1.0");

  // Validate structure
  assert.equal(artifact.schemaVersion, "1.0.0");
  assert.equal(artifact.forgeVersion, "0.1.0");
  assert.ok(artifact.createdAt, "createdAt should be set");
  assert.equal(artifact.splitSource, ".forge/split.json");

  // Workstreams
  assert.equal(artifact.workstreams.length, 3, "should have 3 workstreams");

  // Summary counts
  assert.equal(artifact.summary.total, 3);
  assert.equal(artifact.summary.completed, 1, "ws-1 completed");
  assert.equal(artifact.summary.failed, 1, "ws-3 failed");
  assert.equal(artifact.summary.running, 0, "none running");
  assert.equal(artifact.summary.queued, 1, "ws-2 still queued");

  // Merge order gates
  const ws2Gate = artifact.mergeOrderGates.find((g) => g.workstreamId === "ws-2");
  assert.ok(ws2Gate, "ws-2 should have merge order gate");
  assert.deepEqual(ws2Gate!.prerequisites, ["ws-1"]);
  assert.equal(ws2Gate!.prerequisitesMet, true, "ws-1 is merged so prerequisites met");

  // Transition log
  assert.ok(artifact.transitions, "artifact should include transitions");
  const completedTransition = artifact.transitions.find((t) => t.workstreamId === "ws-1" && t.to === "completed");
  assert.ok(completedTransition, "ws-1 completion should be logged");
});

// -------------------------------------------------------------------------------------
// Scenario 5: CLI flow - runExecuteCommand reads split.json and initializes state
// We test this by creating a temp dir with split.json and verifying it loads correctly
// -------------------------------------------------------------------------------------

await runScenario("runExecuteCommand loads split.json and initializes state", async () => {
  // Create temp directory with .forge/split.json
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-cli-test-"));
  const forgeDir = path.join(tmpDir, ".forge");
  await fs.mkdir(forgeDir, { recursive: true });

  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
      makeSplitWorkstream({ id: "ws-2", title: "API" }),
    ],
  });

  const splitJsonPath = path.join(forgeDir, "split.json");
  await fs.writeFile(splitJsonPath, JSON.stringify(splitArtifact, null, 2));

  // Import runExecuteCommand - but we can't easily test it without mocking stdin
  // Instead, verify the split.json is loadable by createExecuteState
  const content = await fs.readFile(splitJsonPath, "utf-8");
  const parsed = JSON.parse(content);
  const state = createExecuteState(parsed, splitJsonPath);

  assert.equal(state.workstreams.size, 2, "should have 2 workstreams");
  assert.ok(state.workstreams.has("ws-1"), "ws-1 should exist");
  assert.ok(state.workstreams.has("ws-2"), "ws-2 should exist");

  // All should be queued
  assert.equal(state.workstreams.get("ws-1")!.state, "queued");
  assert.equal(state.workstreams.get("ws-2")!.state, "queued");

  // Clean up
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -------------------------------------------------------------------------------------
// Scenario 6: CLI flow with mock input via readable stream
// -------------------------------------------------------------------------------------

await runScenario("runExecuteCommand exits cleanly with 'exit' command", async () => {
  // Create temp directory with .forge/split.json
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-cli-test-"));
  const forgeDir = path.join(tmpDir, ".forge");
  await fs.mkdir(forgeDir, { recursive: true });

  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
      makeSplitWorkstream({ id: "ws-2", title: "API" }),
    ],
  });

  const splitJsonPath = path.join(forgeDir, "split.json");
  await fs.writeFile(splitJsonPath, JSON.stringify(splitArtifact, null, 2));

  // We need to mock process.stdin to simulate "exit" command
  // Since runExecuteCommand uses readline.createInterface with process.stdin,
  // we can verify it loads the split.json and exits without error by testing
  // the underlying functions directly

  // For a true integration test, we'd need to swap process.stdin, but that's complex
  // Instead, we verify the CLI can load from the temp repo and build the artifact

  // Import and test that the function works
  const { runExecuteCommand } = await import("../src/execute/cli.js");

  // Create a mock readable with "exit" command
  const inputStream = Readable.from(["exit\n"]);

  // Save original stdin
  const originalStdin = process.stdin;

  // Replace stdin with our mock
  // @ts-expect-error - we need to mock stdin for testing
  process.stdin = inputStream;

  try {
    // This will read from mocked stdin and exit immediately
    // We set a timeout because the mock input should cause immediate exit
    const result = await Promise.race([
      runExecuteCommand({ repo: tmpDir }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);

    // If we get here with a result, the CLI loaded and exited correctly
    assert.ok(result, "should return a result");
    assert.equal(result.status, "ready", "status should be ready");
    assert.ok(result.artifactPath, "should have artifact path");

    // Verify artifact was written
    const artifactExists = await fs.access(result.artifactPath).then(() => true).catch(() => false);
    assert.equal(artifactExists, true, "execute.json should be written");

    // Verify artifact content
    const content = await fs.readFile(result.artifactPath, "utf-8");
    const parsed = JSON.parse(content);
    assert.equal(parsed.schemaVersion, "1.0.0");
  } finally {
    // Restore stdin
    process.stdin = originalStdin;
    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});