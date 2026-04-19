// ---------------------------------------------------------------------------
// Integrate step — CLI command runner
// ---------------------------------------------------------------------------
// Implements `forge integrate` — the Step 6 command that verifies the whole
// system works together after execution. Loads execute.json (required),
// plan.json and verify.json (optional), builds an AI integration-test prompt,
// calls the AI model, runs generated tests, and produces integrate.json plus
// integration-report.md.
//
// Exported functions:
//   runIntegrateCommand(options)  — the main command entrypoint
//   parseTestFilesFromAIResponse() — extract test files from AI raw response
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "node:path";

import type { ExecuteArtifact } from "../execute/types.js";
import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import type {
  IntegrateCommandOptions,
  IntegrateCommandResult,
  IntegrationTestFile,
  TestRunResult,
} from "./types.js";

import { buildIntegrationTestPrompt, deriveFrameworkFromOverride } from "./prompt-builder.js";
import { runIntegrationTests } from "./test-runner.js";
import {
  buildIntegrateArtifact,
  writeIntegrateArtifact,
} from "./artifact.js";
import { createIntegrationReport } from "./report.js";
import { loadModelConfig, callModel } from "../execute/model-connector.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = "1.0.0";
const FORGE_VERSION = "0.0.1";

// ---------------------------------------------------------------------------
// Artifact loaders
// ---------------------------------------------------------------------------

/**
 * Load and parse the execute artifact from .forge/execute.json.
 * Returns null if the file does not exist.
 */
async function loadExecuteArtifact(
  repoRoot: string
): Promise<ExecuteArtifact | null> {
  const filePath = path.join(repoRoot, ".forge", "execute.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as ExecuteArtifact;
  } catch {
    return null;
  }
}

/**
 * Load and parse the plan artifact from .forge/plan.json.
 * Returns null if the file does not exist, logging a warning.
 */
async function loadPlanArtifact(
  repoRoot: string
): Promise<PlanArtifact | null> {
  const filePath = path.join(repoRoot, ".forge", "plan.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as PlanArtifact;
  } catch {
    console.warn(
      `Warning: plan.json not found at ${filePath} — proceeding without plan context.`
    );
    return null;
  }
}

/**
 * Load and parse the verify artifact from .forge/verify.json.
 * Returns null if the file does not exist, logging a warning.
 */
