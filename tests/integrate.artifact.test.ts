import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import {
  buildIntegrateArtifact,
  writeIntegrateArtifact,
  buildFrozenArtifact,
} from "../src/integrate/artifact.js";
import type { BuildIntegrateArtifactParams } from "../src/integrate/artifact.js";
import { validateIntegrateArtifact } from "../src/integrate/schema.js";
import type {
  ExecuteArtifact,
  ExecuteWorkstream,
  ChangeMade,
} from "../src/execute/types.js";
import type {
  PlanArtifact,
  PlanCarryForwardConcern,
} from "../src/plan/types.js";
import type {
  VerifyArtifact,
  VerifyFinding,
  VerifyConstraint,
} from "../src/verify/types.js";
import type {
  IntegrationTestCase,
  IntegrationTestFile,
  IntegrationSummary,
  IntegrateArtifact,
  TestRunResult,
  FreezeState,
  ErrorClassification,
} from "../src/integrate/types.js";

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

function makeChangeMade(overrides?: Partial<ChangeMade>): ChangeMade {
  return {
    file: "src/auth.ts",
    action: "modify" as const,
    diffHash: crypto.createHash("sha256").update("dummy").digest("hex"),
    linesAdded: 10,
    linesRemoved: 2,
    beforeHash: crypto.createHash("sha256").update("before").digest("hex"),
    afterHash: crypto.createHash("sha256").update("after").digest("hex"),
    ...overrides,
  };
}

function makeWorkstream(overrides?: Partial<ExecuteWorkstream>): ExecuteWorkstream {
  return {
    workstreamId: "ws-1",
    title: "Implement authentication",
    state: "completed",
    changesMade: [makeChangeMade()],
    ...overrides,
  };
}

function makeExecuteArtifact(workstreams?: ExecuteWorkstream[]): ExecuteArtifact {
  const ws = workstreams ?? [makeWorkstream()];
  const completed = ws.filter((w) => w.state === "completed").length;
  const failed = ws.filter((w) => w.state === "failed").length;
  return {
    schemaVersion: "1.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: ws,
    mergeOrderGates: [],
    summary: {
      total: ws.length,
      queued: 0,
      running: 0,
      completed,
      failed,
      blocked: 0,
      aiExecutedCount: ws.length,
      totalChangesMade: ws.reduce((sum, w) => sum + (w.changesMade?.length ?? 0), 0),
    },
    transitions: [],
    aiConfig: { provider: "openai", modelName: "gpt-4o" },
  } as ExecuteArtifact;
}

function makePlanArtifact(overrides?: Partial<PlanArtifact>): PlanArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "plan",
    stage: "plan",
    status: "ready",
    purpose: "Plan authentication feature",
    repoRoot: "/tmp/test",
    requestedOutputRoot: null,
    outputRoot: "/tmp/test/.forge",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: "/tmp/test",
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: { artifactPath: null, reportPath: null },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:00.000Z",
    summary: "Plan for auth feature",
    boundaryNotes: [],
    source_intake: {
      artifactPath: "",
      command: "intake",
      status: "success",
      summary: "",
      readyForPlanning: true,
    },
    plan_item_contract: {
      requiredFields: ["id", "title"],
      categories: ["implementation", "config"],
      dependencyTypes: ["hard"],
      riskLevels: ["low", "medium", "high"],
      testObligationCategories: ["unit"],
      verificationCategories: ["functional"],
      parallelizationSignals: ["independent"],
    },
    plan_items: [
      {
        id: "pi-1",
        title: "Add login endpoint",
        description: "Create POST /login",
        category: "implementation",
        sourceRequirements: ["req-1"],
        likelyAffectedPaths: ["src/auth.ts"],
        dependencies: [],
        riskLevel: "medium",
        testObligations: [{ category: "unit", reason: "Must test login" }],
        verificationRelevance: { relevant: true, categories: ["functional"], notes: [] },
        parallelization: { signal: "independent", reason: "No deps" },
      },
    ],
    dependency_graph: [],
    conflict_zones: [],
    test_obligations: [],
    parallelization_signals: [],
    carry_forward: {
      task_spec: {
        title: "Auth feature",
        summary: "Add authentication",
        goal: "Add user authentication to the application",
        scope: ["auth"],
        acceptance_criteria: ["Users can log in"],
      },
      repo_context: { repoRoot: "/tmp", primaryLanguage: "typescript", framework: "express" },
      candidate_targets: [],
      risk_analysis: { summary: "Low risk", items: [] },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: [] },
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      concerns: [] as PlanCarryForwardConcern[],
    },
    planning_diagnostics: {
      usability_status: "actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
    },
    planning_readiness: {
      ready: true,
      status: "ready",
      summary: "",
      warning_items: [],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: [],
      recommended_user_actions: [],
    },
    failure: null,
    ...overrides,
  } as PlanArtifact;
}

