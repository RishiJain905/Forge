// ---------------------------------------------------------------------------
// Integrate step Zod schemas
// ---------------------------------------------------------------------------
// Defines Zod schemas for all integrate types, enabling runtime validation
// and parsing of integrate artifacts. Uses .strict() on all schemas to
// reject unknown keys, following the same pattern as execute/schema.ts.
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { IntegrateArtifact } from "./types.js";

// ---------------------------------------------------------------------------
// Integration test state
// ---------------------------------------------------------------------------

/** Validates the possible states for an integration test case. */
export const IntegrationTestStateSchema = z.enum([
  "pending",
  "passed",
  "failed",
  "skipped",
]);

// ---------------------------------------------------------------------------
// Integration test case
// ---------------------------------------------------------------------------

/** Validates a single integration test case with its execution result. */
export const IntegrationTestCaseSchema = z.object({
  /** Unique identifier for the test case. */
  id: z.string(),
  /** Human-readable test case name. */
  name: z.string(),
  /** Current execution state of the test case. */
  status: IntegrationTestStateSchema,
  /** How long the test case took to run, in milliseconds. */
  durationMs: z.number().int().nonnegative().optional(),
  /** Error message if the test case failed. */
  error: z.string().optional(),
  /** Suggested fix or next step if the test case failed. */
  recommendation: z.string().optional(),
}).strict();

// ---------------------------------------------------------------------------
// Integration test file
// ---------------------------------------------------------------------------

/** Validates a generated integration test file that was written to disk. */
export const IntegrationTestFileSchema = z.object({
  /** Repository-relative path where the test file was written. */
  path: z.string(),
  /** Number of test cases in this file. */
  testCount: z.number().int().nonnegative(),
  /** Programming language of the test file (e.g. "typescript", "python"). */
  language: z.string(),
  /** Test framework used (e.g. "jest", "pytest", "vitest"). */
  framework: z.string(),
  /** The full source content of the test file. */
  content: z.string().optional(),
}).strict();

// ---------------------------------------------------------------------------
// Integration summary
// ---------------------------------------------------------------------------

/** Validates aggregate summary of integration test results. */
export const IntegrationSummarySchema = z.object({
  /** Total number of test cases. */
  total: z.number().int().nonnegative(),
  /** Number of test cases that passed. */
  passed: z.number().int().nonnegative(),
  /** Number of test cases that failed. */
  failed: z.number().int().nonnegative(),
  /** Number of test cases that were skipped. */
  skipped: z.number().int().nonnegative(),
  /** Total wall-clock duration of all test runs, in milliseconds. */
  durationMs: z.number().int().nonnegative(),
  /** Number of integration test files generated. */
  testFilesGenerated: z.number().int().nonnegative(),
  /** AI model identifier used (e.g. "openai/gpt-4o"). */
  aiModelUsed: z.string(),
}).strict();

// ---------------------------------------------------------------------------
// Integrate artifact
// ---------------------------------------------------------------------------

/** Validates the full integrate step artifact (integrate.json). */
export const IntegrateArtifactSchema = z
  .object({
    /** Schema version for forward-compatible parsing. */
    schemaVersion: z.string(),
    /** Forge CLI version that produced this artifact. */
    forgeVersion: z.string(),
    /** ISO timestamp when the artifact was created. */
    createdAt: z.string(),
    /** Repository-relative path to the execute.json source artifact. */
    executeSource: z.string(),
    /** Repository-relative path to the plan.json source artifact. */
    planSource: z.string(),
    /** Repository-relative path to the verify.json source artifact. */
    verifySource: z.string(),
    /** The user's goal that the integration tests validate. */
    goal: z.string(),
    /** Brief human-readable summary of all workstream execution outcomes. */
    workstreamsSummary: z.string(),
    /** All integration test cases with their results. */
    tests: z.array(IntegrationTestCaseSchema),
    /** All integration test files that were generated. */
    testFiles: z.array(IntegrationTestFileSchema),
    /** Aggregate summary of test pass/fail/skip counts and timing. */
    summary: IntegrationSummarySchema,
    /** Actionable recommendations derived from test failures. */
    recommendations: z.array(z.string()),
    /** Number of AI call attempts made before this artifact was produced. */
    attemptCount: z.number().int().nonnegative().optional(),
    /** ISO timestamp when the integration was frozen due to unrecoverable conditions. */
    frozenAt: z.string().optional(),
    /** Final error message that caused the integration to freeze. */
    finalError: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Parses and validates an unknown value as an IntegrateArtifact.
 * Throws ZodError if validation fails.
 */
export function validateIntegrateArtifact(input: unknown): IntegrateArtifact {
  return IntegrateArtifactSchema.parse(input) as IntegrateArtifact;
}
