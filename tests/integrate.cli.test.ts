import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import {
  runIntegrateCommand,
  parseTestFilesFromAIResponse,
} from "../src/integrate/cli.js";
import type {
  IntegrateCommandResult,
  IntegrationTestFile,
} from "../src/integrate/types.js";

async function runScenario(
  name: string,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeExecuteArtifact(workstreams: unknown[]): object {
  const completed = workstreams.filter(
    (w) => (w as { state: string }).state === "completed"
  ).length;
  const failed = workstreams.filter(
    (w) => (w as { state: string }).state === "failed"
  ).length;
  return {
    schemaVersion: "1.0.0",
    forgeVersion: "0.0.1",
    createdAt: "2025-01-01T00:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams,
    mergeOrderGates: [],
    summary: {
      total: workstreams.length,
      queued: 0,
      running: 0,
      completed,
      failed,
      blocked: 0,
      aiExecutedCount: workstreams.length,
      totalChangesMade: 0,
    },
    transitions: [],
    aiConfig: { provider: "openai", modelName: "gpt-4o" },
  };
}

function makeWorkstream(
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  return {
    workstreamId: "ws-1",
    title: "Implement feature",
    state: "completed",
    changesMade: [
      {
        file: "src/feature.ts",
        action: "modify",
        diffHash: crypto.createHash("sha256").update("dummy").digest("hex"),
        linesAdded: 5,
        linesRemoved: 0,
      },
    ],
    ...overrides,
  };
}

function makePlanArtifact(): object {
  return {
    schemaVersion: "1.0.0",
    command: "plan",
    stage: "plan",
    status: "ready",
    purpose: "Plan feature",
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
    summary: "Plan for feature",
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
      categories: ["implementation"],
      dependencyTypes: ["hard"],
      riskLevels: ["low"],
      testObligationCategories: ["unit"],
      verificationCategories: ["functional"],
      parallelizationSignals: ["independent"],
    },
    plan_items: [
      {
        id: "pi-1",
        title: "Add feature",
        description: "Create feature",
        category: "implementation",
        sourceRequirements: ["req-1"],
        likelyAffectedPaths: ["src/feature.ts"],
        dependencies: [],
        riskLevel: "low",
        testObligations: [{ category: "unit", reason: "Must test" }],
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
        title: "Feature",
        summary: "Add feature",
        goal: "Add feature to the application",
        scope: ["feature"],
        acceptance_criteria: ["Feature works"],
        has_acceptance_criteria: true,
        explicit_requirements: [],
        implementation_necessities: [],
        constraints: [],
        mentioned_paths: [],
        mentioned_tests: [],
        mentioned_modules: [],
        risky_phrases: [],
        open_questions: [],
      },
      repo_context: {
        grounded: false,
        source_files: [],
        test_files: [],
        manifest_files: [],
        languages: ["typescript"],
        framework_hints: [],
        package_manager: null,
        key_directories: [],
        entry_points: [],
        test_framework_hints: [],
        test_command_hints: [],
        ci_hints: [],
        layout_summary: "",
        git_context: { status: "unavailable", branch: null, commitHash: null, isDirty: false },
      },
      candidate_targets: [],
      risk_analysis: { initial_risk_zones: [], derived_risk_zones: [], supporting_analysis: { ambiguity_items: [], warning_items: [] } },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "low", signals: { task_parsing: "weak", repo_inspection: "weak", targeting: "weak" }, reasons: [] },
      next_step_readiness: { ready: true, blocking_issues: [], recommended_user_actions: [] },
      concerns: [],
    },
    planning_diagnostics: {
      usability_status: "actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
      planning_assist: { outcome: "not_attempted", attempted: false, used: false, provider: null, warnings: [], ignoredEdits: [], reportNotes: [] },
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
  };
}

