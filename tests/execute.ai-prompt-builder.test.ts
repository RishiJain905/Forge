import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";

import { buildWorkstreamPrompt, getTargetFileContents } from "../src/execute/prompt-builder.js";
import type { SplitArtifact } from "../src/split/types.js";
import type { PlanArtifact } from "../src/plan/types.js";
import type { VerifyArtifact } from "../src/verify/types.js";

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
// Minimal test fixtures — using `as any` for deeply nested intake-origin types
// that are not under test. Top-level structure must match real artifact shapes.
// ---------------------------------------------------------------------------

function makeSplitArtifact(workstreams: SplitArtifact["workstreams"]): SplitArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "split",
    stage: "split",
    status: "ready",
    purpose: "test",
    repoRoot: "/tmp/test",
    requestedOutputRoot: null,
    outputRoot: "/tmp/test",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/tmp", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugWorkstreamsPath: "", debugMergeOrderPath: "", debugBlockedItemsPath: "", debugStreamConstraintsPath: "", debugReadinessPath: "" },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:00.000Z",
    summary: "test",
    boundaryNotes: [],
    source_verify: {
      artifactPath: "",
      command: "verify",
      repoRoot: "/tmp",
      status: "ready",
      summary: "",
      readyForSplit: true,
      verificationDiagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
      verificationReadinessStatus: "ready",
      verificationReadiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      failure: null,
    },
    source_plan: {
      artifactPath: "",
      command: "plan",
      repoRoot: "/tmp",
      status: "ready",
      summary: "",
      readyForVerification: true,
      planningDiagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null, planning_assist: { outcome: "not_attempted", attempted: false, used: false, provider: null, warnings: [], ignoredEdits: [], reportNotes: [] } },
      planningReadiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      failure: null,
    },
    workstream_contract: { requiredFields: ["id", "title"], categories: ["serial", "safe_parallel"], constraintSources: ["dependency_graph"], },
    workstreams,
    dependency_edges: [],
    merge_order: [],
    blocked_items: [],
    carried_forward_constraints: {
      findings: [],
      constraints: [],
      plan_concerns: [],
      planning_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      verification_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      stream_constraint_details: [],
    },
    split_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
    split_readiness: {
      ready: true,
      status: "ready",
      summary: "",
      execution_scope: "non_blocked_only",
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
  };
}

function makePlanArtifact(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
  const base: PlanArtifact = {
    schemaVersion: "1.0.0",
    command: "plan",
    stage: "plan",
    status: "ready",
    purpose: "test",
    repoRoot: "/tmp/test",
    requestedOutputRoot: null,
    outputRoot: "/tmp/test",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/tmp", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:00.000Z",
    summary: "test",
    boundaryNotes: [],
    source_intake: { artifactPath: "", command: "intake", status: "success", summary: "", readyForPlanning: true },
    plan_item_contract: { requiredFields: ["id", "title"], categories: ["implementation"], dependencyTypes: ["hard"], riskLevels: ["low"], testObligationCategories: ["unit"], verificationCategories: ["code_surface"], parallelizationSignals: ["serial_only"] },
    plan_items: [],
    dependency_graph: [],
    conflict_zones: [],
    test_obligations: [],
    parallelization_signals: [],
    carry_forward: {
      task_spec: {} as PlanArtifact["carry_forward"]["task_spec"],
      repo_context: {} as PlanArtifact["carry_forward"]["repo_context"],
      candidate_targets: {} as PlanArtifact["carry_forward"]["candidate_targets"],
      risk_analysis: {} as PlanArtifact["carry_forward"]["risk_analysis"],
      initial_verification_targets: {} as PlanArtifact["carry_forward"]["initial_verification_targets"],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: { task_parsing: "strong", repo_inspection: "strong", targeting: "strong" }, reasons: [] } as PlanArtifact["carry_forward"]["confidence"],
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] } as PlanArtifact["carry_forward"]["next_step_readiness"],
      concerns: [],
    },
    planning_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null, planning_assist: { outcome: "not_attempted", attempted: false, used: false, provider: null, warnings: [], ignoredEdits: [], reportNotes: [] } },
    planning_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
    failure: null,
  };
  return { ...base, ...overrides } as PlanArtifact;
}

