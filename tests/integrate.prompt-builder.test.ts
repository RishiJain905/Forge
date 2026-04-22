import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";

import {
  detectTestFramework,
  getChangedFileContents,
  buildIntegrationTestPrompt,
  deriveFrameworkFromOverride,
  discoverExistingTests,
  CONTEXT_WARNING_THRESHOLD,
  resolveIntegrateTestCommand,
  normalizeIntegrationTestFilePaths,
} from "../src/integrate/prompt-builder.js";
import type { DetectedFramework } from "../src/integrate/prompt-builder.js";
import type { ExecuteArtifact, ExecuteWorkstream, ChangeMade } from "../src/execute/types.js";
import type { PlanArtifact, PlanItem, PlanCarryForwardConcern } from "../src/plan/types.js";
import type { VerifyArtifact, VerifyFinding, VerifyConstraint } from "../src/verify/types.js";
import type { PromptBuildContext, BuiltPrompt, IntegrationTestFile } from "../src/integrate/types.js";
import crypto from "node:crypto";

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
    action: "modify",
    diffHash: crypto.createHash("sha256").update("dummy").digest("hex"),
    linesAdded: 10,
    linesRemoved: 2,
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
      concerns: [],
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
    formal_verification: { status: "not_run", summary: "", cautionNotes: [], stateModels: [], tlaSpecs: [], tlcResults: [], findings: [], constraints: [] },
    findings: [
      { id: "f-1", lane: "structural", verification_case_id: "vc-1", verification_target_id: "vt-1", status: "passed", summary: "Login endpoint validated", tlaSpecId: null, tlcResultId: null, trace: null, errors: [] },
    ],
    constraints: [
      { id: "c-1", lane: "structural", verification_case_id: "vc-1", verification_target_id: "vt-1", summary: "Must validate JWT tokens" },
    ],
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

function makePromptBuildContext(overrides?: Partial<PromptBuildContext>): PromptBuildContext {
  return {
    executeArtifact: makeExecuteArtifact(),
    planArtifact: makePlanArtifact(),
    verifyArtifact: makeVerifyArtifact(),
    repoRoot: "/tmp/test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to create a temp directory with specific files
// ---------------------------------------------------------------------------

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-prompt-test-"));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ===========================================================================
// detectTestFramework tests
// ===========================================================================

await runScenario("detectTestFramework finds jest when test script contains 'jest'", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest --coverage" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "jest");
    assert.equal(result.language, "typescript");
    assert.equal(result.testCommand, "npx jest");
  });
});

await runScenario("detectTestFramework finds jest when jest in devDependencies", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "jest");
  });
});

await runScenario("detectTestFramework finds jest when jest in dependencies", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { jest: "^29.0.0" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "jest");
  });
});

await runScenario("detectTestFramework finds vitest when test script contains 'vitest'", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "vitest");
    assert.equal(result.language, "typescript");
    assert.equal(result.testCommand, "npx vitest run");
  });
});

await runScenario("detectTestFramework finds vitest when vitest in devDependencies", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "vitest");
  });
});

await runScenario("detectTestFramework prefers vitest over jest when both are present", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest run" },
        devDependencies: { jest: "^29.0.0", vitest: "^1.0.0" },
      })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "vitest");
  });
});

await runScenario("detectTestFramework finds mocha when test script contains 'mocha'", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "mocha" }, devDependencies: { mocha: "^10.0.0" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "mocha");
    assert.equal(result.language, "javascript");
  });
});

await runScenario("detectTestFramework finds pytest when pytest.ini exists", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "pytest.ini"), "[pytest]\naddopts = -v\n");
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "pytest");
    assert.equal(result.language, "python");
    assert.equal(result.testCommand, "pytest");
  });
});

await runScenario("detectTestFramework finds pytest when pyproject.toml has [tool.pytest]", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "pyproject.toml"),
      "[tool.pytest.ini_options]\naddopts = '-v'\n"
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "pytest");
    assert.equal(result.language, "python");
    assert.equal(result.testCommand, "pytest");
  });
});