function makeVerifyArtifact(overrides?: Partial<VerifyArtifact>): VerifyArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "verify",
    stage: "verify",
    status: "ready",
    purpose: "Verify auth feature",
    repoRoot: "/tmp/test",
    requestedOutputRoot: null,
    outputRoot: "/tmp/test/.forge",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: "/tmp/test",
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: {
      artifactPath: null,
      reportPath: null,
      debugArtifactPath: "",
      debugVerificationCasesPath: "",
      debugStructuralFindingsPath: "",
      debugVerificationReadinessPath: "",
      debugStateModelsPath: "",
      debugTlaSpecsPath: "",
      debugTlcResultsPath: "",
    },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:00.000Z",
    summary: "Verification complete",
    boundaryNotes: [],
    source_plan: {
      artifactPath: "",
      command: "plan",
      repoRoot: "/tmp",
      status: "ready",
      summary: "",
      readyForVerification: true,
      planningDiagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
      planningReadiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      failure: null,
    },
    verification_target_contract: {
      requiredFields: ["id", "title"],
      riskSources: ["dependency"],
      structuralFocusAreas: ["error_handling"],
      formalFocusAreas: ["retry_logic"],
      supportedLanes: ["structural"],
    },
    formal_lane_contract: {
      tooling: ["tlc"],
      scenarioKinds: ["safety"],
      entryCriteria: ["state_model_complete"],
      stateModelRequiredFields: ["states"],
      tlcStatuses: ["passed"],
    },
    verification_targets: [],
    verification_cases: [],
    structural_verification: { status: "passed", summary: "All checks passed", findings: [], constraints: [] },
    formal_verification: { status: "not_run", summary: "", caution_notes: [], state_models: [], tla_specs: [], tlc_results: [], findings: [], constraints: [] },
    findings: [
      { id: "f-1", lane: "structural", verification_case_id: "vc-1", verification_target_id: "vt-1", status: "passed", summary: "Login endpoint validated", tla_spec_id: null, tlc_result_id: null, trace: null, errors: [] },
    ] as VerifyFinding[],
    constraints: [
      { id: "c-1", lane: "structural", verification_case_id: "vc-1", verification_target_id: "vt-1", summary: "Must validate JWT tokens" },
    ] as VerifyConstraint[],
    carry_forward: {
      task_spec: { title: "Auth", summary: "Auth", goal: "Add auth", scope: [], acceptance_criteria: [] },
      repo_context: { repoRoot: "/tmp", primaryLanguage: "typescript", framework: "express" },
      candidate_targets: [],
      risk_analysis: { summary: "Low risk", items: [] },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: [] },
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      concerns: [] as PlanCarryForwardConcern[],
    },
    verification_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
    verification_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
    failure: null,
    ...overrides,
  } as VerifyArtifact;
}

function makeTestCase(overrides?: Partial<IntegrationTestCase>): IntegrationTestCase {
  return {
    id: "tc-1",
    name: "Should authenticate user",
    status: "passed",
    durationMs: 150,
    ...overrides,
  };
}

function makeTestFile(overrides?: Partial<IntegrationTestFile>): IntegrationTestFile {
  return {
    path: "tests/integration/auth.test.ts",
    testCount: 1,
    language: "typescript",
    framework: "jest",
    content: 'test("auth", () => { expect(true).toBe(true); });',
    ...overrides,
  };
}

function makeTestRunResult(overrides?: Partial<TestRunResult>): TestRunResult {
  return {
    success: true,
    tests: [makeTestCase()],
    testFiles: [makeTestFile()],
    durationMs: 500,
    ...overrides,
  };
}

function makeBuildParams(overrides?: Partial<BuildIntegrateArtifactParams>): BuildIntegrateArtifactParams {
  return {
    executeArtifact: makeExecuteArtifact(),
    planArtifact: makePlanArtifact(),
    verifyArtifact: makeVerifyArtifact(),
    testResult: makeTestRunResult(),
    aiModelUsed: "openai/gpt-4o",
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    ...overrides,
  };
}

// Helper for temp directory operations
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-artifact-test-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ===========================================================================
// buildIntegrateArtifact tests
// ===========================================================================

await runScenario("buildIntegrateArtifact produces a valid IntegrateArtifact", () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.schemaVersion, "2.0.0");
  assert.equal(artifact.forgeVersion, "0.1.0");
  assert.equal(artifact.executeSource, ".forge/execute.json");
  assert.equal(artifact.planSource, ".forge/plan.json");
  assert.equal(artifact.verifySource, ".forge/verify.json");
  assert.equal(typeof artifact.createdAt, "string");
  assert.ok(artifact.createdAt.length > 0);
});

