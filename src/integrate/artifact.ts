// ---------------------------------------------------------------------------
// Integrate step — artifact builder and writer
// ---------------------------------------------------------------------------
// Builds the IntegrateArtifact from step inputs, test results, and metadata,
// then writes it to disk as a validated JSON file.
//
// Two exported functions:
//   buildIntegrateArtifact(params) — assembles and validates an IntegrateArtifact
//   writeIntegrateArtifact(artifactPath, artifact) — writes artifact as JSON
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "node:path";

import type { ExecuteArtifact } from "../execute/types.js";
import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import type { AIModelInfo } from "../execute/types.js";
import type {
  IntegrationTestCase,
  IntegrationTestFile,
  IntegrationSummary,
  IntegrateArtifact,
  TestRunResult,
} from "./types.js";
import { validateIntegrateArtifact } from "./schema.js";

// ---------------------------------------------------------------------------
// buildIntegrateArtifact
// ---------------------------------------------------------------------------

/** Parameters for building an IntegrateArtifact. */
export interface BuildIntegrateArtifactParams {
  /** The execute artifact from Step 5. */
  executeArtifact: ExecuteArtifact;
  /** The plan artifact from Step 2. */
  planArtifact: PlanArtifact;
  /** The verify artifact from Step 3. */
  verifyArtifact: VerifyArtifact;
  /** Result of running the generated integration tests. */
  testResult: TestRunResult;
  /** AI model identifier used for generating tests (e.g. "openai/gpt-4o"). */
  aiModelUsed: string;
  /** AI configuration used during this step. */
  aiConfig?: AIModelInfo;
  /** Schema version for the artifact. */
  schemaVersion: string;
  /** Forge CLI version that produced this artifact. */
  forgeVersion: string;
}

/**
 * Build an IntegrateArtifact from step inputs, test results, and metadata.
 *
 * - Derives the **goal** from `planArtifact.carry_forward.task_spec.goal`,
 *   `planArtifact.purpose`, or `planArtifact.summary`, falling back to
 *   "Unknown goal".
 * - Summarises workstream execution outcomes as a human-readable string
 *   containing total, completed, failed, and totalChangesMade counts.
 * - Collects **recommendations** from test cases with status "failed" that
 *   carry a non-empty `recommendation` field.
 * - The returned artifact is validated against `IntegrateArtifactSchema`
 *   before being returned.
 */
export function buildIntegrateArtifact(
  params: BuildIntegrateArtifactParams
): IntegrateArtifact {
  const {
    executeArtifact,
    planArtifact,
    verifyArtifact,
    testResult,
    aiModelUsed,
    schemaVersion,
    forgeVersion,
  } = params;

  // 1. Derive the goal
  const goal = extractGoal(planArtifact);

  // 2. Build workstreams summary
  const workstreamsSummary = buildWorkstreamsSummary(executeArtifact);

  // 3. Collect recommendations from failed tests
  const recommendations = collectRecommendations(testResult.tests);

  // 4. Build the IntegrationSummary
  const summary = buildSummary(testResult, aiModelUsed);

  // 5. Assemble the artifact
  const artifact: IntegrateArtifact = {
    schemaVersion,
    forgeVersion,
    createdAt: new Date().toISOString(),
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal,
    workstreamsSummary,
    tests: testResult.tests,
    testFiles: testResult.testFiles,
    summary,
    recommendations,
  };

  // 6. Validate and return
  return validateIntegrateArtifact(artifact);
}

// ---------------------------------------------------------------------------
// writeIntegrateArtifact
// ---------------------------------------------------------------------------

/**
 * Write the IntegrateArtifact to disk as JSON with 2-space indentation.
 * Creates parent directories recursively if they don't exist.
 *
 * @param artifactPath  Absolute or relative path to the output JSON file.
 * @param artifact      The validated IntegrateArtifact to write.
 */
export async function writeIntegrateArtifact(
  artifactPath: string,
  artifact: IntegrateArtifact
): Promise<void> {
  // Ensure the parent directory exists
  const dir = path.dirname(artifactPath);
  await fs.mkdir(dir, { recursive: true });

  // Write with 2-space indentation
  const json = JSON.stringify(artifact, null, 2);
  await fs.writeFile(artifactPath, json, "utf-8");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the goal from the plan artifact.
 * Tries carry_forward.task_spec.goal, then purpose, then summary,
 * then falls back to "Unknown goal".
 */
function extractGoal(planArtifact: PlanArtifact): string {
  const cf = planArtifact.carry_forward as
    | { task_spec?: { goal?: string } }
    | undefined;

  if (cf?.task_spec?.goal) {
    return cf.task_spec.goal;
  }

  if ((planArtifact as { purpose?: string }).purpose) {
    return (planArtifact as { purpose: string }).purpose;
  }

  if (planArtifact.summary) {
    return planArtifact.summary;
  }

  return "Unknown goal";
}

/**
 * Build a human-readable summary of workstream execution outcomes.
 * Includes counts of total, completed, failed workstreams and total changes made.
 */
function buildWorkstreamsSummary(executeArtifact: ExecuteArtifact): string {
  const workstreams = executeArtifact.workstreams;
  const total = workstreams.length;
  const completed = workstreams.filter((w) => w.state === "completed").length;
  const failed = workstreams.filter((w) => w.state === "failed").length;
  const totalChangesMade = workstreams.reduce(
    (sum, w) => sum + (w.changesMade?.length ?? 0),
    0
  );

  return `Total: ${total}, Completed: ${completed}, Failed: ${failed}, Changes: ${totalChangesMade}`;
}

/**
 * Collect recommendations from test cases with status "failed" that have
 * a non-empty recommendation string.
 */
function collectRecommendations(tests: IntegrationTestCase[]): string[] {
  const recommendations: string[] = [];

  for (const testCase of tests) {
    if (
      testCase.status === "failed" &&
      testCase.recommendation &&
      testCase.recommendation.trim().length > 0
    ) {
      recommendations.push(testCase.recommendation);
    }
  }

  return recommendations;
}

/**
 * Build the IntegrationSummary from the test run result and AI model info.
 */
function buildSummary(
  testResult: TestRunResult,
  aiModelUsed: string
): IntegrationSummary {
  const total = testResult.tests.length;
  const passed = testResult.tests.filter((t) => t.status === "passed").length;
  const failed = testResult.tests.filter((t) => t.status === "failed").length;
  const skipped = testResult.tests.filter((t) => t.status === "skipped").length;

  return {
    total,
    passed,
    failed,
    skipped,
    durationMs: testResult.durationMs,
    testFilesGenerated: testResult.testFiles.length,
    aiModelUsed,
  };
}