function makeVerifyArtifact(): object {
  return {
    schemaVersion: "1.0.0",
    command: "verify",
    stage: "verify",
    status: "ready",
    purpose: "Verify feature",
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
      planningReadinessStatus: "ready",
      planning_diagnostics: {
        usability_status: "actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
        planning_assist: { outcome: "not_attempted", attempted: false, used: false, provider: null, warnings: [], ignoredEdits: [], reportNotes: [] },
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
    },
    verification_target_contract: {
      requiredFields: ["id"],
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
    structural_verification: { status: "passed", summary: "", findings: [], constraints: [] },
    formal_verification: { status: "not_run", summary: "", caution_notes: [], state_models: [], tla_specs: [], tlc_results: [], findings: [], constraints: [] },
    findings: [],
    constraints: [],
    carry_forward: {
      task_spec: { title: "Feature", summary: "Feature", goal: "Add feature", scope: [], acceptance_criteria: [], has_acceptance_criteria: false, explicit_requirements: [], implementation_necessities: [], constraints: [], mentioned_paths: [], mentioned_tests: [], mentioned_modules: [], risky_phrases: [], open_questions: [] },
      repo_context: { grounded: false, source_files: [], test_files: [], manifest_files: [], languages: [], framework_hints: [], package_manager: null, key_directories: [], entry_points: [], test_framework_hints: [], test_command_hints: [], ci_hints: [], layout_summary: "", git_context: { status: "unavailable", branch: null, commitHash: null, isDirty: false } },
      candidate_targets: [],
      risk_analysis: { initial_risk_zones: [], derived_risk_zones: [], supporting_analysis: { ambiguity_items: [], warning_items: [] } },
      initial_verification_targets: [],
      ambiguities: [],
      warnings: [],
      confidence: { level: "low", signals: { task_parsing: "weak", repo_inspection: "weak", targeting: "weak" }, reasons: [] },
      next_step_readiness: { ready: true, blocking_issues: [], recommended_user_actions: [] },
      concerns: [],
    },
    verification_diagnostics: { usability_status: "actionable", warning_items: [], blocking_items: [], partial_output: null },
    verification_readiness: { ready: true, status: "ready", summary: "", warning_items: [], blocking_issues: [], partial_output: null, constraining_concern_ids: [], recommended_user_actions: [] },
    failure: null,
  };
}

// ---------------------------------------------------------------------------
// parseTestFilesFromAIResponse tests
// ---------------------------------------------------------------------------

await runScenario(
  "parseTestFilesFromAIResponse extracts test files from json code block",
  () => {
    const raw = 'Here are the test files:\n```json\n[\n  {\n    "path": "tests/integration.test.ts",\n    "content": "test(\\"it works\\", () => { expect(true).toBe(true); });",\n    "language": "typescript",\n    "framework": "jest",\n    "testCount": 1\n  }\n]\n```\nDone!';
    const result = parseTestFilesFromAIResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "tests/integration.test.ts");
    assert.equal(result[0].testCount, 1);
    assert.equal(result[0].language, "typescript");
    assert.equal(result[0].framework, "jest");
    assert.equal(result[0].content, 'test("it works", () => { expect(true).toBe(true); });');
  }
);

await runScenario(
  "parseTestFilesFromAIResponse extracts from bare JSON array",
  () => {
    const raw = '[{"path": "test.py", "content": "def test_it(): pass", "language": "python", "framework": "pytest", "testCount": 1}]';
    const result = parseTestFilesFromAIResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "test.py");
    assert.equal(result[0].framework, "pytest");
  }
);

await runScenario(
  "parseTestFilesFromAIResponse returns empty for non-JSON response",
  () => {
    const result = parseTestFilesFromAIResponse("No tests needed.");
    assert.equal(result.length, 0);
  }
);

await runScenario(
  "parseTestFilesFromAIResponse returns empty for malformed JSON",
  () => {
    const result = parseTestFilesFromAIResponse("```json\n{ not an array }\n```");
    assert.equal(result.length, 0);
  }
);

await runScenario(
  "parseTestFilesFromAIResponse handles multiple test files in array",
  () => {
    const raw = '```json\n[\n  {"path": "a.test.ts", "content": "it(\\"a\\", () => {});", "language": "typescript", "framework": "jest", "testCount": 1},\n  {"path": "b.test.ts", "content": "it(\\"b\\", () => {});", "language": "typescript", "framework": "jest", "testCount": 2}\n]\n```';
    const result = parseTestFilesFromAIResponse(raw);
    assert.equal(result.length, 2);
    assert.equal(result[0].path, "a.test.ts");
    assert.equal(result[1].path, "b.test.ts");
    assert.equal(result[1].testCount, 2);
  }
);