function makeVerifyArtifact(overrides: Partial<VerifyArtifact> = {}): VerifyArtifact {
  const base: VerifyArtifact = {
    schemaVersion: "1.0.0",
    command: "verify",
    stage: "verify",
    status: "ready",
    purpose: "test",
    repoRoot: "/tmp/test",
    requestedOutputRoot: null,
    outputRoot: "/tmp/test",
    writePolicy: { mode: "output-root-only", repoReadOnlyOutsideOutputRoot: true, allowedRoot: "/tmp", allowedSideEffects: [], deferredCapabilities: [], disallowedCapabilities: [] },
    files: { artifactPath: null, reportPath: null, debugArtifactPath: "", debugVerificationCasesPath: "", debugStructuralFindingsPath: "", debugVerificationReadinessPath: "", debugStateModelsPath: "", debugTlaSpecsPath: "", debugTlcResultsPath: "" },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:00.000Z",
    summary: "test",
    boundaryNotes: [],
    source_plan: {
      artifactPath: "",
      command: "plan",
      repoRoot: "/tmp",
      status: "ready",
      summary: "",
      readyForVerification: true,
      planningReadinessStatus: "ready",
      planning_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null, planning_assist: { outcome: "not_attempted", attempted: false, used: false, provider: null, warnings: [], ignoredEdits: [], reportNotes: [] } },
      planning_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      failure: null,
    },
    verification_target_contract: { requiredFields: ["id"], riskSources: ["conflict_zone"], structuralFocusAreas: ["dependency_contradiction"], formalFocusAreas: ["retry_logic"], supportedLanes: ["structural"] },
    formal_lane_contract: { tooling: ["TLC"], scenarioKinds: ["ordering_serialization"], entryCriteria: ["state_machine_like"], stateModelRequiredFields: ["states"], tlcStatuses: ["passed"] },
    verification_targets: [],
    verification_cases: [],
    structural_verification: { status: "not_run", summary: "", findings: [], constraints: [] },
    formal_verification: { status: "not_run", summary: "", caution_notes: [], state_models: [], tla_specs: [], tlc_results: [], findings: [], constraints: [] },
    findings: [],
    constraints: [],
    carry_forward: {
      task_spec: {} as VerifyArtifact["carry_forward"]["task_spec"],
      repo_context: {} as VerifyArtifact["carry_forward"]["repo_context"],
      candidate_targets: {} as VerifyArtifact["carry_forward"]["candidate_targets"],
      risk_analysis: {} as VerifyArtifact["carry_forward"]["risk_analysis"],
      initial_verification_targets: {} as VerifyArtifact["carry_forward"]["initial_verification_targets"],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: { task_parsing: "strong", repo_inspection: "strong", targeting: "strong" }, reasons: [] } as VerifyArtifact["carry_forward"]["confidence"],
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] } as VerifyArtifact["carry_forward"]["next_step_readiness"],
      concerns: [],
    },
    verification_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
    verification_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
    failure: null,
  };
  return { ...base, ...overrides } as VerifyArtifact;
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

await runScenario("buildWorkstreamPrompt throws on missing workstream id", async () => {
  const split = makeSplitArtifact([]);
  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  await assert.rejects(
    () => buildWorkstreamPrompt({ workstreamId: "ws-nonexistent", splitArtifact: split, planArtifact: plan, verifyArtifact: verify, repoRoot: "/tmp" }),
    /Workstream ws-nonexistent not found/
  );
});