await runScenario("buildIntegrateArtifact output passes validateIntegrateArtifact", () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  // Should not throw
  const validated = validateIntegrateArtifact(artifact);
  assert.equal(validated.schemaVersion, "2.0.0");
  assert.equal(validated.goal, "Add user authentication to the application");
});

await runScenario("buildIntegrateArtifact extracts goal from planArtifact.carry_forward.task_spec.goal", () => {
  const planArtifact = makePlanArtifact();
  const params = makeBuildParams({ planArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.goal, "Add user authentication to the application");
});

await runScenario("buildIntegrateArtifact falls back to planArtifact.purpose when task_spec.goal is absent", () => {
  const planArtifact = makePlanArtifact({
    carry_forward: {
      task_spec: {
        title: "Auth feature",
        summary: "Add authentication",
        goal: undefined as unknown as string, // no goal
        scope: [],
        acceptance_criteria: [],
      },
      repo_context: { repoRoot: "/tmp", primaryLanguage: "typescript", framework: "express" },
      candidate_targets: [],
      risk_analysis: { summary: "Low risk", items: [] },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: [] },
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      concerns: [],
    } as unknown as PlanArtifact["carry_forward"],
    purpose: "Plan authentication feature",
  });
  const params = makeBuildParams({ planArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.goal, "Plan authentication feature");
});

await runScenario("buildIntegrateArtifact falls back to planArtifact.summary when purpose is absent", () => {
  const planArtifact = makePlanArtifact({
    carry_forward: {
      task_spec: {
        title: "Auth feature",
        summary: "Add authentication",
        goal: undefined as unknown as string,
        scope: [],
        acceptance_criteria: [],
      },
      repo_context: { repoRoot: "/tmp", primaryLanguage: "typescript", framework: "express" },
      candidate_targets: [],
      risk_analysis: { summary: "Low risk", items: [] },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: [] },
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      concerns: [],
    } as unknown as PlanArtifact["carry_forward"],
    purpose: undefined as unknown as string,
    summary: "Plan for auth feature",
  });
  const params = makeBuildParams({ planArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.goal, "Plan for auth feature");
});

await runScenario("buildIntegrateArtifact falls back to 'Unknown goal' when no goal source exists", () => {
  const planArtifact = makePlanArtifact({
    carry_forward: {
      task_spec: {
        title: "Auth feature",
        summary: "Add authentication",
        goal: undefined as unknown as string,
        scope: [],
        acceptance_criteria: [],
      },
      repo_context: { repoRoot: "/tmp", primaryLanguage: "typescript", framework: "express" },
      candidate_targets: [],
      risk_analysis: { summary: "Low risk", items: [] },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "high", signals: [] },
      next_step_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
      concerns: [],
    } as unknown as PlanArtifact["carry_forward"],
    purpose: undefined as unknown as string,
    summary: undefined as unknown as string,
  });
  const params = makeBuildParams({ planArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.goal, "Unknown goal");
});

await runScenario("buildIntegrateArtifact summarizes workstreams: total, completed, failed, changes", () => {
  const executeArtifact = makeExecuteArtifact([
    makeWorkstream({ workstreamId: "ws-1", title: "Task 1", state: "completed", changesMade: [makeChangeMade(), makeChangeMade()] }),
    makeWorkstream({ workstreamId: "ws-2", title: "Task 2", state: "completed", changesMade: [makeChangeMade()] }),
    makeWorkstream({ workstreamId: "ws-3", title: "Task 3", state: "failed", changesMade: [makeChangeMade(), makeChangeMade(), makeChangeMade()] }),
  ]);
  const params = makeBuildParams({ executeArtifact });
  const artifact = buildIntegrateArtifact(params);

  // total=3, completed=2, failed=1, changes=2+1+3=6
  assert.ok(artifact.workstreamsSummary.includes("Total: 3"));
  assert.ok(artifact.workstreamsSummary.includes("Completed: 2"));
  assert.ok(artifact.workstreamsSummary.includes("Failed: 1"));
  assert.ok(artifact.workstreamsSummary.includes("Changes: 6"));
});

await runScenario("buildIntegrateArtifact counts workstreams with no changesMade as zero changes", () => {
  const executeArtifact = makeExecuteArtifact([
    makeWorkstream({ workstreamId: "ws-1", state: "completed", changesMade: undefined }),
    makeWorkstream({ workstreamId: "ws-2", state: "completed", changesMade: [] }),
  ]);
  const params = makeBuildParams({ executeArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.ok(artifact.workstreamsSummary.includes("Total: 2"));
  assert.ok(artifact.workstreamsSummary.includes("Completed: 2"));
  assert.ok(artifact.workstreamsSummary.includes("Changes: 0"));
});

await runScenario("buildIntegrateArtifact collects recommendations from failed tests with recommendation field", () => {
  const testResult = makeTestRunResult({
    tests: [
      makeTestCase({ id: "tc-1", name: "Passed test", status: "passed" }),
      makeTestCase({ id: "tc-2", name: "Failed test 1", status: "failed", error: "Timeout", recommendation: "Increase timeout for API calls" }),
      makeTestCase({ id: "tc-3", name: "Failed test 2", status: "failed", error: "Null pointer", recommendation: "Add null check before access" }),
      makeTestCase({ id: "tc-4", name: "Failed test no rec", status: "failed", error: "Something went wrong" }),
      makeTestCase({ id: "tc-5", name: "Skipped test", status: "skipped" }),
    ],
  });
  const params = makeBuildParams({ testResult });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.recommendations.length, 2);
  assert.ok(artifact.recommendations.includes("Increase timeout for API calls"));
  assert.ok(artifact.recommendations.includes("Add null check before access"));
});

await runScenario("buildIntegrateArtifact excludes empty recommendations from failed tests", () => {
  const testResult = makeTestRunResult({
    tests: [
      makeTestCase({ id: "tc-1", name: "Failed test", status: "failed", error: "Error", recommendation: "" }),
      makeTestCase({ id: "tc-2", name: "Failed test 2", status: "failed", error: "Error", recommendation: "   " }),
    ],
  });
  const params = makeBuildParams({ testResult });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.recommendations.length, 0);
});

await runScenario("buildIntegrateArtifact computes summary from testResult", () => {
  const testResult = makeTestRunResult({
    success: true,
    tests: [
      makeTestCase({ id: "tc-1", status: "passed" }),
      makeTestCase({ id: "tc-2", status: "passed" }),
      makeTestCase({ id: "tc-3", status: "failed" }),
      makeTestCase({ id: "tc-4", status: "skipped" }),
    ],
    testFiles: [makeTestFile(), makeTestFile()],
    durationMs: 1500,
  });
  const params = makeBuildParams({ testResult, aiModelUsed: "anthropic/claude-3.5" });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.summary.total, 4);
  assert.equal(artifact.summary.passed, 2);
  assert.equal(artifact.summary.failed, 1);
  assert.equal(artifact.summary.skipped, 1);
  assert.equal(artifact.summary.durationMs, 1500);
  assert.equal(artifact.summary.testFilesGenerated, 2);
  assert.equal(artifact.summary.aiModelUsed, "anthropic/claude-3.5");
});