async function loadVerifyArtifact(
  repoRoot: string
): Promise<VerifyArtifact | null> {
  const filePath = path.join(repoRoot, ".forge", "verify.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as VerifyArtifact;
  } catch {
    console.warn(
      `Warning: verify.json not found at ${filePath} — proceeding without verification constraints.`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal stubs for missing optional artifacts
// ---------------------------------------------------------------------------
// PlanArtifact and VerifyArtifact carry deeply-nested IntakeArtifact sections
// with strict readonly-union-array fields that make literal construction
// extremely verbose. Since these are only fallback stubs used when the
// corresponding JSON file is missing, we use `as unknown as X` type assertions.
// The downstream consumers (prompt-builder, artifact) access these safely
// with optional chaining and type-casts on carry_forward.
// ---------------------------------------------------------------------------

/**
 * Create a minimal PlanArtifact stub when plan.json is missing.
 * Populates the field actually accessed by the prompt builder and artifact
 * builder: carry_forward, summary, plan_items.
 */
function createPlanStub(): PlanArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "plan",
    stage: "step-2",
    status: "ready",
    purpose: "Plan artifact unavailable",
    repoRoot: "",
    requestedOutputRoot: null,
    outputRoot: ".forge",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: ".forge",
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: { artifactPath: null, reportPath: null },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    summary: "Plan context unavailable — integration proceeding without plan",
    boundaryNotes: [],
    source_intake: {
      artifactPath: "",
      command: "intake",
      status: "warning",
      summary: "Stub — plan.json was missing",
      readyForPlanning: false,
    },
    plan_item_contract: {} as PlanArtifact["plan_item_contract"],
    plan_items: [],
    dependency_graph: [],
    conflict_zones: [],
    test_obligations: [],
    parallelization_signals: [],
    carry_forward: {
      task_spec: { goal: "" },
    } as unknown as PlanArtifact["carry_forward"],
    planning_diagnostics: {
      usability_status: "non_actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
      planning_assist: {
        outcome: "not_attempted",
        attempted: false,
        used: false,
        provider: null,
        warnings: [],
        ignoredEdits: [],
        reportNotes: [],
      },
    },
    planning_readiness: {
      ready: false,
      status: "blocked",
      summary: "Plan artifact unavailable",
      warning_items: [],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: [],
      recommended_user_actions: [],
    },
    failure: null,
  };
}

/**
 * Create a minimal VerifyArtifact stub when verify.json is missing.
 * Populates the fields actually accessed: findings, constraints,
 * carry_forward.
 */
function createVerifyStub(): VerifyArtifact {
  return {
    schemaVersion: "1.0.0",
    command: "verify",
    stage: "step-3",
    status: "ready",
    purpose: "Verify artifact unavailable",
    repoRoot: "",
    requestedOutputRoot: null,
    outputRoot: ".forge",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: ".forge",
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
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    summary:
      "Verify context unavailable — integration proceeding without constraints",
    boundaryNotes: [],
    source_plan: {
      artifactPath: "",
      command: "plan",
      repoRoot: "",
      status: "ready",
      summary: "Stub — verify.json was missing",
      readyForVerification: false,
      planningReadinessStatus: "blocked",
      planning_diagnostics: {
        usability_status: "non_actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
        planning_assist: {
          outcome: "not_attempted",
          attempted: false,
          used: false,
          provider: null,
          warnings: [],
          ignoredEdits: [],
          reportNotes: [],
        },
      },
      planning_readiness: {
        ready: false,
        status: "blocked",
        summary: "",
        warning_items: [],
        blocking_issues: [],
        partial_output: null,
        constraining_concern_ids: [],
        recommended_user_actions: [],
      },
      failure: null,
    },
    verification_target_contract:
      {} as VerifyArtifact["verification_target_contract"],
    formal_lane_contract: {} as VerifyArtifact["formal_lane_contract"],
    verification_targets: [],
    verification_cases: [],
    structural_verification: {
      status: "not_run",
      summary: "No verification context",
      findings: [],
      constraints: [],
    },
    formal_verification: {
      status: "not_run",
      summary: "No verification context",
      caution_notes: [],
      state_models: [],
      tla_specs: [],
      tlc_results: [],
      findings: [],
      constraints: [],
    },
    findings: [],
    constraints: [],
    carry_forward: {
      task_spec: { goal: "" },
    } as unknown as VerifyArtifact["carry_forward"],
    verification_diagnostics: {
      usability_status: "non_actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
    },
    verification_readiness: {
      ready: false,
      status: "blocked",
      summary: "Verify artifact unavailable",
      warning_items: [],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: [],
      recommended_user_actions: [],
    },
    failure: null,
  };
}

// ---------------------------------------------------------------------------
// Parse AI response for integration test files
// ---------------------------------------------------------------------------

/**
 * Parse the AI model's raw response to extract a JSON array of test file
 * descriptors. The AI is expected to return a JSON array where each element
 * has { path, content, language, framework, testCount }.
 *
 * Tries two extraction strategies:
 *   1. Look for a JSON code block (```json ... ```)
 *   2. Fall back to finding a bare JSON array in the text
 */
export function parseTestFilesFromAIResponse(
  rawResponse: string
): IntegrationTestFile[] {
  // Strategy 1: Extract from a ```json code block
  const jsonBlockMatch = rawResponse.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    const parsed = tryParseTestFileArray(jsonBlockMatch[1]);
    if (parsed) return parsed;
  }

  // Strategy 2: Look for a bare JSON array anywhere in the response
  const bareArrayMatch = rawResponse.match(/\[[\s\S]*\]/);
  if (bareArrayMatch) {
    const parsed = tryParseTestFileArray(bareArrayMatch[0]);
    if (parsed) return parsed;
  }

  return [];
}