await runScenario("prompt includes workstream title, description, and plan item category", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Auth Module",
      description: "Implement JWT authentication",
      category: "serial",
      sourcePlanItemIds: ["pi-1"],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/auth.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);
  const plan = makePlanArtifact({
    plan_items: [
      {
        id: "pi-1",
        title: "Implement auth",
        description: "Add JWT auth",
        category: "implementation",
        sourceRequirements: [],
        likelyAffectedPaths: ["src/auth.ts"],
        dependencies: [],
        riskLevel: "low",
        testObligations: [],
        verificationRelevance: { relevant: true, categories: [], notes: [] },
        parallelization: { signal: "serial_only", reason: "" },
      },
    ],
  });
  const verify = makeVerifyArtifact();

  // Create the target file on disk
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "auth.ts"), "export const auth = {};");

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("Auth Module"), "prompt should contain workstream title");
  assert.ok(result.prompt.includes("Implement JWT authentication"), "prompt should contain workstream description");
  assert.ok(result.prompt.includes("category=implementation"), "prompt should contain plan item category");
  assert.ok(result.prompt.includes("risk=low"), "prompt should contain plan item risk level");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt includes merge order prerequisites with descriptions", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Database Schema",
      description: "Set up database tables",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/db.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
    {
      id: "ws-2",
      title: "User Repository",
      description: "Implement user CRUD operations",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/user-repo.ts"],
      streamDependencies: [],
      mergeOrderRequirements: ["ws-1"],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-2",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("Database Schema"), "prompt should list prerequisite workstream title");
  assert.ok(result.prompt.includes("Set up database tables"), "prompt should list prerequisite description");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt includes constraints from verify that apply to workstream files", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "API Layer",
      description: "Implement REST API",
      category: "serial",
      sourcePlanItemIds: ["pi-1"],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/api.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact({
    plan_items: [
      {
        id: "pi-1",
        title: "API",
        description: "",
        category: "implementation",
        sourceRequirements: [],
        likelyAffectedPaths: ["src/api.ts"],
        dependencies: [],
        riskLevel: "medium",
        testObligations: [],
        verificationRelevance: { relevant: true, categories: [], notes: [] },
        parallelization: { signal: "serial_only", reason: "" },
      },
    ],
    conflict_zones: [
      {
        id: "cz-1",
        title: "API/DB overlap",
        reason: "Both touch shared types",
        paths: ["src/api.ts"],
        planItemIds: ["pi-1"],
        riskLevel: "medium",
      },
    ],
  });

  const verify = makeVerifyArtifact({
    verification_cases: [
      {
        id: "vc-1",
        verificationTargetId: "vt-1",
        title: "API ownership",
        category: "dependency_contradiction",
        sourcePlanItemIds: ["pi-1"],
        lanes: ["structural"],
        goal: "Verify API ownership",
        status: "passed",
        summary: "",
        findings: [],
        mitigations: [],
        constraints: [],
        traceabilityNotes: [],
        formalDetails: null,
      },
    ],
    findings: [
      {
        id: "f-1",
        lane: "structural",
        verification_case_id: "vc-1",
        verification_target_id: "vt-1",
        status: "passed",
        summary: "API module has shared ownership concern",
        tla_spec_id: null,
        tlc_result_id: null,
        trace: null,
        errors: [],
      },
    ],
    constraints: [
      {
        id: "con-1",
        lane: "structural",
        verification_case_id: "vc-1",
        verification_target_id: "vt-1",
        summary: "API handlers must not directly access DB pool",
      },
    ],
  });

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("CONFLICT ZONE"), "prompt should include conflict zone");
  assert.ok(result.prompt.includes("FINDING"), "prompt should include finding");
  assert.ok(result.prompt.includes("CONSTRAINT"), "prompt should include constraint");
  assert.ok(result.prompt.includes("API handlers must not directly access DB pool"), "prompt should include constraint summary text");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt includes carried-forward concerns from plan", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Config Module",
      description: "Add configuration loading",
      category: "serial",
      sourcePlanItemIds: ["pi-1"],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/config.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact({
    plan_items: [
      {
        id: "pi-1",
        title: "Config",
        description: "",
        category: "config",
        sourceRequirements: [],
        likelyAffectedPaths: ["src/config.ts"],
        dependencies: [],
        riskLevel: "low",
        testObligations: [],
        verificationRelevance: { relevant: true, categories: [], notes: [] },
        parallelization: { signal: "serial_only", reason: "" },
      },
    ],
  });
  // Add a carried-forward concern
  plan.carry_forward.concerns = [
    {
      id: "concern-1",
      source: "ambiguity",
      code: null,
      message: "Config values must be validated before use",
      planItemIds: ["pi-1"],
      effects: ["risk_level"],
      status: "carried_forward",
    },
  ];

  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("Config values must be validated before use"), "prompt should include carried-forward concern");
  assert.ok(result.prompt.includes("Carried-Forward"), "prompt should include Carried-Forward Concerns section header");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt includes file contents for all likelyAffectedPaths", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "auth.ts"), "export function login() {}");

  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Auth Update",
      description: "Update auth module",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/auth.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("FILE: src/auth.ts"), "prompt should list the file path");
  assert.ok(result.prompt.includes("export function login()"), "prompt should include the file content");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("missing file in likelyAffectedPaths produces warning, not crash", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));

  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "New Feature",
      description: "Add new feature file",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/nonexistent.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.warnings.length > 0, "should have at least one warning for missing file");
  assert.ok(result.warnings.some((w) => w.includes("nonexistent.ts")), "warning should mention the missing file");
  assert.ok(result.prompt.includes("FILE NOT FOUND"), "prompt should indicate file not found");
  assert.equal(result.fileContents[0]?.content, null, "file content should be null");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("missing plan item produces warning, not crash", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));

  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Orphan Workstream",
      description: "References a plan item that does not exist",
      category: "serial",
      sourcePlanItemIds: ["pi-nonexistent"],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: [],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  const plan = makePlanArtifact(); // no plan items
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.warnings.some((w) => w.includes("pi-nonexistent")), "should warn about missing plan item");
  assert.ok(result.prompt.length > 0, "should still produce a valid prompt");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt specifies JSON output format with file, action, content fields", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Test WS",
      description: "desc",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: [],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);
  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes('"file"'), "prompt should specify file field in output format");
  assert.ok(result.prompt.includes('"action"'), "prompt should specify action field in output format");
  assert.ok(result.prompt.includes('"content"'), "prompt should specify content field in output format");
  assert.ok(result.prompt.includes('"create"') || result.prompt.includes('"modify"'), "prompt should list action types");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("getTargetFileContents reads multiple files and returns content map", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "a.ts"), "content-a");
  await fs.writeFile(path.join(tmpDir, "src", "b.ts"), "content-b");

  const warnings: string[] = [];
  const results = await getTargetFileContents(["src/a.ts", "src/b.ts", "src/c.ts"], tmpDir, warnings);

  assert.equal(results.length, 3);
  assert.equal(results[0]?.content, "content-a");
  assert.equal(results[1]?.content, "content-b");
  assert.equal(results[2]?.content, null); // missing file
  assert.equal(warnings.length, 1, "should warn about missing src/c.ts");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("prompt includes safety rules about only modifying target files", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Test",
      description: "desc",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/a.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);
  const plan = makePlanArtifact();
  const verify = makeVerifyArtifact();

  const result = await buildWorkstreamPrompt({
    workstreamId: "ws-1",
    splitArtifact: split,
    planArtifact: plan,
    verifyArtifact: verify,
    repoRoot: tmpDir,
  });

  assert.ok(result.prompt.includes("Only modify files listed"), "prompt should include rule about only modifying listed files");
  assert.ok(result.prompt.includes("Do not touch files outside"), "prompt should include rule about not touching other files");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("large target file is truncated in prompt with warning when FORGE_EXECUTE_FILE_SNIPPET_CHARS is low", async () => {
  const prev = process.env.FORGE_EXECUTE_FILE_SNIPPET_CHARS;
  process.env.FORGE_EXECUTE_FILE_SNIPPET_CHARS = "2800";

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  const head = "START_MARKER\n";
  const tail = "\nEND_MARKER";
  const middle = "M".repeat(40_000);
  await fs.writeFile(path.join(tmpDir, "src", "huge.ts"), head + middle + tail);

  const split = makeSplitArtifact([
    {
      id: "ws-1",
      title: "Huge file edit",
      description: "Touch huge module",
      category: "serial",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: ["src/huge.ts"],
      streamDependencies: [],
      mergeOrderRequirements: [],
      constraints: [],
      blockedReason: null,
    },
  ]);

  try {
    const result = await buildWorkstreamPrompt({
      workstreamId: "ws-1",
      splitArtifact: split,
      planArtifact: makePlanArtifact(),
      verifyArtifact: makeVerifyArtifact(),
      repoRoot: tmpDir,
    });

    assert.ok(
      result.prompt.includes("characters omitted from middle of file"),
      "prompt should include middle-omission marker for oversized file body"
    );
    assert.ok(result.prompt.includes("START_MARKER"), "prompt should retain start of file");
    assert.ok(result.prompt.includes("END_MARKER"), "prompt should retain end of file");
    assert.ok(
      result.warnings.some((w) => w.includes("FORGE_EXECUTE_FILE_SNIPPET_CHARS")),
      "should warn when file snippet is truncated"
    );
    assert.ok(result.prompt.length < 35_000, "prompt should stay bounded when file on disk is large");
  } finally {
    if (prev === undefined) {
      delete process.env.FORGE_EXECUTE_FILE_SNIPPET_CHARS;
    } else {
      process.env.FORGE_EXECUTE_FILE_SNIPPET_CHARS = prev;
    }
    await fs.rm(tmpDir, { recursive: true });
  }
});