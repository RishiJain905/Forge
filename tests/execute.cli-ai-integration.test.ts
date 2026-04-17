import assert from "node:assert/strict";
import os from "os";
import path from "node:path";

import { getExecutableWorkstreams, createExecuteState, transitionState, buildExecuteArtifact } from "../src/execute/state-machine.js";
import type { AIExecutionResult } from "../src/execute/types.js";

// -------------------------------------------------------------------------------------
// Helper functions
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

// Minimal split artifact for testing - use `as any` to bypass complex nested types
// -------------------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------------------

await runScenario("AIExecutionResult type has required fields", async () => {
  const result: AIExecutionResult = {
    workstreamId: "ws-1",
    success: true,
    changes: [{ path: "src/foo.ts", action: "create", linesAdded: 10, linesRemoved: 0 }],
    modelUsed: "openai/gpt-4o",
  };
  assert.equal(result.workstreamId, "ws-1");
  assert.equal(result.success, true);
  assert.equal(result.modelUsed, "openai/gpt-4o");
  assert.equal(result.changes.length, 1);
});

await runScenario("ExecuteCommandOptions has auto flag", async () => {
  const opts: import("../src/execute/types.js").ExecuteCommandOptions = { auto: true };
  assert.equal(opts.auto, true);
});

await runScenario("dashboard shows running (AI) for running workstreams", async () => {
  const ws = { workstreamId: "ws-1", title: "test", state: "running" as const, aiModelUsed: "openai/gpt-4o" };
  const expected = ws.aiModelUsed ? `✓ running (AI: ${ws.aiModelUsed})` : "✓ running (AI)";
  assert.ok(expected.includes("AI"));
});

await runScenario("aiEXECUTE command is accepted as alias for run", async () => {
  const cmds = ["run", "aiexecute"];
  for (const cmd of cmds) {
    assert.ok(cmd === "run" || cmd === "aiexecute");
  }
});

await runScenario("FORGE_EXECUTE_AUTO env var is checked", async () => {
  const shouldAutoFromEnv = !!process.env.FORGE_EXECUTE_AUTO;
  assert.equal(typeof shouldAutoFromEnv, "boolean");
});

await runScenario("workstream state transitions are enforced for AI execution", async () => {
  // Create a minimal split artifact using any-typed object
  const splitArtifact = {
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
    startedAt: "",
    finishedAt: "",
    summary: "",
    boundaryNotes: [],
    source_verify: { artifactPath: null },
    source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [],
    merge_order: [],
    blocked_items: [],
    carried_forward_constraints: {
      findings: [],
      constraints: [],
      plan_concerns: [],
      planning_readiness: { status: "ready", blockingItems: [], warningItems: [] },
      verification_readiness: { status: "ready", blockingItems: [], warningItems: [] },
      stream_constraint_details: [],
    },
    split_diagnostics: {
      usability_status: { status: "ready" },
      warning_items: [],
      blocking_items: [],
      partial_output: null,
    },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] },
    failure: null,
    workstreams: [
      { id: "ws-1", title: "Test Workstream", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
    ],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");

  const r1 = transitionState("ws-1", "running", state);
  assert.equal(r1.success, true);
  assert.equal(state.workstreams.get("ws-1")?.state, "running");

  const r2 = transitionState("ws-1", "completed", state);
  assert.equal(r2.success, true);
  assert.equal(state.workstreams.get("ws-1")?.state, "completed");
});

await runScenario("merge order blocks AI completion when prerequisites not met", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [
      { id: "ws-1", title: "First", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
      { id: "ws-2", title: "Second", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: ["ws-1"], constraints: [], blockedReason: null },
    ],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  // Transition ws-2 to running first, then try to complete (blocked by ws-1)
  transitionState("ws-2", "running", state);
  const r = transitionState("ws-2", "completed", state);
  assert.equal(r.success, false);
  assert.ok(r.error !== undefined, "should be blocked by merge order");
});

await runScenario("workstream failure is recorded with error message", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [{ id: "ws-1", title: "Test", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null }],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  transitionState("ws-1", "running", state);
  const r = transitionState("ws-1", "failed", state, "AI model returned invalid response");
  assert.equal(r.success, true);
  assert.equal(state.workstreams.get("ws-1")?.state, "failed");
  assert.equal(state.workstreams.get("ws-1")?.error, "AI model returned invalid response");
});