/**
 * Try to parse a string as a JSON array of test file descriptors.
 * Returns null if parsing fails or the result is not a valid array.
 */
function tryParseTestFileArray(jsonStr: string): IntegrationTestFile[] | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    const testFiles: IntegrationTestFile[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;

      const obj = item as Record<string, unknown>;
      testFiles.push({
        path: typeof obj.path === "string" ? obj.path : "unknown.test.ts",
        testCount: typeof obj.testCount === "number" ? obj.testCount : 0,
        language:
          typeof obj.language === "string" ? obj.language : "typescript",
        framework: typeof obj.framework === "string" ? obj.framework : "jest",
        content: typeof obj.content === "string" ? obj.content : undefined,
      });
    }

    return testFiles;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function makeErrorResult(
  repoRoot: string,
  outputDir: string,
  code: string,
  message: string,
  exitCode: number
): IntegrateCommandResult {
  return {
    status: "failed",
    summary: message,
    artifactPath: "",
    outputRoot: outputDir,
    exitCode,
    failure: { code, message },
  };
}

// ---------------------------------------------------------------------------
// runIntegrateCommand
// ---------------------------------------------------------------------------

/**
 * Run the `forge integrate` command.
 *
 * Flow:
 *   1. Load execute.json (required) — fail with NO_EXECUTE_ARTIFACT if missing
 *   2. Load plan.json (optional with warning) and verify.json (optional with warning)
 *   3. Check workstreams — fail with NO_WORKSTREAMS if empty, or ALL_WORKSTREAMS_FAILED if all failed
 *   4. Build integration test prompt via buildIntegrationTestPrompt
 *   5. Call AI via loadModelConfig + callModel (reused from model-connector — no new connector)
 *   6. Parse AI response to extract JSON array of test files
 *   7. Run tests via runIntegrationTests
 *   8. Build artifact via buildIntegrateArtifact
 *   9. Write integrate.json and integration-report.md
 *  10. Return result: exit code 0 when all pass, 1 when failures
 */
