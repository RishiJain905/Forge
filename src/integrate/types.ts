// ---------------------------------------------------------------------------
// Integrate step types
// ---------------------------------------------------------------------------
// Defines all TypeScript types for the forge integrate step.
// Re-exports ExecuteArtifact, PlanArtifact, VerifyArtifact, and AIModelInfo
// from their respective modules for convenient cross-step consumption.
// ---------------------------------------------------------------------------

import type { ExecuteArtifact, AIModelInfo } from "../execute/types.js";
import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";

// ---------------------------------------------------------------------------
// Re-exports from other steps
// ---------------------------------------------------------------------------

export type { ExecuteArtifact, AIModelInfo } from "../execute/types.js";
export type { PlanArtifact } from "../plan/types.js";
export type { VerifyArtifact } from "../verify/types.js";

// ---------------------------------------------------------------------------
// Integration test state
// ---------------------------------------------------------------------------

/** Possible states for an integration test case. */
export type IntegrationTestState =
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

// ---------------------------------------------------------------------------
// Integration test case
// ---------------------------------------------------------------------------

/** A single integration test case with its execution result. */
export interface IntegrationTestCase {
  /** Unique identifier for the test case. */
  id: string;
  /** Human-readable test case name. */
  name: string;
  /** Current execution state of the test case. */
  status: IntegrationTestState;
  /** How long the test case took to run, in milliseconds. */
  durationMs?: number;
  /** Error message if the test case failed. */
  error?: string;
  /** Suggested fix or next step if the test case failed. */
  recommendation?: string;
}

// ---------------------------------------------------------------------------
// Integration test file
// ---------------------------------------------------------------------------

/** A generated integration test file that was written to disk. */
export interface IntegrationTestFile {
  /** Repository-relative path where the test file was written. */
  path: string;
  /** Number of test cases in this file. */
  testCount: number;
  /** Programming language of the test file (e.g. "typescript", "python"). */
  language: string;
  /** Test framework used (e.g. "jest", "pytest", "vitest"). */
  framework: string;
  /** The full source content of the test file. */
  content?: string;
}

// ---------------------------------------------------------------------------
// Integration summary
// ---------------------------------------------------------------------------

/** Aggregate summary of integration test results. */
export interface IntegrationSummary {
  /** Total number of test cases. */
  total: number;
  /** Number of test cases that passed. */
  passed: number;
  /** Number of test cases that failed. */
  failed: number;
  /** Number of test cases that were skipped. */
  skipped: number;
  /** Total wall-clock duration of all test runs, in milliseconds. */
  durationMs: number;
  /** Number of integration test files generated. */
  testFilesGenerated: number;
  /** AI model identifier used (e.g. "openai/gpt-4o"). */
  aiModelUsed: string;
}

// ---------------------------------------------------------------------------
// Integrate artifact
// ---------------------------------------------------------------------------

/** The integrate step artifact, persisted as integrate.json. */
export interface IntegrateArtifact {
  /** Schema version for forward-compatible parsing. */
  schemaVersion: string;
  /** Forge CLI version that produced this artifact. */
  forgeVersion: string;
  /** ISO timestamp when the artifact was created. */
  createdAt: string;
  /** Repository-relative path to the execute.json source artifact. */
  executeSource: string;
  /** Repository-relative path to the plan.json source artifact. */
  planSource: string;
  /** Repository-relative path to the verify.json source artifact. */
  verifySource: string;
  /** The user's goal that the integration tests validate. */
  goal: string;
  /** Brief human-readable summary of all workstream execution outcomes. */
  workstreamsSummary: string;
  /** All integration test cases with their results. */
  tests: IntegrationTestCase[];
  /** All integration test files that were generated. */
  testFiles: IntegrationTestFile[];
  /** Aggregate summary of test pass/fail/skip counts and timing. */
  summary: IntegrationSummary;
  /** Actionable recommendations derived from test failures. */
  recommendations: string[];
  /** Number of AI call attempts made before this artifact was produced. */
  attemptCount?: number;
  /** ISO timestamp when the integration was frozen due to unrecoverable conditions. */
  frozenAt?: string;
  /** Final error message that caused the integration to freeze. */
  finalError?: string;
}

// ---------------------------------------------------------------------------
// Prompt build context
// ---------------------------------------------------------------------------

/** Context assembled before building the AI integration-test prompt. */
export interface PromptBuildContext {
  executeArtifact: ExecuteArtifact;
  planArtifact: PlanArtifact;
  verifyArtifact: VerifyArtifact;
  /** Absolute path to the repository root. */
  repoRoot: string;
  /** Auto-detected or overridden test framework (e.g. "jest", "pytest"). When omitted, the framework is auto-detected from the repository. */
  testFramework?: string;
}