await runScenario("detectTestFramework falls back to npm when nothing detected", async () => {
  await withTempDir(async (dir) => {
    // Empty temp directory, no package.json, no python config
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "npm");
    assert.equal(result.language, "unknown");
    assert.equal(result.testCommand, "npm test");
  });
});

await runScenario("detectTestFramework falls back to npm when package.json has no test config", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "my-project", version: "1.0.0" })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "npm");
    assert.equal(result.language, "unknown");
  });
});

await runScenario("detectTestFramework handles invalid package.json gracefully", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "package.json"), "not valid json {{{");
    // Should not throw, should fall back — but also check pyproject.toml doesn't exist
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "npm");
  });
});

await runScenario("detectTestFramework prefers package.json over pytest.ini", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "pytest.ini"), "[pytest]\n");
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "jest");
  });
});

await runScenario("detectTestFramework prefers package.json over pyproject.toml", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "pyproject.toml"), "[tool.pytest.ini_options]\n");
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
    );
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "vitest");
  });
});

await runScenario("detectTestFramework: pyproject.toml without [tool.pytest] falls back", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "pyproject.toml"), "[build-system]\nrequires = []\n");
    const result = await detectTestFramework(dir);
    assert.equal(result.name, "npm"); // no pytest section, no package.json → fallback
  });
});

// ===========================================================================
// getChangedFileContents tests
// ===========================================================================

await runScenario("getChangedFileContents reads files from execute artifact workstreams", async () => {
  await withTempDir(async (dir) => {
    // Create a file that the execute artifact references
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "auth.ts"), "export function login() { return true; }");

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        workstreamId: "ws-1",
        changesMade: [
          makeChangeMade({ file: "src/auth.ts", action: "modify" }),
        ],
      }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "src/auth.ts");
    assert.equal(result[0].content, "export function login() { return true; }");
    assert.equal(result[0].warning, null);
  });
});

await runScenario("getChangedFileContents handles missing files with warning", async () => {
  await withTempDir(async (dir) => {
    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        changesMade: [
          makeChangeMade({ file: "src/nonexistent.ts", action: "create" }),
        ],
      }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "src/nonexistent.ts");
    assert.equal(result[0].content, null);
    assert.ok(result[0].warning!.includes("nonexistent.ts"));
  });
});

await runScenario("getChangedFileContents deduplicates files across workstreams", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "shared.ts"), "export const x = 1;");

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        workstreamId: "ws-1",
        changesMade: [makeChangeMade({ file: "src/shared.ts" })],
      }),
      makeWorkstream({
        workstreamId: "ws-2",
        changesMade: [makeChangeMade({ file: "src/shared.ts" })],
      }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 1); // deduplicated
    assert.equal(result[0].path, "src/shared.ts");
  });
});

await runScenario("getChangedFileContents skips deleted files", async () => {
  await withTempDir(async (dir) => {
    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        changesMade: [
          makeChangeMade({ file: "src/old.ts", action: "delete" }),
          makeChangeMade({ file: "src/new.ts", action: "create" }),
        ],
      }),
    ]);

    // Create only the "new" file
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "new.ts"), "export const y = 2;");

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    // Deleted file should be skipped
    const paths = result.map((r) => r.path);
    assert.ok(!paths.includes("src/old.ts"), "deleted file should be skipped");
    assert.ok(paths.includes("src/new.ts"), "created file should be included");
  });
});

await runScenario("getChangedFileContents returns empty array when no changesMade", async () => {
  await withTempDir(async (dir) => {
    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ changesMade: undefined }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 0);
  });
});

await runScenario("getChangedFileContents returns empty array for empty workstreams", async () => {
  const execArtifact = makeExecuteArtifact([]);
  const { files: result } = await getChangedFileContents(execArtifact, "/tmp/nonexistent");
  assert.equal(result.length, 0);
});

// ===========================================================================
// buildIntegrationTestPrompt tests
// ===========================================================================

await runScenario("buildIntegrationTestPrompt returns BuiltPrompt with prompt string containing goal", async () => {
  await withTempDir(async (dir) => {
    // Create package.json for framework detection
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    // Create a source file that the execute artifact references
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "auth.ts"), "export function login() { return true; }");

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt, "prompt should not be empty");
    assert.ok(result.prompt.includes("Add user authentication to the application"), "prompt should contain the goal");
    assert.ok(typeof result.promptHash === "string", "promptHash should be a string");
    assert.ok(result.promptHash.length === 64, "promptHash should be SHA-256 hex (64 chars)");
    assert.equal(result.detectedFramework, "jest");
  });
});