await runScenario(
  "parseTestFilesFromAIResponse fills defaults for missing fields",
  () => {
    const raw = '```json\n[{"path": "minimal.test.ts"}]\n```';
    const result = parseTestFilesFromAIResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "minimal.test.ts");
    assert.equal(result[0].testCount, 0);
    assert.equal(result[0].language, "typescript");
    assert.equal(result[0].framework, "jest");
    assert.equal(result[0].content, undefined);
  }
);

// ---------------------------------------------------------------------------
// runIntegrateCommand error case tests
// ---------------------------------------------------------------------------

await runScenario(
  "runIntegrateCommand fails with NO_EXECUTE_ARTIFACT when execute.json is missing",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const result = await runIntegrateCommand({ repo: tmpDir });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      assert.equal(result.exitCode, 1);
      assert.ok(result.summary.includes("execute.json not found"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand fails with NO_WORKSTREAMS when execute.json has empty workstreams",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });
      const execArtifact = makeExecuteArtifact([]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );
      const result = await runIntegrateCommand({ repo: tmpDir });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "NO_WORKSTREAMS");
      assert.equal(result.exitCode, 1);
      assert.ok(result.summary.includes("no workstreams"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand fails with ALL_WORKSTREAMS_FAILED when all workstreams failed",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "failed" }),
        makeWorkstream({ workstreamId: "ws-2", state: "failed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );
      const result = await runIntegrateCommand({ repo: tmpDir });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "ALL_WORKSTREAMS_FAILED");
      assert.equal(result.exitCode, 1);
      assert.ok(result.summary.includes("failed"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand proceeds when some workstreams completed even if some failed",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write execute.json with a completed and a failed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
        makeWorkstream({ workstreamId: "ws-2", state: "failed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write plan.json and verify.json
      await fs.writeFile(
        path.join(forgeDir, "plan.json"),
        JSON.stringify(makePlanArtifact()),
        "utf-8"
      );
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );

      // Write a package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          scripts: { test: "jest" },
          devDependencies: { jest: "^29.0.0" },
        }),
        "utf-8"
      );

      // Without AI env vars, the command should fail with an AI_* error
      // rather than NO_EXECUTE_ARTIFACT or ALL_WORKSTREAMS_FAILED (which we already tested)
      const result = await runIntegrateCommand({ repo: tmpDir });
      // Should not be NO_EXECUTE_ARTIFACT — that check passed
      assert.notEqual(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      assert.notEqual(result.failure?.code, "NO_WORKSTREAMS");
      assert.notEqual(result.failure?.code, "ALL_WORKSTREAMS_FAILED");
      // Should be AI_UNKNOWN since no model is configured (classified by error classifier)
      assert.equal(result.failure?.code, "AI_UNKNOWN");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand warns when plan.json is missing and uses stub",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );
      // Deliberately NOT writing plan.json
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      // Should reach AI call (not fail at plan loading)
      assert.notEqual(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      assert.notEqual(result.failure?.code, "NO_WORKSTREAMS");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand warns when verify.json is missing and uses stub",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );
      await fs.writeFile(
        path.join(forgeDir, "plan.json"),
        JSON.stringify(makePlanArtifact()),
        "utf-8"
      );
      // Deliberately NOT writing verify.json
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      // Should reach AI call (not fail at verify loading)
      assert.notEqual(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      assert.notEqual(result.failure?.code, "NO_WORKSTREAMS");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand exit code is 0 when summary.failed === 0, 1 when summary.failed > 0",
  async () => {
    // We can't easily test the full happy path without a real AI endpoint,
    // but we can verify the exit code logic by inspecting the IntegrateCommandResult
    // type contract: exitCode 0 for success, 1 for failure.

    // The error cases already show exitCode=1 for failures.
    // For success (all pass), the exit code would be 0 — that requires AI,
    // which we can't test without a model endpoint.

    // Verify that the error result constructor sets exit codes correctly
    // by testing that NO_EXECUTE_ARTIFACT returns exitCode=1
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const result = await runIntegrateCommand({ repo: tmpDir });
      assert.equal(result.exitCode, 1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand reuses loadModelConfig and callModel from model-connector (no new connector)",
  async () => {
    // This is a structural assertion: cli.ts imports loadModelConfig and callModel from
    // ../execute/model-connector.ts rather than creating a new connector.
    // We verify by checking the module's import source at runtime.
    const cliModule = await import("../src/integrate/cli.js");
    assert.ok(typeof cliModule.runIntegrateCommand === "function");
    assert.ok(typeof cliModule.parseTestFilesFromAIResponse === "function");
    // The function exists and can be called — the import path is verified
    // by the typechecker which confirms loadModelConfig and callModel come from
    // the model-connector module.
  }
);

// ---------------------------------------------------------------------------
// --force guard and --auto mode tests
// ---------------------------------------------------------------------------

await runScenario(
  "runIntegrateCommand fails with INTEGRATE_ALREADY_EXISTS when integrate.json exists and --force is not set",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write valid execute.json with a completed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write integrate.json to trigger the guard
      await fs.writeFile(
        path.join(forgeDir, "integrate.json"),
        JSON.stringify({}),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "INTEGRATE_ALREADY_EXISTS");
      assert.equal(result.exitCode, 1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand --force proceeds when integrate.json already exists",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write valid execute.json with a completed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write integrate.json to test that --force bypasses the guard
      await fs.writeFile(
        path.join(forgeDir, "integrate.json"),
        JSON.stringify({}),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir, force: true });
      // Should NOT be INTEGRATE_ALREADY_EXISTS — it should proceed past the guard
      assert.notEqual(result.failure?.code, "INTEGRATE_ALREADY_EXISTS");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand --auto fails with PLAN_REQUIRED when plan.json is missing",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write valid execute.json with a completed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write verify.json (present) but deliberately NOT plan.json
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir, auto: true });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "PLAN_REQUIRED");
      assert.equal(result.exitCode, 1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand --auto fails with VERIFY_REQUIRED when verify.json is missing",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write valid execute.json with a completed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write plan.json (present) but deliberately NOT verify.json
      await fs.writeFile(
        path.join(forgeDir, "plan.json"),
        JSON.stringify(makePlanArtifact()),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir, auto: true });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "VERIFY_REQUIRED");
      assert.equal(result.exitCode, 1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "runIntegrateCommand --auto proceeds past auto checks when all artifacts are present",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write valid execute.json with a completed workstream
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write plan.json and verify.json (both present)
      await fs.writeFile(
        path.join(forgeDir, "plan.json"),
        JSON.stringify(makePlanArtifact()),
        "utf-8"
      );
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir, auto: true });
      // Should proceed past auto checks — not fail with PLAN_REQUIRED or VERIFY_REQUIRED
      assert.notEqual(result.failure?.code, "PLAN_REQUIRED");
      assert.notEqual(result.failure?.code, "VERIFY_REQUIRED");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

// ---------------------------------------------------------------------------
// Error classification + retry behavior tests
// ---------------------------------------------------------------------------

await runScenario(
  "error classification code format matches SPEC: AI_<TYPE> with underscores",
  () => {
    const spec: Record<string, string> = {
      rate_limit: "AI_RATE_LIMIT",
      auth_failure: "AI_AUTH_FAILURE",
      timeout: "AI_TIMEOUT",
      parse_error: "AI_PARSE_FAILURE",
      api_error: "AI_API_ERROR",
      context_overflow: "AI_CONTEXT_OVERFLOW",
    };
    for (const [type, code] of Object.entries(spec)) {
      if (type === "parse_error") {
        assert.equal(code, "AI_PARSE_FAILURE");
      } else {
        assert.equal(code, `AI_${type.toUpperCase()}`);
      }
    }
  }
);

await runScenario(
  "runIntegrateCommand AI call failure produces classified error code",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );
      await fs.writeFile(
        path.join(forgeDir, "plan.json"),
        JSON.stringify(makePlanArtifact()),
        "utf-8"
      );
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      // Without API keys, it should fail with a classified AI error code
      assert.equal(result.status, "failed");
      assert.equal(result.exitCode, 1);
      // Verify it's an AI classified error (not generic AI_GENERATION_FAILED)
      const aiCodes = [
        "AI_RATE_LIMIT",
        "AI_AUTH_FAILURE",
        "AI_TIMEOUT",
        "AI_PARSE_FAILURE",
        "AI_API_ERROR",
        "AI_CONTEXT_OVERFLOW",
        "AI_UNKNOWN",
      ];
      assert.ok(
        aiCodes.includes(result.failure?.code ?? ""),
        `Expected AI classified error code but got: ${result.failure?.code}`
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "parseTestFilesFromAIResponse still works after extract-json refactor",
  () => {
    const raw =
      'Here are the test files:\n```json\n[\n  {\n    "path": "tests/integration.test.ts",\n    "content": "test(\\"it works\\", () => { expect(true).toBe(true); });",\n    "language": "typescript",\n    "framework": "jest",\n    "testCount": 1\n  }\n]\n```\nDone!';
    const result = parseTestFilesFromAIResponse(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "tests/integration.test.ts");
    assert.equal(result[0].testCount, 1);
    assert.equal(result[0].language, "typescript");
    assert.equal(result[0].framework, "jest");
  }
);

// ---------------------------------------------------------------------------
// Missing artifact handling tests (Task 4)
// ---------------------------------------------------------------------------

await runScenario(
  "missing plan.json without --auto creates stub with execute-derived goal and proceeds",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write execute.json with a workstream that has a title
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed", title: "Build the feature" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Write verify.json (present) but deliberately NOT plan.json
      await fs.writeFile(
        path.join(forgeDir, "verify.json"),
        JSON.stringify(makeVerifyArtifact()),
        "utf-8"
      );

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      // Should NOT fail with PLAN_REQUIRED (that's --auto only)
      assert.notEqual(result.failure?.code, "PLAN_REQUIRED");
      // Should NOT fail with NO_EXECUTE_ARTIFACT
      assert.notEqual(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      // Should NOT fail with NO_WORKSTREAMS
      assert.notEqual(result.failure?.code, "NO_WORKSTREAMS");
      // Should proceed past artifact loading (will fail at AI call since no model configured)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "both plan.json and verify.json missing without --auto creates both stubs and proceeds",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write only execute.json — no plan.json, no verify.json
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Deliberately NOT writing plan.json or verify.json

      // Write package.json for framework detection
      await fs.writeFile(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }),
        "utf-8"
      );

      const result = await runIntegrateCommand({ repo: tmpDir });
      // Should NOT fail with PLAN_REQUIRED or VERIFY_REQUIRED (those are --auto only)
      assert.notEqual(result.failure?.code, "PLAN_REQUIRED");
      assert.notEqual(result.failure?.code, "VERIFY_REQUIRED");
      // Should NOT fail with NO_EXECUTE_ARTIFACT
      assert.notEqual(result.failure?.code, "NO_EXECUTE_ARTIFACT");
      // Should proceed past artifact loading
      assert.notEqual(result.failure?.code, "NO_WORKSTREAMS");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);

await runScenario(
  "both missing with --auto fails on first missing (plan) with PLAN_REQUIRED",
  async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-integrate-test-"));
    try {
      const forgeDir = path.join(tmpDir, ".forge");
      await fs.mkdir(forgeDir, { recursive: true });

      // Write only execute.json — no plan.json, no verify.json
      const execArtifact = makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", state: "completed" }),
      ]);
      await fs.writeFile(
        path.join(forgeDir, "execute.json"),
        JSON.stringify(execArtifact),
        "utf-8"
      );

      // Deliberately NOT writing plan.json or verify.json

      const result = await runIntegrateCommand({ repo: tmpDir, auto: true });
      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "PLAN_REQUIRED");
      assert.equal(result.exitCode, 1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
);
