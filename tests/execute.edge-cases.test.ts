import assert from "node:assert/strict";

import {
  createExecuteState,
  transitionState,
  buildExecuteArtifact,
  restoreExecuteState,
  getBlockedWorkstreams,
} from "../src/execute/state-machine.js";
import type { SplitArtifact, SplitWorkstream } from "../src/split/types.js";

// -------------------------------------------------------------------------------------
// Helper functions (copied from execute.v1-minimal.test.ts)
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
// Test 1: restoreExecuteState restores completed workstreams
// -------------------------------------------------------------------------------------

await runScenario("restoreExecuteState restores completed workstreams as merged", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({ id: "ws-2", title: "API", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const originalState = createExecuteState(splitArtifact, ".forge/split.json");
  transitionState("ws-1", "running", originalState);
  transitionState("ws-1", "completed", originalState);
  transitionState("ws-2", "running", originalState);
  const artifact = buildExecuteArtifact(originalState, "1.0.0", "0.0.1");

  const restored = restoreExecuteState(artifact, ".forge/split.json");

  assert.equal(restored.workstreams.get("ws-1")?.state, "completed");
  assert.equal(restored.mergedWorkstreams.has("ws-1"), true);
  assert.equal(restored.workstreams.get("ws-2")?.state, "running");
  assert.equal(restored.mergedWorkstreams.has("ws-2"), false);
});

// -------------------------------------------------------------------------------------
// Test 2: restoreExecuteState preserves merge order gates
// -------------------------------------------------------------------------------------

await runScenario("restoreExecuteState preserves merge order gates", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({ id: "ws-2", title: "API", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const originalState = createExecuteState(splitArtifact, ".forge/split.json");
  const artifact = buildExecuteArtifact(originalState, "1.0.0", "0.0.1");

  const restored = restoreExecuteState(artifact, ".forge/split.json");

  // ws-2 should still be blocked (merge order not met)
  // First transition to running (queued->running is always valid)
  transitionState("ws-2", "running", restored);
  // Then try to complete - should be blocked by merge order
  const ws2Result = transitionState("ws-2", "completed", restored);
  assert.equal(ws2Result.success, false, "ws-2 should still be blocked after restore");
  assert.ok(ws2Result.violations, "should have violations");
  assert.deepEqual(ws2Result.violations, ["ws-1"]);
});

// -------------------------------------------------------------------------------------
// Test 3: empty workstream artifact has correct structure
// -------------------------------------------------------------------------------------

await runScenario("empty workstream artifact has correct structure", () => {
  const splitArtifact = makeSplitArtifact({ workstreams: [] });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  const artifact = buildExecuteArtifact(state, "1.0.0", "0.0.1");

  assert.equal(artifact.workstreams.length, 0);
  assert.equal(artifact.summary.total, 0);
  assert.equal(artifact.summary.completed, 0);
  assert.equal(artifact.summary.blocked, 0);
});

// -------------------------------------------------------------------------------------
// Test 4: getBlockedWorkstreams returns correct blocked workstreams
// -------------------------------------------------------------------------------------

await runScenario("getBlockedWorkstreams returns only workstreams with unmet merge order", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({ id: "ws-2", title: "API", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const blocked = getBlockedWorkstreams(state);

  // ws-1 should NOT be blocked (no merge order requirements)
  const ws1Blocked = blocked.find((w) => w.workstreamId === "ws-1");
  assert.equal(ws1Blocked, undefined, "ws-1 should not be blocked");

  // ws-2 SHOULD be blocked
  const ws2Blocked = blocked.find((w) => w.workstreamId === "ws-2");
  assert.ok(ws2Blocked, "ws-2 should be blocked");
});

// -------------------------------------------------------------------------------------
// Test 5: partial completion summary counts correctly
// -------------------------------------------------------------------------------------

await runScenario("buildExecuteArtifact summary counts partial completion correctly", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Foundation" }),
      makeSplitWorkstream({ id: "ws-2", title: "API" }),
      makeSplitWorkstream({ id: "ws-3", title: "UI" }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);
  transitionState("ws-2", "running", state);
  // ws-3 stays queued

  const artifact = buildExecuteArtifact(state, "1.0.0", "0.0.1");

  assert.equal(artifact.summary.total, 3);
  assert.equal(artifact.summary.completed, 1);
  assert.equal(artifact.summary.running, 1);
  assert.equal(artifact.summary.queued, 1);
  assert.equal(artifact.summary.failed, 0);
});

// -------------------------------------------------------------------------------------
// Test 6: all blocked scenario detected
// -------------------------------------------------------------------------------------

await runScenario("all blocked detection when every workstream has unmet merge order", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "First", mergeOrderRequirements: ["ws-2"] }),
      makeSplitWorkstream({ id: "ws-2", title: "Second", mergeOrderRequirements: ["ws-1"] }),
    ],
  });
  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const blocked = getBlockedWorkstreams(state);
  assert.equal(blocked.length, 2, "both workstreams should be blocked");
});