await runScenario("buildIntegrationTestPrompt prompt contains workstream info", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        workstreamId: "ws-1",
        title: "Implement login endpoint",
        state: "completed",
        changesMade: [],
      }),
      makeWorkstream({
        workstreamId: "ws-2",
        title: "Add auth middleware",
        state: "failed",
        error: "Timeout waiting for response",
        changesMade: [],
      }),
    ]);

    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    // Check workstream info is present
    assert.ok(result.prompt.includes("Implement login endpoint"), "prompt should contain workstream title");
    assert.ok(result.prompt.includes("Add auth middleware"), "prompt should contain second workstream title");
    assert.ok(result.prompt.includes("completed"), "prompt should mention completed status");
    assert.ok(result.prompt.includes("failed"), "prompt should mention failed status");
  });
});

await runScenario("buildIntegrationTestPrompt prompt contains changed files", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "auth.ts"), "export function login() {}");

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        changesMade: [makeChangeMade({ file: "src/auth.ts" })],
      }),
    ]);

    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("src/auth.ts"), "prompt should reference changed file");
    assert.ok(result.prompt.includes("export function login() {}"), "prompt should contain file content");
  });
});

await runScenario("buildIntegrationTestPrompt prompt contains plan items", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    // Should contain plan item info
    assert.ok(result.prompt.includes("Add login endpoint"), "prompt should contain plan item title");
    assert.ok(result.prompt.includes("category=implementation"), "prompt should contain plan item category");
  });
});

await runScenario("buildIntegrationTestPrompt prompt contains verification constraints", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    // Should contain constraint info
    assert.ok(result.prompt.includes("Must validate JWT tokens"), "prompt should contain constraint summary");
  });
});

await runScenario("buildIntegrationTestPrompt includes detected framework info", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("vitest"), "prompt should mention vitest framework");
    assert.equal(result.detectedFramework, "vitest");
  });
});

await runScenario("buildIntegrationTestPrompt produces deterministic SHA-256 promptHash for same input", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "auth.ts"), "export function login() {}");

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        changesMade: [makeChangeMade({ file: "src/auth.ts" })],
      }),
    ]);

    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });

    const result1 = await buildIntegrationTestPrompt(ctx);
    const result2 = await buildIntegrationTestPrompt(ctx);

    assert.equal(result1.promptHash, result2.promptHash, "same input should produce same hash");
    assert.equal(result1.prompt, result2.prompt, "same input should produce same prompt");
  });
});

await runScenario("buildIntegrationTestPrompt uses testFramework override when provided", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir, testFramework: "vitest" });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.equal(result.detectedFramework, "vitest", "should use override framework");
    assert.ok(result.prompt.includes("vitest"), "prompt should mention override framework");
    // When override is provided, language and testCommand are derived from framework name
    assert.ok(result.prompt.includes("Language: typescript"), "prompt should have language derived from vitest override");
    assert.ok(result.prompt.includes("Test command: npx vitest run"), "prompt should have testCommand derived from vitest override");
  });
});

await runScenario("buildIntegrationTestPrompt with pytest override derives python language and pytest command", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir, testFramework: "pytest" });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.equal(result.detectedFramework, "pytest", "should use override framework");
    assert.ok(result.prompt.includes("Language: python"), "prompt should have python language for pytest override");
    assert.ok(result.prompt.includes("Test command: pytest"), "prompt should have pytest command for pytest override");
  });
});

await runScenario("buildIntegrationTestPrompt without testFramework override auto-detects", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.equal(result.detectedFramework, "jest", "should auto-detect jest from package.json");
  });
});

// ===========================================================================
// deriveFrameworkFromOverride tests
// ===========================================================================

await runScenario("deriveFrameworkFromOverride returns correct values for pytest", () => {
  const result = deriveFrameworkFromOverride("pytest");
  assert.equal(result.name, "pytest");
  assert.equal(result.language, "python");
  assert.equal(result.testCommand, "pytest");
});

