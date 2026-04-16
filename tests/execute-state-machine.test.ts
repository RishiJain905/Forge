import assert from "node:assert/strict";
import { ExecuteArtifactSchema } from "../src/execute/schema.js";
import type { ExecuteWorkstream } from "../src/execute/types.js";
import type { SplitArtifact, SplitWorkstream } from "../src/split/types.js";
import {
  createExecuteState,
  getWorkstream,
  transitionState,
  getExecutableWorkstreams,
  getBlockedWorkstreams,
  buildExecuteArtifact,
} from "../src/execute/state-machine.js";

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

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeSplitWorkstream(overrides: Partial<SplitWorkstream> & Pick<SplitWorkstream, "id" | "title">): SplitWorkstream {
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
    schemaVersion: "2.0.0",
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

// ---------------------------------------------------------------------------
// Scenario 1: createExecuteState initializes all workstreams to queued
// ---------------------------------------------------------------------------

await runScenario("createExecuteState initializes all workstreams to queued", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
      makeSplitWorkstream({ id: "ws-2", title: "API layer" }),
      makeSplitWorkstream({ id: "ws-3", title: "Database setup" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // All 3 workstreams exist with state="queued"
  assert.equal(state.workstreams.size, 3, "should have 3 workstreams");

  for (const [id, ws] of state.workstreams) {
    assert.equal(ws.state, "queued", `workstream ${id} should be queued`);
    assert.equal(ws.workstreamId, id, `workstream id key should match workstreamId field`);
  }

  assert.equal(state.workstreams.get("ws-1")!.title, "Auth module");
  assert.equal(state.workstreams.get("ws-2")!.title, "API layer");
  assert.equal(state.workstreams.get("ws-3")!.title, "Database setup");

  // mergedWorkstreams is empty
  assert.equal(state.mergedWorkstreams.size, 0, "mergedWorkstreams should be empty");

  // transitions is empty
  assert.equal(state.transitions.length, 0, "transitions should be empty");

  // splitSource matches the path arg
  assert.equal(state.splitSource, ".forge/split.json");
});

// ---------------------------------------------------------------------------
// Scenario 2: getWorkstream returns correct workstream by id
// ---------------------------------------------------------------------------

await runScenario("getWorkstream returns correct workstream by id", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
      makeSplitWorkstream({ id: "ws-2", title: "API layer" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const ws1 = getWorkstream("ws-1", state);
  assert.ok(ws1, "should find ws-1");
  assert.equal(ws1!.title, "Auth module");
  assert.equal(ws1!.workstreamId, "ws-1");
  assert.equal(ws1!.state, "queued");

  const ws2 = getWorkstream("ws-2", state);
  assert.ok(ws2, "should find ws-2");
  assert.equal(ws2!.title, "API layer");

  // Missing id returns undefined
  const missing = getWorkstream("ws-999", state);
  assert.equal(missing, undefined, "missing id should return undefined");
});

// ---------------------------------------------------------------------------
// Scenario 3: Valid transitions
// ---------------------------------------------------------------------------

await runScenario("queued→running succeeds with startedAt and logged transition", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const result = transitionState("ws-1", "running", state, "Starting work");
  assert.equal(result.success, true, "queued→running should succeed");
  assert.equal(result.error, undefined);

  const ws = getWorkstream("ws-1", state)!;
  assert.equal(ws.state, "running");
  assert.ok(ws.startedAt, "startedAt should be set");
  assert.equal(typeof ws.startedAt, "string");

  // Transition logged
  assert.equal(state.transitions.length, 1);
  const t = state.transitions[0];
  assert.equal(t.workstreamId, "ws-1");
  assert.equal(t.from, "queued");
  assert.equal(t.to, "running");
  assert.ok(t.timestamp, "transition should have a timestamp");
  assert.equal(t.reason, "Starting work");
});

await runScenario("running→failed succeeds with failedAt, error, and logged transition", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // First move to running
  transitionState("ws-1", "running", state);

  // Now fail it
  const result = transitionState("ws-1", "failed", state, "Module not found");
  assert.equal(result.success, true, "running→failed should succeed");

  const ws = getWorkstream("ws-1", state)!;
  assert.equal(ws.state, "failed");
  assert.ok(ws.failedAt, "failedAt should be set");
  assert.equal(ws.error, "Module not found");

  // Two transitions: queued→running, running→failed
  assert.equal(state.transitions.length, 2);
  const failTransition = state.transitions[1];
  assert.equal(failTransition.from, "running");
  assert.equal(failTransition.to, "failed");
  assert.equal(failTransition.reason, "Module not found");
});

await runScenario("blocked→running succeeds", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Blocked task" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Manually set the workstream state to "blocked"
  const ws = getWorkstream("ws-1", state)!;
  ws.state = "blocked";

  const result = transitionState("ws-1", "running", state, "Unblocked now");
  assert.equal(result.success, true, "blocked→running should succeed");

  assert.equal(getWorkstream("ws-1", state)!.state, "running");
  assert.ok(getWorkstream("ws-1", state)!.startedAt, "startedAt should be set after unblocking");
});