await runScenario("buildIntegrateArtifact includes test cases and test files from testResult", () => {
  const testCases = [
    makeTestCase({ id: "tc-1", name: "Auth test" }),
    makeTestCase({ id: "tc-2", name: "API test" }),
  ];
  const testFiles = [
    makeTestFile({ path: "tests/integration/auth.test.ts" }),
    makeTestFile({ path: "tests/integration/api.test.ts", framework: "vitest" }),
  ];
  const testResult = makeTestRunResult({ tests: testCases, testFiles });
  const params = makeBuildParams({ testResult });
  const artifact = buildIntegrateArtifact(params);

  assert.equal(artifact.tests.length, 2);
  assert.equal(artifact.tests[0].id, "tc-1");
  assert.equal(artifact.tests[1].name, "API test");
  assert.equal(artifact.testFiles.length, 2);
  assert.equal(artifact.testFiles[0].path, "tests/integration/auth.test.ts");
  assert.equal(artifact.testFiles[1].framework, "vitest");
});

await runScenario("buildIntegrateArtifact handles empty workstreams", () => {
  const executeArtifact = makeExecuteArtifact([]);
  const params = makeBuildParams({ executeArtifact });
  const artifact = buildIntegrateArtifact(params);

  assert.ok(artifact.workstreamsSummary.includes("Total: 0"));
  assert.ok(artifact.workstreamsSummary.includes("Completed: 0"));
  assert.ok(artifact.workstreamsSummary.includes("Failed: 0"));
  assert.ok(artifact.workstreamsSummary.includes("Changes: 0"));
});

// ===========================================================================
// writeIntegrateArtifact tests
// ===========================================================================