await runScenario("deriveFrameworkFromOverride returns correct values for unittest", () => {
  const result = deriveFrameworkFromOverride("unittest");
  assert.equal(result.name, "unittest");
  assert.equal(result.language, "python");
  assert.equal(result.testCommand, "python -m unittest");
});

await runScenario("deriveFrameworkFromOverride returns correct values for vitest", () => {
  const result = deriveFrameworkFromOverride("vitest");
  assert.equal(result.name, "vitest");
  assert.equal(result.language, "typescript");
  assert.equal(result.testCommand, "npx vitest run");
});

await runScenario("deriveFrameworkFromOverride returns correct values for jest", () => {
  const result = deriveFrameworkFromOverride("jest");
  assert.equal(result.name, "jest");
  assert.equal(result.language, "typescript");
  assert.equal(result.testCommand, "npx jest");
});

await runScenario("deriveFrameworkFromOverride returns correct values for mocha", () => {
  const result = deriveFrameworkFromOverride("mocha");
  assert.equal(result.name, "mocha");
  assert.equal(result.language, "javascript");
  assert.equal(result.testCommand, "npx mocha");
});

await runScenario("deriveFrameworkFromOverride falls back for unknown framework", () => {
  const result = deriveFrameworkFromOverride("cypress");
  assert.equal(result.name, "cypress");
  assert.equal(result.language, "typescript");
  assert.equal(result.testCommand, "npm test");
});

await runScenario("deriveFrameworkFromOverride handles python-like unknown framework", () => {
  const result = deriveFrameworkFromOverride("pyflakes");
  assert.equal(result.name, "pyflakes");
  assert.equal(result.language, "python");
  assert.equal(result.testCommand, "pytest");
});

await runScenario("deriveFrameworkFromOverride trims whitespace", () => {
  const result = deriveFrameworkFromOverride("  jest  ");
  assert.equal(result.name, "jest");
  assert.equal(result.language, "typescript");
  assert.equal(result.testCommand, "npx jest");
});

await runScenario("buildIntegrationTestPrompt extracts goal from carry_forward.task_spec.goal", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const planArtifact = makePlanArtifact();
    // The fixture already has carry_forward.task_spec.goal = "Add user authentication to the application"
    const ctx = makePromptBuildContext({ repoRoot: dir, planArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("Add user authentication to the application"),
      "prompt should contain goal from carry_forward.task_spec.goal"
    );
  });
});

await runScenario("buildIntegrationTestPrompt falls back to purpose when task_spec.goal is missing", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const planArtifact = makePlanArtifact();
    // Remove task_spec goal
    (planArtifact.carry_forward as any).task_spec = { goal: undefined };
    planArtifact.purpose = "Fallback purpose goal";

    const ctx = makePromptBuildContext({ repoRoot: dir, planArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("Fallback purpose goal"),
      "prompt should fall back to purpose when task_spec.goal is missing"
    );
  });
});

await runScenario("buildIntegrationTestPrompt falls back to summary when both task_spec.goal and purpose are missing", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const planArtifact = makePlanArtifact();
    (planArtifact.carry_forward as any).task_spec = {};
    (planArtifact as any).purpose = undefined;
    planArtifact.summary = "Fallback summary goal";

    const ctx = makePromptBuildContext({ repoRoot: dir, planArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("Fallback summary goal"),
      "prompt should fall back to summary when both goal and purpose are missing"
    );
  });
});

await runScenario("buildIntegrationTestPrompt falls back to 'Unknown goal' when nothing available", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const planArtifact = makePlanArtifact();
    (planArtifact.carry_forward as any).task_spec = {};
    (planArtifact as any).purpose = undefined;
    planArtifact.summary = undefined as any;

    const ctx = makePromptBuildContext({ repoRoot: dir, planArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("Unknown goal"),
      "prompt should fall back to 'Unknown goal' when nothing available"
    );
  });
});