export async function runIntegrateCommand(
  options: IntegrateCommandOptions = {}
): Promise<IntegrateCommandResult> {
  const repoRoot = options.repo ?? process.cwd();
  const outputDir = options.outputDir ?? path.join(repoRoot, ".forge");

  // ---- Step 1.5: --force guard — check if integrate.json already exists ----

  const integrateJsonPath = path.join(outputDir, "integrate.json");
  try {
    await fs.access(integrateJsonPath);
    // File exists — if --force is not set, fail early
    if (!options.force) {
      return {
        status: "failed",
        summary: `integrate.json already exists at ${integrateJsonPath}. Use --force to re-run.`,
        artifactPath: integrateJsonPath,
        outputRoot: outputDir,
        exitCode: 1,
        failure: {
          code: "INTEGRATE_ALREADY_EXISTS",
          message: "integrate.json already exists. Run with --force to re-run integration.",
        },
      };
    }
  } catch {
    // File does not exist — proceed normally
  }

  // ---- Step 2: Load execute.json (required) ----

  const executeArtifact = await loadExecuteArtifact(repoRoot);
  if (!executeArtifact) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "NO_EXECUTE_ARTIFACT",
      "execute.json not found. Run 'forge execute' first.",
      1
    );
  }

  // ---- Step 2: Check workstreams ----

  const workstreams = executeArtifact.workstreams ?? [];

  if (workstreams.length === 0) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "NO_WORKSTREAMS",
      "execute.json contains no workstreams. Nothing to integrate.",
      1
    );
  }

  const allFailed = workstreams.every((ws) => ws.state === "failed");
  if (allFailed) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "ALL_WORKSTREAMS_FAILED",
      "All workstreams in execute.json failed. Cannot run integration tests.",
      1
    );
  }

  // ---- Step 3: Load plan.json and verify.json ----

  // In --auto mode, both plan.json and verify.json are required
  if (options.auto) {
    const planLoaded = await loadPlanArtifact(repoRoot);
    if (!planLoaded) {
      return {
        status: "failed",
        summary: "plan.json not found. --auto mode requires plan.json.",
        artifactPath: "",
        outputRoot: repoRoot,
        exitCode: 1,
        failure: {
          code: "PLAN_REQUIRED",
          message: "plan.json required for --auto mode",
        },
      };
    }
    const verifyLoaded = await loadVerifyArtifact(repoRoot);
    if (!verifyLoaded) {
      return {
        status: "failed",
        summary: "verify.json not found. --auto mode requires verify.json.",
        artifactPath: "",
        outputRoot: repoRoot,
        exitCode: 1,
        failure: {
          code: "VERIFY_REQUIRED",
          message: "verify.json required for --auto mode",
        },
      };
    }
    process.env.FORGE_NO_COLOR = "true";
  }

  const planArtifact =
    (await loadPlanArtifact(repoRoot)) ?? createPlanStub();
  const verifyArtifact =
    (await loadVerifyArtifact(repoRoot)) ?? createVerifyStub();

  // ---- Step 4: Build integration test prompt ----

  let prompt: string;
  let testCommand: string;

  try {
    const builtPrompt = await buildIntegrationTestPrompt({
      executeArtifact,
      planArtifact,
      verifyArtifact,
      repoRoot,
      testFramework: options.testFramework,
    });
    prompt = builtPrompt.prompt;
    // Derive the framework-specific test command from detected framework name
    testCommand = deriveFrameworkFromOverride(builtPrompt.detectedFramework).testCommand;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResult(
      repoRoot,
      outputDir,
      "AI_GENERATION_FAILED",
      `Failed to build integration test prompt: ${message}`,
      1
    );
  }

  // ---- Step 5: Call AI via loadModelConfig + callModel (reused from model-connector) ----

  let modelUsed: string;
  let rawResponse: string;

  try {
    const config = loadModelConfig();
    rawResponse = await callModel(prompt, config);
    modelUsed = `${config.provider}/${config.modelName}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResult(
      repoRoot,
      outputDir,
      "AI_GENERATION_FAILED",
      `AI model call failed: ${message}`,
      1
    );
  }

  // ---- Step 6: Parse AI response to extract test files ----

  const testFiles = parseTestFilesFromAIResponse(rawResponse);

  if (testFiles.length === 0) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "NO_TEST_FILES_GENERATED",
      "AI model did not generate any test files. Try adjusting the prompt or providing more context.",
      1
    );
  }

  // ---- Step 7: Run the generated tests ----

  let testResult: TestRunResult;

  try {
    testResult = await runIntegrationTests(testFiles, repoRoot, testCommand);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResult(
      repoRoot,
      outputDir,
      "TEST_RUN_FAILED",
      `Test runner failed: ${message}`,
      1
    );
  }

  // ---- Step 8: Build the integrate artifact ----

  const artifact = buildIntegrateArtifact({
    executeArtifact,
    planArtifact,
    verifyArtifact,
    testResult,
    aiModelUsed: modelUsed,
    schemaVersion: SCHEMA_VERSION,
    forgeVersion: FORGE_VERSION,
  });

  // ---- Step 9: Write integrate.json and integration-report.md ----

  const artifactPath = path.join(outputDir, "integrate.json");
  const reportPath = path.join(outputDir, "integration-report.md");

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await writeIntegrateArtifact(artifactPath, artifact);

    const report = createIntegrationReport(artifact);
    await fs.writeFile(reportPath, report, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResult(
      repoRoot,
      outputDir,
      "IO_ERROR",
      `Failed to write integrate outputs: ${message}`,
      1
    );
  }

  // ---- Step 10: Return result ----

  const hasFailures = artifact.summary.failed > 0;
  const exitCode = hasFailures ? 1 : 0;
  const status: "ready" | "failed" = hasFailures ? "failed" : "ready";

  const resultSummary = hasFailures
    ? `Integration complete with ${artifact.summary.failed} failure(s) out of ${artifact.summary.total} test(s)`
    : `All ${artifact.summary.total} integration tests passed`;

  return {
    status,
    summary: resultSummary,
    artifactPath,
    reportPath,
    outputRoot: outputDir,
    exitCode,
  };
}