await runScenario("writeIntegrateArtifact creates parent directories recursively", async () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  await withTempDir(async (dir) => {
    const nestedPath = path.join(dir, "deep", "nested", "dir", "integrate.json");
    await writeIntegrateArtifact(nestedPath, artifact);

    const content = await fs.readFile(nestedPath, "utf-8");
    const parsed = JSON.parse(content);
    assert.equal(parsed.schemaVersion, "2.0.0");
    assert.equal(parsed.goal, "Add user authentication to the application");
  });
});

await runScenario("writeIntegrateArtifact writes JSON with 2-space indentation", async () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "integrate.json");
    await writeIntegrateArtifact(filePath, artifact);

    const content = await fs.readFile(filePath, "utf-8");

    // Check that the JSON uses 2-space indentation
    // The schemaVersion line should be indented with 2 spaces
    assert.ok(content.includes("\n  \"schemaVersion\""));

    // Verify it's valid JSON
    const parsed = JSON.parse(content);
    assert.equal(parsed.schemaVersion, "2.0.0");
  });
});

await runScenario("writeIntegrateArtifact creates file at top-level directory", async () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "integrate.json");
    await writeIntegrateArtifact(filePath, artifact);

    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    assert.equal(parsed.forgeVersion, "0.1.0");
  });
});

await runScenario("written artifact can be parsed back by validateIntegrateArtifact", async () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "integrate.json");
    await writeIntegrateArtifact(filePath, artifact);

    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);

    // Should not throw
    const validated = validateIntegrateArtifact(parsed);
    assert.equal(validated.schemaVersion, "2.0.0");
    assert.equal(validated.goal, "Add user authentication to the application");
  });
});

await runScenario("writeIntegrateArtifact overwrites existing file", async () => {
  const params = makeBuildParams();
  const artifact = buildIntegrateArtifact(params);

  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "integrate.json");

    // Write initial file
    await writeIntegrateArtifact(filePath, artifact);

    // Write again with different schema version
    const params2 = makeBuildParams({ schemaVersion: "2.1.0" });
    const artifact2 = buildIntegrateArtifact(params2);
    await writeIntegrateArtifact(filePath, artifact2);

    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    assert.equal(parsed.schemaVersion, "2.1.0");
  });
});

// ===========================================================================
// buildFrozenArtifact tests (Task 5)
// ===========================================================================

await runScenario("buildFrozenArtifact creates artifact with frozenAt, finalError, and attemptCount set", () => {
  const executeArtifact = makeExecuteArtifact([makeWorkstream({ workstreamId: "ws-1", state: "completed" })]);
  const planArtifact = makePlanArtifact();
  const verifyArtifact = makeVerifyArtifact();
  const freezeState: FreezeState = { frozenAt: "2025-01-01T00:00:00.000Z", finalError: "auth_failure: 401", attemptCount: 2 };
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };

  const result = buildFrozenArtifact(executeArtifact, planArtifact, verifyArtifact, freezeState, authError);

  assert.equal(result.frozenAt, "2025-01-01T00:00:00.000Z");
  assert.equal(result.finalError, "auth_failure: 401");
  assert.equal(result.attemptCount, 2);
  assert.equal(result.tests.length, 0);
  assert.equal(result.testFiles.length, 0);
});

await runScenario("buildFrozenArtifact derives goal from plan artifact when provided", () => {
  const executeArtifact = makeExecuteArtifact([makeWorkstream({ workstreamId: "ws-1", state: "completed" })]);
  const planArtifact = makePlanArtifact();
  const verifyArtifact = makeVerifyArtifact();
  const freezeState: FreezeState = { frozenAt: "2025-01-01T00:00:00.000Z", finalError: "auth_failure: 401", attemptCount: 1 };
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };

  const result = buildFrozenArtifact(executeArtifact, planArtifact, verifyArtifact, freezeState, authError);

  // makePlanArtifact sets carry_forward.task_spec.goal = "Add user authentication to the application"
  assert.equal(result.goal, "Add user authentication to the application");
});

await runScenario("buildFrozenArtifact uses '? Unknown' goal when planArtifact is null", () => {
  const executeArtifact = makeExecuteArtifact([makeWorkstream({ workstreamId: "ws-1", state: "completed" })]);
  const freezeState: FreezeState = { frozenAt: "2025-01-01T00:00:00.000Z", finalError: "rate_limit: 429", attemptCount: 3 };
  const rateLimitError: ErrorClassification = { type: "rate_limit", retryable: true, message: "429 Too Many Requests", suggestion: "Wait and retry." };

  const result = buildFrozenArtifact(executeArtifact, null, null, freezeState, rateLimitError);

  assert.equal(result.goal, "? Unknown");
});

console.log("All integrate artifact tests completed.");