await runScenario("buildIntegrationTestPrompt prompt contains correct section headers", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    // Verify key sections are present
    assert.ok(result.prompt.includes("# System Role"), "prompt should have System Role section");
    assert.ok(result.prompt.includes("# Goal"), "prompt should have Goal section");
    assert.ok(result.prompt.includes("# Workstream Execution Results"), "prompt should have Workstream section");
    assert.ok(result.prompt.includes("# Plan Items"), "prompt should have Plan Items section");
    assert.ok(result.prompt.includes("# Verification Constraints"), "prompt should have Constraints section");
    assert.ok(result.prompt.includes("# Changed Files"), "prompt should have Changed Files section");
    assert.ok(result.prompt.includes("# Existing Tests"), "prompt should have Existing Tests section");
    assert.ok(result.prompt.includes("# Test Framework"), "prompt should have Test Framework section");
    assert.ok(result.prompt.includes("# Your Task"), "prompt should have Your Task section");
  });
});

await runScenario("buildIntegrationTestPrompt with empty workstreams shows no workstreams message", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const execArtifact = makeExecuteArtifact([]);
    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("No workstreams were executed"), "should show message for empty workstreams");
  });
});

await runScenario("buildIntegrationTestPrompt with no findings/constraints shows no constraints message", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const verifyArtifact = makeVerifyArtifact({
      findings: [],
      constraints: [],
    } as Partial<VerifyArtifact>);

    const ctx = makePromptBuildContext({ repoRoot: dir, verifyArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("No specific constraints detected"), "should show no constraints message");
  });
});

await runScenario("buildIntegrationTestPrompt with empty plan items shows no plan items message", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const planArtifact = makePlanArtifact();
    planArtifact.plan_items = [];

    const ctx = makePromptBuildContext({ repoRoot: dir, planArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("No plan items found"), "should show no plan items message");
  });
});

await runScenario("buildIntegrationTestPrompt SHA-256 hash is different for different inputs", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx1 = makePromptBuildContext({
      repoRoot: dir,
      executeArtifact: makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", title: "Feature A" }),
      ]),
    });

    const ctx2 = makePromptBuildContext({
      repoRoot: dir,
      executeArtifact: makeExecuteArtifact([
        makeWorkstream({ workstreamId: "ws-1", title: "Feature B" }),
      ]),
    });

    const result1 = await buildIntegrationTestPrompt(ctx1);
    const result2 = await buildIntegrationTestPrompt(ctx2);

    assert.notEqual(result1.promptHash, result2.promptHash, "different inputs should produce different hashes");
  });
});

// ---------------------------------------------------------------------------
// Workstream health context in prompt (Task 6)
// ---------------------------------------------------------------------------

await runScenario("Prompt includes workstream health context when health is passed", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ workstreamId: "ws-1", title: "Feature A", state: "completed" }),
      makeWorkstream({ workstreamId: "ws-2", title: "Feature B", state: "failed", error: "timeout" }),
    ]);

    const health: import("../src/integrate/types.js").WorkstreamHealth = {
      completed: [execArtifact.workstreams[0]],
      failed: [execArtifact.workstreams[1]],
      partial: [],
      unknown: [],
    };

    const healthContext = "# Workstream Health Summary\n\nCompleted: 1 | Failed: 1 | Partial: 0";

    const ctx = makePromptBuildContext({
      repoRoot: dir,
      executeArtifact: execArtifact,
      workstreamHealth: health,
      workstreamHealthContext: healthContext,
    });

    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("Workstream Health Summary"),
      "prompt should contain health summary heading"
    );
    assert.ok(
      result.prompt.includes("Completed: 1 | Failed: 1 | Partial: 0"),
      "prompt should contain health summary counts"
    );
  });
});

