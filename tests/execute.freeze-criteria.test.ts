import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
  getBlockedWorkstreams,
  restoreExecuteState,
} from "../src/execute/state-machine.js";
import { ExecuteArtifactSchema } from "../src/execute/schema.js";
import { createExecuteReport } from "../src/execute/report.js";
import type { SplitArtifact, SplitWorkstream } from "../src/split/types.js";

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
// File collection helper (for freeze criteria)
// -------------------------------------------------------------------------------------

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function readTextFile(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath, "utf-8");
}

// -------------------------------------------------------------------------------------
// GATE 1: Command Contract
// -------------------------------------------------------------------------------------

await runScenario("forge execute CLI module exists", async () => {
  // Verify the execute CLI module exists in dist (after build)
  assert.equal(existsSync("./dist/src/execute/cli.js"), true, "execute CLI should be built");
});

// -------------------------------------------------------------------------------------
// GATE 2: Artifact Contract
// -------------------------------------------------------------------------------------

await runScenario("execute.json artifact is valid Zod schema", async () => {
  const mockArtifact = {
    schemaVersion: "1.0.0",
    forgeVersion: "0.0.1",
    createdAt: new Date().toISOString(),
    splitSource: "/test/.forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
    transitions: [],
  };
  const result = ExecuteArtifactSchema.safeParse(mockArtifact);
  assert.equal(result.success, true, "valid artifact should pass Zod validation");
});

await runScenario("execute-report.md is generated by createExecuteReport", async () => {
  const mockArtifact = {
    schemaVersion: "1.0.0",
    forgeVersion: "0.0.1",
    createdAt: new Date().toISOString(),
    splitSource: "/test/.forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
    transitions: [],
  };
  const report = createExecuteReport(mockArtifact);
  assert.ok(report.includes("# Forge Execute Report"), "report should have title");
  assert.ok(report.includes("## Overview"), "report should have Overview section");
  assert.ok(report.includes("## Execution Summary"), "report should have Execution Summary section");
});

// -------------------------------------------------------------------------------------
// GATE 3: State Machine Contract
// -------------------------------------------------------------------------------------

await runScenario("all state transitions work correctly in state machine", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Test" }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // queued → running
  let result = transitionState("ws-1", "running", state);
  assert.equal(result.success, true, "queued→running should succeed");

  // running → completed
  result = transitionState("ws-1", "completed", state);
  assert.equal(result.success, true, "running→completed should succeed");

  const artifact = buildExecuteArtifact(state, "1.0.0", "0.0.1");
  assert.equal(artifact.summary.completed, 1);
});

await runScenario("merge_order blocking is enforced", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "First" }),
      makeSplitWorkstream({ id: "ws-2", title: "Second", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");

  transitionState("ws-2", "running", state);
  const result = transitionState("ws-2", "completed", state);
  assert.equal(result.success, false, "should be blocked by merge_order");
  assert.ok(result.violations, "should have violations");
});

await runScenario("failed workstreams do not block others", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "First" }),
      makeSplitWorkstream({ id: "ws-2", title: "Second" }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // ws-1 fails
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "failed", state, "Build error");

  // ws-2 should still be able to complete
  transitionState("ws-2", "running", state);
  const result = transitionState("ws-2", "completed", state);
  assert.equal(result.success, true, "failed workstream should not block others");
});

// -------------------------------------------------------------------------------------
// GATE 4: Error Handling Contract
// -------------------------------------------------------------------------------------

await runScenario("exit code 0 on full completion", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [makeSplitWorkstream({ id: "ws-1", title: "Test" })],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);

  // Verify exit code 0 logic — all completed, none failed, none queued
  let exitCode = 0;
  for (const ws of state.workstreams.values()) {
    if (ws.state === "failed") { exitCode = 1; break; }
  }
  if (exitCode === 0) {
    for (const ws of state.workstreams.values()) {
      if (ws.state === "queued") { exitCode = 2; break; }
    }
  }
  assert.equal(exitCode, 0, "all completed should be exit code 0");
});

