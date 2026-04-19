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

import type { ExecuteArtifact, ExecuteWorkstream } from "../execute/types.js";
import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import { validatePlanArtifact } from "../plan/schema.js";
import { validateVerifyArtifact } from "../verify/schema.js";
import type {
  IntegrateCommandOptions,
  IntegrateCommandResult,
  IntegrationTestFile,
  TestRunResult,
  WorkstreamHealth,
} from "./types.js";

import { buildIntegrationTestPrompt, deriveFrameworkFromOverride } from "./prompt-builder.js";
import { runIntegrationTests } from "./test-runner.js";
import {
  buildIntegrateArtifact,
  writeIntegrateArtifact,
  buildFrozenArtifact,
} from "./artifact.js";
import { createIntegrationReport, createFrozenReport } from "./report.js";
import { loadModelConfig, callModel } from "../execute/model-connector.js";
import { extractJsonFromAIResponse } from "./extract-json.js";
import { classifyError } from "./errors.js";
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_FREEZE_CRITERIA,
  type RetryConfig,
  type ErrorClassification,
  type FreezeCriteria,
  type FreezeState,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = "1.0.0";
const FORGE_VERSION = "0.0.1";

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert an AIErrorType to the SPEC's error code format: AI_<UPPER_TYPE>
 * Special cases: parse_error -> AI_PARSE_FAILURE, unknown_error -> AI_UNKNOWN
 */