await runScenario("Prompt health section lists completed, failed, and partial workstreams separately", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ workstreamId: "ws-1", title: "Auth feature", state: "completed" }),
      makeWorkstream({ workstreamId: "ws-2", title: "DB migration", state: "failed", error: "connection refused" }),
      makeWorkstream({ workstreamId: "ws-3", title: "Cache layer", state: "partial" }),
    ]);

    const health: import("../src/integrate/types.js").WorkstreamHealth = {
      completed: [execArtifact.workstreams[0]],
      failed: [execArtifact.workstreams[1]],
      partial: [execArtifact.workstreams[2]],
      unknown: [],
    };

    const healthContext = [
      "# Workstream Health Summary",
      "",
      "Completed: 1 | Failed: 1 | Partial: 1",
      "",
      "## Completed Workstreams (focus integration tests here)",
      "- ws-1: Auth feature",
      "",
      "## Failed Workstreams (tests may need to work around these)",
      "- ws-2: DB migration — connection refused",
      "",
      "## Partial Workstreams",
      "- ws-3: Cache layer",
      "",
    ].join("\n");

    const ctx = makePromptBuildContext({
      repoRoot: dir,
      executeArtifact: execArtifact,
      workstreamHealth: health,
      workstreamHealthContext: healthContext,
    });

    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(
      result.prompt.includes("ws-1"),
      "prompt should contain completed workstream ID"
    );
    assert.ok(
      result.prompt.includes("ws-2"),
      "prompt should contain failed workstream ID"
    );
    assert.ok(
      result.prompt.includes("ws-3"),
      "prompt should contain partial workstream ID"
    );
    assert.ok(
      result.prompt.includes("Completed Workstreams"),
      "prompt should contain Completed Workstreams heading"
    );
    assert.ok(
      result.prompt.includes("Failed Workstreams"),
      "prompt should contain Failed Workstreams heading"
    );
    assert.ok(
      result.prompt.includes("Partial Workstreams"),
      "prompt should contain Partial Workstreams heading"
    );
  });
});

// ---------------------------------------------------------------------------
// Phase A: Parallel file reads — getChangedFileContents tests
// ---------------------------------------------------------------------------

await runScenario("getChangedFileContents reads multiple files in parallel", async () => {
  await withTempDir(async (dir) => {
    // Create 5 temp files
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    const files = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
    for (const f of files) {
      await fs.writeFile(path.join(dir, "src", f), `// content of ${f}`);
    }

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        workstreamId: "ws-1",
        changesMade: files.map((f, i) => makeChangeMade({ file: `src/${f}`, action: "modify" })),
      }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 5);
    for (const entry of result) {
      assert.ok(entry.content !== null, `file ${entry.path} should have content`);
      assert.ok(entry.content!.includes("// content of"), `file ${entry.path} should have correct content`);
      assert.equal(entry.warning, null);
    }
  });
});

await runScenario("getChangedFileContents handles all missing files gracefully in parallel", async () => {
  await withTempDir(async (dir) => {
    const files = ["missing1.ts", "missing2.ts", "missing3.ts"];
    const execArtifact = makeExecuteArtifact([
      makeWorkstream({
        workstreamId: "ws-1",
        changesMade: files.map((f) => makeChangeMade({ file: `src/${f}`, action: "create" })),
      }),
    ]);

    const { files: result } = await getChangedFileContents(execArtifact, dir);
    assert.equal(result.length, 3);
    for (const entry of result) {
      assert.equal(entry.content, null, `file ${entry.path} should have null content`);
      assert.ok(entry.warning !== null, `file ${entry.path} should have a warning`);
      assert.ok(entry.warning!.includes("Could not read file"), `warning should mention read failure`);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase B: discoverExistingTests tests
// ---------------------------------------------------------------------------

await runScenario("discoverExistingTests finds test files in tests directory", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "tests"), { recursive: true });
    await fs.writeFile(path.join(dir, "tests", "foo.test.ts"), "// test");
    await fs.writeFile(path.join(dir, "tests", "bar.spec.ts"), "// spec");
    await fs.writeFile(path.join(dir, "tests", "baz.test.js"), "// test js");
    await fs.writeFile(path.join(dir, "tests", "qux.spec.js"), "// spec js");
    await fs.writeFile(path.join(dir, "tests", "helper.ts"), "// not a test");
    await fs.writeFile(path.join(dir, "tests", "main.py"), "// not a test");

    const result = await discoverExistingTests(dir);
    assert.ok(result.includes("tests/foo.test.ts"), "should find .test.ts");
    assert.ok(result.includes("tests/bar.spec.ts"), "should find .spec.ts");
    assert.ok(result.includes("tests/baz.test.js"), "should find .test.js");
    assert.ok(result.includes("tests/qux.spec.js"), "should find .spec.js");
    assert.ok(!result.includes("tests/helper.ts"), "should not find non-test .ts");
    assert.ok(!result.includes("tests/main.py"), "should not find .py without _test");
  });
});