// ---------------------------------------------------------------------------
// Scenario 4: Invalid transitions are rejected
// ---------------------------------------------------------------------------

await runScenario("completed→running is rejected", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Move ws-1 to completed via queued→running→completed
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);

  const result = transitionState("ws-1", "running", state);
  assert.equal(result.success, false, "completed→running should be rejected");
  assert.ok(result.error, "should have an error message");
  assert.equal(typeof result.error, "string");
});

await runScenario("failed→queued is rejected", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Move ws-1 to failed via queued→running→failed
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "failed", state);

  const result = transitionState("ws-1", "queued", state);
  assert.equal(result.success, false, "failed→queued should be rejected");
  assert.ok(result.error, "should have an error message");
});

await runScenario("queued→completed is rejected (must go through running)", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth module" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const result = transitionState("ws-1", "completed", state);
  assert.equal(result.success, false, "queued→completed should be rejected");
  assert.ok(result.error, "should have an error message");
});

// ---------------------------------------------------------------------------
// Scenario 5: Merge order enforcement on completion
// ---------------------------------------------------------------------------

await runScenario("completing ws-2 succeeds when ws-1 is already merged", () => {
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

  // Complete ws-1 first
  transitionState("ws-1", "running", state);
  const ws1Complete = transitionState("ws-1", "completed", state);
  assert.equal(ws1Complete.success, true, "ws-1 queued→running→completed should succeed");

  // Now start and complete ws-2 — should succeed because ws-1 is merged
  transitionState("ws-2", "running", state);
  const ws2Complete = transitionState("ws-2", "completed", state);
  assert.equal(ws2Complete.success, true, "ws-2 should complete when ws-1 is already merged");

  // ws-1 should be in mergedWorkstreams
  assert.equal(state.mergedWorkstreams.has("ws-1"), true, "ws-1 should be in mergedWorkstreams");
});

await runScenario("completing ws-2 fails when ws-1 is not yet merged", () => {
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

  // Try to complete ws-2 WITHOUT completing ws-1 first
  transitionState("ws-2", "running", state);
  const result = transitionState("ws-2", "completed", state);
  assert.equal(result.success, false, "ws-2 should fail to complete without ws-1 merged");
  assert.ok(result.violations, "should have violations list");
  assert.deepEqual(result.violations, ["ws-1"], "violations should list ws-1");
});

// ---------------------------------------------------------------------------
// Scenario 6: getExecutableWorkstreams returns only ready workstreams
// ---------------------------------------------------------------------------

await runScenario("getExecutableWorkstreams returns only ready workstreams", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Independent A" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "Dependent on ws-1",
        mergeOrderRequirements: ["ws-1"],
      }),
      makeSplitWorkstream({ id: "ws-3", title: "Independent B" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Initially: ws-1 and ws-3 are executable, ws-2 is not
  let executable = getExecutableWorkstreams(state);
  const executableIds = executable.map((ws: ExecuteWorkstream) => ws.workstreamId).sort();
  assert.deepEqual(executableIds, ["ws-1", "ws-3"], "only ws-1 and ws-3 should be executable initially");

  // Complete ws-1
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);

  // Now ws-2 becomes executable (its prerequisite ws-1 is merged)
  executable = getExecutableWorkstreams(state);
  const executableIdsAfter = executable.map((ws: ExecuteWorkstream) => ws.workstreamId).sort();
  assert.deepEqual(
    executableIdsAfter,
    ["ws-2", "ws-3"],
    "ws-2 should become executable after ws-1 completes"
  );

  // Running/completed workstreams should NOT be returned
  // ws-1 is completed — not in executable list
  // ws-3 is queued — in executable list
  for (const ws of executable) {
    assert.notEqual(ws.state, "running", "running workstreams should not be in executable list");
    assert.notEqual(ws.state, "completed", "completed workstreams should not be in executable list");
  }
});