// ---------------------------------------------------------------------------
// Built prompt
// ---------------------------------------------------------------------------

/** The fully assembled prompt ready to send to the AI model. */
export interface BuiltPrompt {
  /** The complete prompt text. */
  prompt: string;
  /** SHA-256 hash of the prompt text for deterministic tracking. */
  promptHash: string;
  /** The detected test framework that the prompt targets. */
  detectedFramework: string;
}

// ---------------------------------------------------------------------------
// Test run result
// ---------------------------------------------------------------------------

/** Result of running the generated integration tests on disk. */
export interface TestRunResult {
  /** Whether all integration tests passed. */
  success: boolean;
  /** Individual test case results. */
  tests: IntegrationTestCase[];
  /** Test files that were executed. */
  testFiles: IntegrationTestFile[];
  /** Total duration of the test run, in milliseconds. */
  durationMs: number;
  /** Error message if the test runner itself failed to execute. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Integrate command options
// ---------------------------------------------------------------------------

/** CLI options for `forge integrate`. */
export interface IntegrateCommandOptions {
  /** Path to the git repository root. */
  repo?: string;
  /** Custom output directory for the artifact and report. */
  outputDir?: string;
  /** Force re-running integration even if an integrate.json already exists. */
  force?: boolean;
  /** Non-interactive mode for CI/CD: fail on any warning or error. */
  auto?: boolean;
  /** Override the auto-detected test framework. */
  testFramework?: string;
}

// ---------------------------------------------------------------------------
// Integrate command result
// ---------------------------------------------------------------------------

/** Result returned by the integrate command runner. */
export interface IntegrateCommandResult {
  /** "ready" if all tests passed, "failed" otherwise. */
  status: "ready" | "failed";
  /** One-line human-readable summary. */
  summary: string;
  /** Path to the written integrate.json artifact. */
  artifactPath: string;
  /** Path to the written integration report, if generated. */
  reportPath?: string;
  /** Root directory for all integrate output files. */
  outputRoot: string;
  /** Process exit code (0 for success, 1 for failure). */
  exitCode?: number;
  /** Structured failure details if the command failed. */
  failure?: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// AI error classification
// ---------------------------------------------------------------------------

/** Classified AI error types for the integrate step. */
export type AIErrorType =
  | "rate_limit"        // 429 — too many requests, back off and retry
  | "auth_failure"       // 401/403 — bad API key or insufficient permissions
  | "timeout"           // Request timed out
  | "parse_error"       // AI returned non-JSON or malformed response
  | "api_error"         // 500/502/503 from the API provider
  | "context_overflow"  // Prompt exceeds context window
  | "unknown_error";    // Something else

/** Configuration for retry behavior when AI calls fail. */
export interface RetryConfig {
  /** Maximum number of retries after the initial attempt. Default: 2. */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry. Default: 1000. */
  initialDelayMs: number;
  /** Multiplier for exponential backoff. Default: 2. */
  backoffMultiplier: number;
  /** Error types that are worth retrying. */
  retryableErrors: AIErrorType[];
}

/** Default retry configuration. */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ["rate_limit", "timeout", "api_error"],
};

/** Result of classifying an AI error. */
export interface ErrorClassification {
  /** The classified error type. */
  type: AIErrorType;
  /** Whether this error type is retryable. */
  retryable: boolean;
  /** Suggested delay before retrying (in ms). For rate_limit — parsed from Retry-After. */
  retryAfterMs?: number;
  /** The original error message. */
  message: string;
  /** User-facing actionable suggestion. */
  suggestion: string;
}

// ---------------------------------------------------------------------------
// Freeze criteria
// ---------------------------------------------------------------------------

/** Configuration for freeze criteria — when to stop retrying and produce a frozen artifact. */
export interface FreezeCriteria {
  maxRetries: number;
  maxDurationMs: number;
  freezeOn: {
    rateLimitHit: boolean;
    authFailure: boolean;
    parseFailure: boolean;
  };
}

export const DEFAULT_FREEZE_CRITERIA: FreezeCriteria = {
  maxRetries: 2,
  maxDurationMs: 300000, // 5 minutes
  freezeOn: {
    rateLimitHit: false,
    authFailure: true,
    parseFailure: true,
  },
};

/** Mutable state tracking freeze conditions through the retry loop. */
export interface FreezeState {
  frozenAt?: string;
  finalError?: string;
  attemptCount: number;
}