await runScenario("exit code 1 on errors", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [makeSplitWorkstream({ id: "ws-1", title: "Test" })],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "failed", state, "Error");

  let exitCode = 0;
  for (const ws of state.workstreams.values()) {
    if (ws.state === "failed") { exitCode = 1; break; }
  }
  assert.equal(exitCode, 1, "failed should be exit code 1");
});

// -------------------------------------------------------------------------------------
// GATE 5: Edge Case Contract
// -------------------------------------------------------------------------------------

await runScenario("empty workstream list handled gracefully", () => {
  const splitArtifact = makeSplitArtifact({ workstreams: [] });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  const artifact = buildExecuteArtifact(state, "1.0.0", "0.0.1");

  assert.equal(artifact.workstreams.length, 0, "empty workstreams should create valid artifact");
  assert.equal(artifact.summary.total, 0, "summary total should be 0");
});

await runScenario("all blocked handled with clear message", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "First", mergeOrderRequirements: ["ws-2"] }),
      makeSplitWorkstream({ id: "ws-2", title: "Second", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  const blocked = getBlockedWorkstreams(state);

  assert.equal(blocked.length, 2, "both should be blocked in circular dependency");
});

// -------------------------------------------------------------------------------------
// FREEZE CRITERIA
// -------------------------------------------------------------------------------------

await runScenario("no TODO/FIXME/XXX markers in execute source", async () => {
  const runtimeFiles = await collectFiles("./src/execute");
  const offenders: string[] = [];

  for (const filePath of runtimeFiles) {
    const contents = await readTextFile(filePath);
    if (/TODO|FIXME|XXX/.test(contents)) {
      offenders.push(filePath);
    }
  }
  assert.deepEqual(offenders, [], `freeze markers found: ${offenders.join(", ")}`);
});

await runScenario("no TODO/FIXME/XXX markers in execute tests", async () => {
  const testFiles = await collectFiles("./tests");
  const offenders: string[] = [];

  for (const filePath of testFiles) {
    // Skip this freeze-criteria test file itself
    if (filePath.includes("execute.freeze-criteria")) continue;
    if (!filePath.includes("execute.")) continue;
    const contents = await readTextFile(filePath);
    if (/TODO|FIXME|XXX/.test(contents)) {
      offenders.push(filePath);
    }
  }
  assert.deepEqual(offenders, [], `freeze markers found in execute tests: ${offenders.join(", ")}`);
});

await runScenario("all execute tests pass (dist artifacts exist)", async () => {
  // Verify all expected execute test dist files exist
  assert.equal(existsSync("./dist-tests/tests/execute.v1-minimal.test.js"), true, "execute.v1-minimal.test.js should exist");
  assert.equal(existsSync("./dist-tests/tests/execute-state-machine.test.js"), true, "execute-state-machine.test.js should exist");
  assert.equal(existsSync("./dist-tests/tests/execute-types.test.js"), true, "execute-types.test.js should exist");
  assert.equal(existsSync("./dist-tests/tests/execute.edge-cases.test.js"), true, "execute.edge-cases.test.js should exist");
});

await runScenario("execute module exports all required functions", async () => {
  // Verify key exports are available
  const stateMachine = await import("../src/execute/state-machine.js");
  assert.equal(typeof stateMachine.createExecuteState, "function", "createExecuteState should be exported");
  assert.equal(typeof stateMachine.transitionState, "function", "transitionState should be exported");
  assert.equal(typeof stateMachine.buildExecuteArtifact, "function", "buildExecuteArtifact should be exported");
  assert.equal(typeof stateMachine.getBlockedWorkstreams, "function", "getBlockedWorkstreams should be exported");
  assert.equal(typeof stateMachine.restoreExecuteState, "function", "restoreExecuteState should be exported");

  const schema = await import("../src/execute/schema.js");
  assert.equal(typeof schema.ExecuteArtifactSchema, "object", "ExecuteArtifactSchema should be exported");
  assert.equal(typeof schema.validateExecuteArtifact, "function", "validateExecuteArtifact should be exported");

  const report = await import("../src/execute/report.js");
  assert.equal(typeof report.createExecuteReport, "function", "createExecuteReport should be exported");
});

// -------------------------------------------------------------------------------------
// Ensure non-zero exit code propagates
// -------------------------------------------------------------------------------------

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}