await runScenario("discoverExistingTests returns empty array when no tests directory", async () => {
  await withTempDir(async (dir) => {
    // No tests/ directory created
    const result = await discoverExistingTests(dir);
    assert.ok(Array.isArray(result), "should return an array");
    assert.equal(result.length, 0, "should be empty");
  });
});

await runScenario("discoverExistingTests ignores node_modules and dist directories", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "tests", "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(dir, "tests", "dist"), { recursive: true });
    await fs.mkdir(path.join(dir, "tests"), { recursive: true });

    // These should be excluded
    await fs.writeFile(path.join(dir, "tests", "node_modules", "pkg", "index.test.ts"), "// should be excluded");
    await fs.writeFile(path.join(dir, "tests", "dist", "bundle.test.js"), "// should be excluded");

    // This should be included
    await fs.writeFile(path.join(dir, "tests", "real.test.ts"), "// real test");

    const result = await discoverExistingTests(dir);
    assert.ok(result.includes("tests/real.test.ts"), "should find real test file");
    assert.ok(!result.some((p: string) => p.includes("node_modules")), "should exclude node_modules");
    assert.ok(!result.some((p: string) => p.includes("dist")), "should exclude dist");
  });
});

// ---------------------------------------------------------------------------
// Phase C: Context size warning tests
// ---------------------------------------------------------------------------

await runScenario("buildIntegrationTestPrompt includes context warning for large prompts", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    await fs.mkdir(path.join(dir, "src"), { recursive: true });

    // Create changes that produce a very large prompt (>400k chars => ~100k tokens)
    const changes: ChangeMade[] = [];
    // Create multiple large files
    for (let i = 0; i < 25; i++) {
      const bigContent = "x".repeat(20_000); // 20k chars each
      await fs.writeFile(path.join(dir, "src", `big${i}.ts`), bigContent);
      changes.push(makeChangeMade({ file: `src/big${i}.ts`, action: "modify" }));
    }

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ workstreamId: "ws-1", changesMade: changes }),
    ]);
    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(result.prompt.includes("WARNING"), "large prompt should contain WARNING");
    assert.ok(result.prompt.includes("context limits"), "large prompt should mention context limits");
  });
});

await runScenario("buildIntegrationTestPrompt has no context warning for normal prompts", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );

    const ctx = makePromptBuildContext({ repoRoot: dir });
    const result = await buildIntegrationTestPrompt(ctx);

    assert.ok(!result.prompt.includes("WARNING"), "normal prompt should not contain WARNING");
  });
});

// ---------------------------------------------------------------------------
// Phase D: File cap at 20 tests
// ---------------------------------------------------------------------------

await runScenario("buildFileSection caps output at 20 files with overflow note", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    await fs.mkdir(path.join(dir, "src"), { recursive: true });

    // Create 25 changed files
    const changes: ChangeMade[] = [];
    for (let i = 0; i < 25; i++) {
      await fs.writeFile(path.join(dir, "src", `file${i}.ts`), `// file ${i}`);
      changes.push(makeChangeMade({ file: `src/file${i}.ts`, action: "modify" }));
    }

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ workstreamId: "ws-1", changesMade: changes }),
    ]);
    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    // Should show header with "(25 files — showing first 20)"
    assert.ok(
      result.prompt.includes("showing first 20"),
      "prompt should indicate showing first 20 files"
    );
    // Should show overflow note
    assert.ok(
      result.prompt.includes("5 more files"),
      "prompt should indicate 5 more files"
    );
  });
});