// ---------------------------------------------------------------------------
// Scenario 7: getBlockedWorkstreams returns workstreams with unmet prerequisites
// ---------------------------------------------------------------------------

await runScenario("getBlockedWorkstreams returns workstreams with unmet prerequisites", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Independent A" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "Dependent on ws-1",
        mergeOrderRequirements: ["ws-1"],
      }),
      makeSplitWorkstream({ id: "ws-3", title: "Independent B" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Initially: ws-2 is blocked (needs ws-1)
  let blocked = getBlockedWorkstreams(state);
  const blockedIds = blocked.map((ws: ExecuteWorkstream) => ws.workstreamId).sort();
  assert.deepEqual(blockedIds, ["ws-2"], "only ws-2 should be blocked initially");

  // Complete ws-1
  transitionState("ws-1", "running", state);
  transitionState("ws-1", "completed", state);

  // After ws-1 completes: ws-2 is no longer blocked
  blocked = getBlockedWorkstreams(state);
  assert.equal(blocked.length, 0, "no workstreams should be blocked after ws-1 completes");
});

// ---------------------------------------------------------------------------
// Scenario 8: buildExecuteArtifact produces valid artifact
// ---------------------------------------------------------------------------

await runScenario("buildExecuteArtifact produces valid artifact with correct summary and gates", () => {
  const splitArtifact = makeSplitArtifact({
    workstreams: [
      makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
      makeSplitWorkstream({
        id: "ws-2",
        title: "API",
        mergeOrderRequirements: ["ws-1"],
      }),
      makeSplitWorkstream({ id: "ws-3", title: "DB" }),
    ],
  });

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Apply some transitions
  transitionState("ws-1", "running", state, "start auth");
  transitionState("ws-1", "completed", state, "auth done");
  transitionState("ws-3", "running", state, "start db");
  transitionState("ws-3", "failed", state, "db crashed");

  const artifact = buildExecuteArtifact(state, "2.0.0", "0.1.0");

  // Validate with Zod schema — this throws if invalid
  const parsed = ExecuteArtifactSchema.parse(artifact);
  assert.ok(parsed, "artifact should pass Zod validation");

  // Check basic fields
  assert.equal(artifact.schemaVersion, "2.0.0");
  assert.equal(artifact.forgeVersion, "0.1.0");
  assert.equal(artifact.splitSource, ".forge/split.json");
  assert.ok(artifact.createdAt, "createdAt should be set");

  // Summary counts are correct
  assert.equal(artifact.summary.total, 3, "total should be 3");
  assert.equal(artifact.summary.queued, 1, "ws-2 is queued");
  assert.equal(artifact.summary.running, 0, "none running");
  assert.equal(artifact.summary.completed, 1, "ws-1 completed");
  assert.equal(artifact.summary.failed, 1, "ws-3 failed");
  assert.equal(artifact.summary.blocked, 0, "none blocked");

  // Workstreams should all be present
  assert.equal(artifact.workstreams.length, 3, "all 3 workstreams in artifact");

  // mergeOrderGates should reflect ws-2's dependency on ws-1
  assert.ok(artifact.mergeOrderGates.length >= 1, "should have at least one merge order gate");
  const ws2Gate = artifact.mergeOrderGates.find((g: { workstreamId: string; prerequisites: string[]; prerequisitesMet: boolean }) => g.workstreamId === "ws-2");
  assert.ok(ws2Gate, "should have a gate for ws-2");
  assert.deepEqual(ws2Gate!.prerequisites, ["ws-1"], "ws-2 gate prerequisites should be ws-1");
  assert.equal(ws2Gate!.prerequisitesMet, true, "ws-1 is merged so ws-2 gate is met");
});