function aiErrorTypeToCode(type: string): string {
  if (type === "parse_error") return "AI_PARSE_FAILURE";
  if (type === "unknown_error") return "AI_UNKNOWN";
  return `AI_${type.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Workstream health classification
// ---------------------------------------------------------------------------

/**
 * Classify workstreams by their execution state into health categories.
 * Workstreams in "completed", "failed", or "partial" states are categorized
 * into their respective buckets. All other states (queued, running, blocked,
 * or missing) go into the "unknown" bucket.
 */
export function classifyWorkstreamHealth(
  workstreams: ExecuteWorkstream[]
): WorkstreamHealth {
  return {
    completed: workstreams.filter((ws) => ws.state === "completed"),
    failed: workstreams.filter((ws) => ws.state === "failed"),
    partial: workstreams.filter((ws) => ws.state === "partial"),
    unknown: workstreams.filter(
      (ws) => !ws.state || !["completed", "failed", "partial"].includes(ws.state)
    ),
  };
}

/**
 * Build a human-readable health summary section for the AI prompt.
 */
function buildWorkstreamHealthContext(health: WorkstreamHealth): string {
  const lines: string[] = [
    "# Workstream Health Summary",
    "",
    `Completed: ${health.completed.length} | Failed: ${health.failed.length} | Partial: ${health.partial.length}`,
    "",
  ];

  if (health.completed.length > 0) {
    lines.push("## Completed Workstreams (focus integration tests here)");
    for (const ws of health.completed) {
      lines.push(`- ${ws.workstreamId}: ${ws.title}`);
    }
    lines.push("");
  }

  if (health.failed.length > 0) {
    lines.push("## Failed Workstreams (tests may need to work around these)");
    for (const ws of health.failed) {
      lines.push(`- ${ws.workstreamId}: ${ws.title} — ${ws.error ?? "unknown error"}`);
    }
    lines.push("");
  }

  if (health.partial.length > 0) {
    lines.push("## Partial Workstreams");
    for (const ws of health.partial) {
      lines.push(`- ${ws.workstreamId}: ${ws.title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Freeze criteria check
// ---------------------------------------------------------------------------

/**
 * Determine whether the retry loop should freeze (stop and produce a
 * frozen artifact) instead of retrying or failing immediately.
 *
 * Freeze is triggered when:
 *  - The attempt count exceeds the configured maximum, OR
 *  - The elapsed time exceeds the configured maximum duration, OR
 *  - The last error type matches a configured freeze-on flag
 *    (authFailure, parseFailure, rateLimitHit).
 *
 * @param criteria   The freeze criteria configuration.
 * @param state      The current mutable freeze state.
 * @param lastError  The last classified error, or null if no error yet.
 * @param elapsedMs  Elapsed time in milliseconds since the retry loop started.
 * @returns True if the integration should freeze.
 */
export function shouldFreeze(
  criteria: FreezeCriteria,
  state: FreezeState,
  lastError: ErrorClassification | null,
  elapsedMs: number
): boolean {
  if (state.attemptCount > criteria.maxRetries) return true;
  if (elapsedMs > criteria.maxDurationMs) return true;
  if (lastError?.type === "auth_failure" && criteria.freezeOn.authFailure) return true;
  if (lastError?.type === "parse_error" && criteria.freezeOn.parseFailure) return true;
  if (lastError?.type === "rate_limit" && criteria.freezeOn.rateLimitHit) return true;
  return false;
}

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
    try {
      return validatePlanArtifact(JSON.parse(content));
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : String(validationError);
      console.warn(
        `Warning: plan.json at ${filePath} is invalid (${message}). Proceeding without plan context.`
      );
      return null;
    }
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
    try {
      return validateVerifyArtifact(JSON.parse(content));
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : String(validationError);
      console.warn(
        `Warning: verify.json at ${filePath} is invalid (${message}). Proceeding without verification context.`
      );
      return null;
    }
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
 * Derives the goal from the execute artifact's workstreams when available.
 */
function createPlanStub(executeArtifact: ExecuteArtifact): PlanArtifact {
  const derivedGoal =
    executeArtifact.workstreams[0]?.title ?? "Unknown task";
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
    summary: "Plan stub derived from execute artifact — plan.json was missing",
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
      task_spec: { goal: derivedGoal },
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
 * descriptors. Delegates to extractJsonFromAIResponse which tries multiple
 * extraction strategies (code-block, bare-array, embedded-array, fixed-json).
 *
 * Returns an empty array if extraction or validation fails.
 */
export function parseTestFilesFromAIResponse(
  rawResponse: string
): IntegrationTestFile[] {
  try {
    const result = extractJsonFromAIResponse(rawResponse);
    return result.files;
  } catch {
    return [];
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
  const health = classifyWorkstreamHealth(workstreams);

  if (workstreams.length === 0) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "NO_WORKSTREAMS",
      "execute.json contains no workstreams. Nothing to integrate.",
      1
    );
  }

  // If ALL workstreams failed, integration is meaningless
  if (
    health.completed.length === 0 &&
    health.failed.length === workstreams.length
  ) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "ALL_WORKSTREAMS_FAILED",
      "All workstreams in execute.json failed. Cannot run integration tests.",
      1
    );
  }

  // If ALL workstreams are unknown state, treat as no workstreams
  if (
    health.unknown.length === workstreams.length
  ) {
    return makeErrorResult(
      repoRoot,
      outputDir,
      "NO_WORKSTREAMS",
      "No valid workstreams found in execute.json.",
      1
    );
  }

  // Warn if some workstreams failed (but others completed)
  if (health.failed.length > 0 && health.completed.length > 0) {
    const msg = `Warning: ${health.failed.length}/${workstreams.length} workstreams failed. Integration will verify what was completed.`;
    if (options.auto) {
      console.warn(`[Auto] ${msg}`);
    } else {
      console.warn(msg);
    }
  }

  // ---- Step 3: Load plan.json and verify.json ----

  // Load each artifact only once — used by both --auto guard and stub fallback
  let planArtifact: PlanArtifact | null = await loadPlanArtifact(repoRoot);
  let verifyArtifact: VerifyArtifact | null = await loadVerifyArtifact(repoRoot);

  // In --auto mode, both plan.json and verify.json are required
  if (options.auto) {
    if (!planArtifact) {
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
    if (!verifyArtifact) {
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

  if (!planArtifact) {
    planArtifact = createPlanStub(executeArtifact);
    console.warn("Warning: plan.json not found. Using stub derived from execute artifact.");
  }

  if (!verifyArtifact) {
    verifyArtifact = createVerifyStub();
    console.warn("Warning: verify.json not found. Proceeding without verification context.");
  }

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
      workstreamHealth: health,
      workstreamHealthContext: buildWorkstreamHealthContext(health),
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

  // ---- Step 5: Call AI with retry loop (reused model-connector + error classification) ----

  let modelUsed = "";
  let rawResponse = "";
  const retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;
  const freezeCriteria: FreezeCriteria = DEFAULT_FREEZE_CRITERIA;
  const freezeState: FreezeState = { attemptCount: 0 };
  const startTime = Date.now();
  let lastClassification: ErrorClassification | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    freezeState.attemptCount = attempt;
    try {
      const config = loadModelConfig();
      rawResponse = await callModel(prompt, config);
      modelUsed = `${config.provider}/${config.modelName}`;
      // Success — exit retry loop
      break;
    } catch (err) {
      const classified = classifyError(err);
      lastClassification = classified;
      const elapsed = Date.now() - startTime;

      console.error(
        `[AI] Error (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}): ${classified.type}`
      );
      console.error(`[AI] ${classified.suggestion}`);

      // Check if we should freeze instead of retry
      if (shouldFreeze(freezeCriteria, freezeState, classified, elapsed)) {
        freezeState.frozenAt = new Date().toISOString();
        freezeState.finalError = `${classified.type}: ${classified.message}`;

        // Build and write frozen artifact
        const frozenArtifact = buildFrozenArtifact(
          executeArtifact,
          planArtifact,
          verifyArtifact,
          freezeState,
          classified
        );

        const frozenArtifactPath = path.join(outputDir, "integrate.json");
        const frozenReportPath = path.join(outputDir, "integration-report.md");

        try {
          await fs.mkdir(outputDir, { recursive: true });
          await writeIntegrateArtifact(frozenArtifactPath, frozenArtifact);
          const frozenReport = createFrozenReport(frozenArtifact, classified);
          await fs.writeFile(frozenReportPath, frozenReport, "utf-8");
        } catch {
          // Best effort — if writing fails, still return the frozen result
        }

        return {
          status: "failed",
          summary: `Integration frozen at ${freezeState.frozenAt}. ${classified.suggestion}`,
          artifactPath: frozenArtifactPath,
          reportPath: frozenReportPath,
          outputRoot: outputDir,
          exitCode: 1,
          failure: {
            code: "INTEGRATION_FROZEN",
            message: `Integration stopped: ${classified.type}. ${freezeState.finalError}`,
          },
        };
      }

      const isRetryableType =
        retryConfig.retryableErrors.includes(classified.type) && classified.retryable;

      if (!isRetryableType) {
        // Non-retryable — fail immediately with classified error code
        return {
          status: "failed",
          summary: `AI call failed (${classified.type}): ${classified.message}`,
          artifactPath: "",
          outputRoot: outputDir,
          exitCode: 1,
          failure: {
            code: aiErrorTypeToCode(classified.type),
            message: `${classified.message}\nSuggestion: ${classified.suggestion}`,
          },
        };
      }

      if (attempt < retryConfig.maxRetries) {
        const delay =
          classified.retryAfterMs ??
          retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
        console.error(`[AI] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // If we exhausted retries, report the last classified error
  if (lastClassification && !rawResponse) {
    return {
      status: "failed",
      summary: `AI call failed after ${retryConfig.maxRetries + 1} attempts (${lastClassification.type}): ${lastClassification.message}`,
      artifactPath: "",
      outputRoot: outputDir,
      exitCode: 1,
      failure: {
        code: aiErrorTypeToCode(lastClassification.type),
        message: `${lastClassification.message}\nSuggestion: ${lastClassification.suggestion}`,
      },
    };
  }

  // ---- Step 6: Parse AI response to extract test files ----

  let testFiles: IntegrationTestFile[];

  try {
    const extractResult = extractJsonFromAIResponse(rawResponse);
    testFiles = extractResult.files;
    console.log(`[AI] Parsed JSON via: ${extractResult.method}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResult(
      repoRoot,
      outputDir,
      "AI_GENERATION_FAILED",
      `Failed to parse AI response: ${message}`,
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