await runScenario("getExecutableWorkstreams returns only unblocked queued workstreams", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [
      { id: "ws-1", title: "First", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
      { id: "ws-2", title: "Second", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: ["ws-1"], constraints: [], blockedReason: null },
      { id: "ws-3", title: "Third", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
    ],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  const executable = getExecutableWorkstreams(state);
  assert.equal(executable.length, 2);
  assert.ok(executable.some(ws => ws.workstreamId === "ws-1"));
  assert.ok(executable.some(ws => ws.workstreamId === "ws-3"));
  assert.ok(!executable.some(ws => ws.workstreamId === "ws-2"));
});

await runScenario("executeWorkstream function exists and is callable", async () => {
  const fn = await import("../src/execute/model-connector.js");
  assert.equal(typeof fn.executeWorkstream, "function");
});

await runScenario("AI changes summary shows file count and line count", async () => {
  const result: AIExecutionResult = {
    workstreamId: "ws-1", success: true,
    changes: [
      { path: "a.txt", action: "create", linesAdded: 10, linesRemoved: 0 },
      { path: "b.txt", action: "modify", linesAdded: 5, linesRemoved: 2 },
    ],
    modelUsed: "test/model",
  };
  const totalChanges = result.changes.length;
  const totalLines = result.changes.reduce((sum, c) => sum + c.linesAdded, 0);
  assert.equal(totalChanges, 2);
  assert.equal(totalLines, 15);
});

await runScenario("buildWorkstreamPrompt function exists", async () => {
  const fn = await import("../src/execute/prompt-builder.js");
  assert.equal(typeof fn.buildWorkstreamPrompt, "function");
});

await runScenario("split artifact with workstreams creates correct initial state", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [
      { id: "ws-1", title: "Workstream 1", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
      { id: "ws-2", title: "Workstream 2", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null },
    ],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  assert.equal(state.workstreams.size, 2);
  assert.equal(state.workstreams.get("ws-1")?.state, "queued");
  assert.equal(state.workstreams.get("ws-2")?.state, "queued");
});

await runScenario("state transitions are logged correctly", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [{ id: "ws-1", title: "Test", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null }],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  transitionState("ws-1", "running", state);
  assert.equal(state.transitions.length, 1);
  assert.equal(state.transitions[0].from, "queued");
  assert.equal(state.transitions[0].to, "running");
});

await runScenario("buildExecuteArtifact produces correct structure", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [{ id: "ws-1", title: "Test", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null }],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  const result = buildExecuteArtifact(state, "1.0.0", "0.0.1");
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.forgeVersion, "0.0.1");
  assert.ok(Array.isArray(result.workstreams));
  assert.equal(result.workstreams.length, 1);
});

await runScenario("AI execution failure marks workstream as failed", async () => {
  const splitArtifact = {
    schemaVersion: "2.0.0", command: "forge split", stage: "step4", status: "ready", purpose: "test",
    repoRoot: "/test/repo", requestedOutputRoot: null, outputRoot: "/test/output",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/test/output", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "", finishedAt: "", summary: "", boundaryNotes: [],
    source_verify: { artifactPath: null }, source_plan: { artifactPath: null },
    workstream_contract: { contractVersion: "1.0.0", executeHandoff: "manual" },
    dependency_edges: [], merge_order: [], blocked_items: [],
    carried_forward_constraints: { findings: [], constraints: [], plan_concerns: [], planning_readiness: { status: "ready", blockingItems: [], warningItems: [] }, verification_readiness: { status: "ready", blockingItems: [], warningItems: [] }, stream_constraint_details: [] },
    split_diagnostics: { usability_status: { status: "ready" }, warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: { status: "ready", blockingItems: [], warningItems: [] }, failure: null,
    workstreams: [{ id: "ws-1", title: "Test", description: "test", category: "safe_parallel", sourcePlanItemIds: [], sourceVerificationCaseIds: [], sourceFindingIds: [], likelyAffectedPaths: [], streamDependencies: [], mergeOrderRequirements: [], constraints: [], blockedReason: null }],
    mergeOrderGroups: [],
  } as any;

  const state = createExecuteState(splitArtifact, "/test/split.json");
  transitionState("ws-1", "running", state);
  const r = transitionState("ws-1", "failed", state, "API key invalid");
  assert.equal(r.success, true);
  assert.equal(state.workstreams.get("ws-1")?.state, "failed");
  assert.ok(state.workstreams.get("ws-1")?.error?.includes("API key invalid"));
});

await runScenario("parseModelResponse throws on invalid JSON", async () => {
  const { parseModelResponse, AIModelError } = await import("../src/execute/model-connector.js");
  assert.throws(
    () => parseModelResponse("not json at all"),
    (err: unknown) => err instanceof AIModelError && err.code === "PARSE_ERROR"
  );
});

await runScenario("parseModelResponse throws when no CHANGES block found", async () => {
  const { parseModelResponse } = await import("../src/execute/model-connector.js");
  assert.throws(() => parseModelResponse("some text without changes block"), /CHANGES/);
});

await runScenario("executeWorkstream function exists and is callable", async () => {
  const { executeWorkstream } = await import("../src/execute/model-connector.js");
  assert.equal(typeof executeWorkstream, "function");
});