await runScenario("buildFileSection shows all files when count is 20 or less", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "jest" } })
    );
    await fs.mkdir(path.join(dir, "src"), { recursive: true });

    // Create 15 changed files
    const changes: ChangeMade[] = [];
    for (let i = 0; i < 15; i++) {
      await fs.writeFile(path.join(dir, "src", `small${i}.ts`), `// small file ${i}`);
      changes.push(makeChangeMade({ file: `src/small${i}.ts`, action: "modify" }));
    }

    const execArtifact = makeExecuteArtifact([
      makeWorkstream({ workstreamId: "ws-1", changesMade: changes }),
    ]);
    const ctx = makePromptBuildContext({ repoRoot: dir, executeArtifact: execArtifact });
    const result = await buildIntegrationTestPrompt(ctx);

    // Should NOT show "(...files — showing first 20)"
    assert.ok(
      !result.prompt.includes("showing first 20"),
      "prompt should not mention file cap for <= 20 files"
    );
    // Should NOT show "more files" overflow note
    assert.ok(
      !result.prompt.includes("more files"),
      "prompt should not mention overflow for <= 20 files"
    );
    // All files should be present
    for (let i = 0; i < 15; i++) {
      assert.ok(
        result.prompt.includes(`src/small${i}.ts`),
        `prompt should include file small${i}.ts`
      );
    }
  });
});

function makeIntegrationTestFile(path: string, content: string): IntegrationTestFile {
  return {
    path,
    content,
    testCount: 1,
    language: "typescript",
    framework: "npm",
  };
}

// ---------------------------------------------------------------------------
// normalizeIntegrationTestFilePaths
// ---------------------------------------------------------------------------

await runScenario(
  "normalizeIntegrationTestFilePaths fixes tests/integration.Foo → tests/integration/Foo",
  async () => {
    const out = normalizeIntegrationTestFilePaths([
      makeIntegrationTestFile(
        "tests/integration.dotenv-loading.test.ts",
        "describe('x', () => { it('y', () => { expect(1).toBe(1); }); });"
      ),
    ]);
    assert.equal(out[0]?.path, "tests/integration/dotenv-loading.test.ts");
  }
);

await runScenario(
  "normalizeIntegrationTestFilePaths leaves correct tests/integration/ paths unchanged",
  async () => {
    const out = normalizeIntegrationTestFilePaths([
      makeIntegrationTestFile(
        "tests/integration/dotenv-loading.test.ts",
        "describe('x', () => { it('y', () => { expect(1).toBe(1); }); });"
      ),
    ]);
    assert.equal(out[0]?.path, "tests/integration/dotenv-loading.test.ts");
  }
);

await runScenario(
  "normalizeIntegrationTestFilePaths normalizes backslashes before dot fix",
  async () => {
    const out = normalizeIntegrationTestFilePaths([
      makeIntegrationTestFile(
        "tests\\integration.cli.test.ts",
        "x"
      ),
    ]);
    assert.equal(out[0]?.path, "tests/integration/cli.test.ts");
  }
);

// ---------------------------------------------------------------------------
// resolveIntegrateTestCommand
// ---------------------------------------------------------------------------

await runScenario(
  "resolveIntegrateTestCommand uses vitest for describe/it/expect when detected npm",
  async () => {
    const cmd = resolveIntegrateTestCommand(
      [
        makeIntegrationTestFile(
          "tests/integration/foo.test.ts",
          "describe('x', () => { it('y', () => { expect(1).toBe(1); }); });"
        ),
      ],
      "npm"
    );
    assert.ok(cmd.includes("vitest run"), cmd);
    assert.ok(cmd.includes("vitest.config.integration.mts"), cmd);
    assert.ok(cmd.includes("tests/integration/foo.test.ts"), cmd);
  }
);

await runScenario("resolveIntegrateTestCommand keeps pytest baseline", async () => {
  const cmd = resolveIntegrateTestCommand(
    [
      makeIntegrationTestFile(
        "tests/test_a.py",
        "def test_foo():\n    assert 1\n"
      ),
    ],
    "pytest"
  );
  assert.equal(cmd, "pytest");
});

await runScenario("resolveIntegrateTestCommand uses jest when @jest/globals import present", async () => {
  const cmd = resolveIntegrateTestCommand(
    [
      makeIntegrationTestFile(
        "tests/a.test.ts",
        "import { describe, it, expect } from '@jest/globals';\ndescribe('x', () => { it('y', () => expect(1).toBe(1)); });\n"
      ),
    ],
    "npm"
  );
  assert.ok(cmd.startsWith("npx jest"), cmd);
  assert.ok(cmd.includes("tests/a.test.ts"), cmd);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write("\n--- Prompt Builder Tests Complete ---\n");
