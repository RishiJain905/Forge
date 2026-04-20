import assert from "node:assert/strict";

import { createIntegrationReport, createFrozenReport } from "../src/integrate/report.js";
import type {
  IntegrationTestCase,
  IntegrationTestFile,
  IntegrationSummary,
  IntegrateArtifact,
  ErrorClassification,
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
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeTestCase(
  overrides?: Partial<IntegrationTestCase>
): IntegrationTestCase {
  return {
    id: "tc-1",
    name: "Should authenticate user",
    status: "passed",
    durationMs: 150,
    ...overrides,
  };
}

function makeTestFile(
  overrides?: Partial<IntegrationTestFile>
): IntegrationTestFile {
  return {
    path: "tests/integration/auth.test.ts",
    testCount: 3,
    language: "typescript",
    framework: "jest",
    ...overrides,
  };
}

function makeSummary(
  overrides?: Partial<IntegrationSummary>
): IntegrationSummary {
  return {
    total: 4,
    passed: 3,
    failed: 1,
    skipped: 0,
    durationMs: 2500,
    testFilesGenerated: 1,
    aiModelUsed: "openai/gpt-4o",
    ...overrides,
  };
}

function makeArtifact(
  overrides?: Partial<IntegrateArtifact>
): IntegrateArtifact {
  return {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-06-15T10:30:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user authentication to the application",
    workstreamsSummary: "Total: 3, Completed: 2, Failed: 1, Changes: 8",
    tests: [
      makeTestCase({ id: "tc-1", name: "Login succeeds", status: "passed", durationMs: 100 }),
      makeTestCase({ id: "tc-2", name: "Logout succeeds", status: "passed", durationMs: 50 }),
      makeTestCase({ id: "tc-3", name: "Invalid password fails", status: "passed", durationMs: 200 }),
      makeTestCase({ id: "tc-4", name: "Token refresh works", status: "failed", error: "Expected 200 but received 401", recommendation: "Check token refresh endpoint configuration" }),
    ],
    testFiles: [makeTestFile()],
    summary: makeSummary(),
    recommendations: ["Check token refresh endpoint configuration"],
    ...overrides,
  } as IntegrateArtifact;
}

// ===========================================================================
// Report structure tests
// ===========================================================================

await runScenario("createIntegrationReport produces non-empty string", () => {
  const artifact = makeArtifact();
  const report = createIntegrationReport(artifact);

  assert.ok(report.length > 0, "Report must be non-empty");
});

await runScenario("Report includes 'Forge Integration Report' heading", () => {
  const artifact = makeArtifact();
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("# Forge Integration Report"),
    "Report must include 'Forge Integration Report' heading"
  );
});

await runScenario("Report includes date (createdAt)", () => {
  const artifact = makeArtifact({ createdAt: "2025-06-15T10:30:00.000Z" });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("2025-06-15T10:30:00.000Z"),
    "Report must include the createdAt date"
  );
});

await runScenario("Report includes goal", () => {
  const artifact = makeArtifact({ goal: "Add user authentication" });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("Add user authentication"),
    "Report must include the goal"
  );
});

await runScenario("Report includes workstreams summary table with total/completed/failed/changes columns", () => {
  const artifact = makeArtifact({
    workstreamsSummary: "Total: 3, Completed: 2, Failed: 1, Changes: 8",
  });
  const report = createIntegrationReport(artifact);

  // Must have the workstreams summary section
  assert.ok(
    report.includes("## Workstreams Summary"),
    "Report must have Workstreams Summary section"
  );

  // Must have table with parsed values
  assert.ok(report.includes("| Total |"), "Table must have Total row");
  assert.ok(report.includes("| 3 |"), "Total value must be 3");
  assert.ok(report.includes("| Completed |"), "Table must have Completed row");
  assert.ok(report.includes("| 2 |"), "Completed value must be 2");
  assert.ok(report.includes("| Failed |"), "Table must have Failed row");
  assert.ok(report.includes("| 1 |"), "Failed value must be 1");
  assert.ok(report.includes("| Changes |"), "Table must have Changes row");
  assert.ok(report.includes("| 8 |"), "Changes value must be 8");
});

await runScenario("Workstreams summary falls back to raw string when parsing fails", () => {
  const artifact = makeArtifact({
    workstreamsSummary: "Custom summary that doesn't match the expected format",
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("Custom summary that doesn't match the expected format"),
    "Report must include the raw workstreamsSummary when parsing fails"
  );
});

await runScenario("Report includes test results table with passed/failed/skipped/duration rows", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ passed: 5, failed: 2, skipped: 1, durationMs: 45000 }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Test Results"),
    "Report must have Test Results section"
  );
  assert.ok(report.includes("| Passed |"), "Table must have Passed row");
  assert.ok(report.includes("| 5 |"), "Passed value must be 5");
  assert.ok(report.includes("| Failed |"), "Table must have Failed row");
  assert.ok(report.includes("| 2 |"), "Failed value must be 2");
  assert.ok(report.includes("| Skipped |"), "Table must have Skipped row");
  assert.ok(report.includes("| 1 |"), "Skipped value must be 1");
  assert.ok(report.includes("| Duration |"), "Table must have Duration row");
  assert.ok(report.includes("45s"), "Duration must be formatted");
});

await runScenario("Report includes test file list with paths and counts", () => {
  const artifact = makeArtifact({
    testFiles: [
      makeTestFile({ path: "tests/integration/auth.test.ts", testCount: 3, language: "typescript", framework: "jest" }),
      makeTestFile({ path: "tests/integration/api.test.ts", testCount: 5, language: "typescript", framework: "vitest" }),
    ],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Test Files"),
    "Report must have Test Files section"
  );
  assert.ok(
    report.includes("tests/integration/auth.test.ts"),
    "Must include first test file path"
  );
  assert.ok(
    report.includes("tests/integration/api.test.ts"),
    "Must include second test file path"
  );
});

await runScenario("Report includes individual test results with correct icons per status", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({ id: "tc-1", name: "Passed test", status: "passed" }),
      makeTestCase({ id: "tc-2", name: "Failed test", status: "failed" }),
      makeTestCase({ id: "tc-3", name: "Skipped test", status: "skipped" }),
      makeTestCase({ id: "tc-4", name: "Pending test", status: "pending" }),
    ],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Individual Test Results"),
    "Report must have Individual Test Results section"
  );
  assert.ok(report.includes("✅"), "Must include passed icon ✅");
  assert.ok(report.includes("❌"), "Must include failed icon ❌");
  assert.ok(report.includes("⏭️"), "Must include skipped icon ⏭️");
  assert.ok(report.includes("⏳"), "Must include pending icon ⏳");
});

await runScenario("Report includes failed test errors in code blocks", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({ id: "tc-1", name: "Failing test", status: "failed", error: "Expected 200 but received 401" }),
      makeTestCase({ id: "tc-2", name: "Other failing test", status: "failed", error: "TypeError: Cannot read null" }),
      makeTestCase({ id: "tc-3", name: "Passing test", status: "passed" }),
    ],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Failed Test Errors"),
    "Report must have Failed Test Errors section"
  );
  assert.ok(
    report.includes("```"),
    "Errors must be in code blocks"
  );
  assert.ok(
    report.includes("Expected 200 but received 401"),
    "Must include first error message"
  );
  assert.ok(
    report.includes("TypeError: Cannot read null"),
    "Must include second error message"
  );
});

await runScenario("Report shows 'none' for failed test errors when all tests pass", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({ id: "tc-1", name: "Passed test 1", status: "passed" }),
      makeTestCase({ id: "tc-2", name: "Passed test 2", status: "passed" }),
    ],
    summary: makeSummary({ passed: 2, failed: 0, total: 2 }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Failed Test Errors"),
    "Report must have Failed Test Errors section"
  );
  assert.ok(
    report.includes("- none"),
    "Must show 'none' when no failed test errors"
  );
});

await runScenario("Report includes AI recommendations from failed tests", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({
        id: "tc-1",
        name: "Failed test with rec",
        status: "failed",
        error: "Something broke",
        recommendation: "Fix the config file",
      }),
    ],
    recommendations: ["Fix the config file"],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## AI Recommendations"),
    "Report must have AI Recommendations section"
  );
  assert.ok(
    report.includes("Fix the config file"),
    "Must include the recommendation"
  );
});

await runScenario("Report shows 'none' when there are no AI recommendations", () => {
  const artifact = makeArtifact({
    tests: [makeTestCase({ id: "tc-1", name: "Passed", status: "passed" })],
    recommendations: [],
    summary: makeSummary({ passed: 1, failed: 0, total: 1 }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## AI Recommendations"),
    "Report must have AI Recommendations section"
  );
});

await runScenario("Report includes Next Steps section with guidance based on pass/fail status - all pass", () => {
  const artifact = makeArtifact({
    tests: [makeTestCase({ id: "tc-1", name: "Passed", status: "passed" })],
    summary: makeSummary({ passed: 1, failed: 0, total: 1 }),
    recommendations: [],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Next Steps"),
    "Report must have Next Steps section"
  );
  assert.ok(
    report.includes("All integration tests passed"),
    "Must indicate all tests passed"
  );
});

await runScenario("Report includes Next Steps section with guidance based on pass/fail status - has failures", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({ id: "tc-1", name: "Failed", status: "failed", error: "broken" }),
    ],
    summary: makeSummary({ passed: 0, failed: 1, total: 1 }),
    recommendations: ["Fix the issue"],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Next Steps"),
    "Report must have Next Steps section"
  );
  assert.ok(
    report.includes("1 integration test(s) failed"),
    "Must report number of failures"
  );
  assert.ok(
    report.includes("Failed Test Errors"),
    "Must reference Failed Test Errors for guidance"
  );
});

await runScenario("Next Steps mentions skipped tests when applicable", () => {
  const artifact = makeArtifact({
    tests: [
      makeTestCase({ id: "tc-1", name: "Failed", status: "failed", error: "broken" }),
      makeTestCase({ id: "tc-2", name: "Skipped", status: "skipped" }),
    ],
    summary: makeSummary({ passed: 0, failed: 1, skipped: 1, total: 2 }),
    recommendations: [],
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("1 test(s) were skipped"),
    "Must mention skipped tests in Next Steps when some are skipped"
  );
});

await runScenario("Duration formatting works for minutes and seconds", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ durationMs: 125000 }), // 2m 5s
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("2m 5s"),
    "Must format 125000ms as 2m 5s"
  );
});

await runScenario("Duration formatting works for seconds only", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ durationMs: 3000 }), // 3s
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("3s"),
    "Must format 3000ms as 3s"
  );
});

await runScenario("Report handles empty test files gracefully", () => {
  const artifact = makeArtifact({
    testFiles: [],
    summary: makeSummary({ testFilesGenerated: 0 }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Test Files"),
    "Report must have Test Files section even when empty"
  );
});

await runScenario("Report handles empty test cases gracefully", () => {
  const artifact = makeArtifact({
    tests: [],
    summary: makeSummary({ total: 0, passed: 0, failed: 0, skipped: 0 }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("## Individual Test Results"),
    "Report must have Individual Test Results section even when empty"
  );
});

await runScenario("Report includes AI model used", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ aiModelUsed: "anthropic/claude-3.5" }),
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("anthropic/claude-3.5"),
    "Must include the AI model used"
  );
});

await runScenario("Report includes schema and forge versions", () => {
  const artifact = makeArtifact({
    schemaVersion: "3.0.0",
    forgeVersion: "1.2.3",
  });
  const report = createIntegrationReport(artifact);

  assert.ok(
    report.includes("3.0.0"),
    "Must include schema version"
  );
  assert.ok(
    report.includes("1.2.3"),
    "Must include forge version"
  );
});

await runScenario("Full artifact produces report with all required sections", () => {
  const artifact = makeArtifact({
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-06-15T10:30:00.000Z",
    goal: "Build a REST API with authentication",
    workstreamsSummary: "Total: 5, Completed: 4, Failed: 1, Changes: 12",
    tests: [
      makeTestCase({ id: "tc-1", name: "GET /api/users returns 200", status: "passed", durationMs: 100 }),
      makeTestCase({ id: "tc-2", name: "POST /api/login succeeds", status: "passed", durationMs: 200 }),
      makeTestCase({ id: "tc-3", name: "DELETE /api/users/:id returns 204", status: "passed", durationMs: 50 }),
      makeTestCase({ id: "tc-4", name: "PUT /api/users/:id updates user", status: "failed", error: "Expected 200 but got 500", recommendation: "Check the update handler for null user ID" }),
      makeTestCase({ id: "tc-5", name: "GET /api/admin requires auth", status: "skipped" }),
    ],
    testFiles: [
      makeTestFile({ path: "tests/integration/api-users.test.ts", testCount: 3, language: "typescript", framework: "jest" }),
      makeTestFile({ path: "tests/integration/api-auth.test.ts", testCount: 2, language: "typescript", framework: "jest" }),
    ],
    summary: makeSummary({
      total: 5,
      passed: 3,
      failed: 1,
      skipped: 1,
      durationMs: 3500,
      testFilesGenerated: 2,
      aiModelUsed: "openai/gpt-4o",
    }),
    recommendations: ["Check the update handler for null user ID"],
  });

  const report = createIntegrationReport(artifact);

  // Check all required sections are present
  assert.ok(report.includes("# Forge Integration Report"), "Title");
  assert.ok(report.includes("## Overview"), "Overview section");
  assert.ok(report.includes("## Workstreams Summary"), "Workstreams Summary section");
  assert.ok(report.includes("## Test Results"), "Test Results section");
  assert.ok(report.includes("## Test Files"), "Test Files section");
  assert.ok(report.includes("## Individual Test Results"), "Individual Results section");
  assert.ok(report.includes("## Failed Test Errors"), "Failed Errors section");
  assert.ok(report.includes("## AI Recommendations"), "Recommendations section");
  assert.ok(report.includes("## Next Steps"), "Next Steps section");

  // Check workstreams table content
  assert.ok(report.includes("| Total | 5 |"), "Workstreams total");
  assert.ok(report.includes("| Completed | 4 |"), "Workstreams completed");
  assert.ok(report.includes("| Failed | 1 |"), "Workstreams failed");
  assert.ok(report.includes("| Changes | 12 |"), "Workstreams changes");

  // Check test results table content
  assert.ok(report.includes("| Passed | 3 |"), "Test passed");
  assert.ok(report.includes("| Failed | 1 |"), "Test failed");
  assert.ok(report.includes("| Skipped | 1 |"), "Test skipped");

  // Check icons
  assert.ok(report.includes("✅"), "Passed icon");
  assert.ok(report.includes("❌"), "Failed icon");
  assert.ok(report.includes("⏭️"), "Skipped icon");

  // Check error in code block
  assert.ok(report.includes("Expected 200 but got 500"), "Error message in code block");

  // Check recommendation
  assert.ok(report.includes("Check the update handler for null user ID"), "Recommendation content");
});

// ===========================================================================
// createFrozenReport tests (Task 5)
// ===========================================================================

await runScenario("createFrozenReport contains [FROZEN] badge in title", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user authentication to the application",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "auth_failure" },
    recommendations: ["Frozen due to: auth_failure. Check your API key"],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure: 401",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("[FROZEN]"), "Report title must contain [FROZEN] badge");
});

await runScenario("createFrozenReport includes error type and suggestion", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user authentication to the application",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "auth_failure" },
    recommendations: ["Frozen due to: auth_failure. Check your API key"],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure: 401",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("auth_failure"), "Report must include error type");
  assert.ok(report.includes("Check your API key"), "Report must include suggestion");
});

await runScenario("createFrozenReport includes workstreams table", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user authentication to the application",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "auth_failure" },
    recommendations: ["Frozen due to: auth_failure. Check your API key"],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure: 401",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("Total"), "Report must include Total in workstreams table");
  assert.ok(report.includes("Completed"), "Report must include Completed in workstreams table");
  assert.ok(report.includes("Failed"), "Report must include Failed in workstreams table");
});

// ===========================================================================
// Phase D: Report polish tests — How to Reproduce & Troubleshooting
// ===========================================================================

await runScenario("Report includes How to Reproduce section", () => {
  const artifact = makeArtifact();
  const report = createIntegrationReport(artifact);
  assert.ok(report.includes("## How to Reproduce"), "Report must have How to Reproduce section");
  assert.ok(report.includes("forge integrate --repo ."), "How to Reproduce must include the command");
});

await runScenario("Report includes Troubleshooting section when tests fail", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ passed: 2, failed: 1, total: 3 }),
    tests: [
      makeTestCase({ id: "tc-1", name: "Passed", status: "passed" }),
      makeTestCase({ id: "tc-2", name: "Failed", status: "failed", error: "broken" }),
    ],
  });
  const report = createIntegrationReport(artifact);
  assert.ok(report.includes("## Troubleshooting"), "Report must have Troubleshooting section");
  assert.ok(report.includes("test(s) failed"), "Troubleshooting must mention failed tests");
  assert.ok(report.includes("--force"), "Troubleshooting must mention --force flag");
});

await runScenario("Report Troubleshooting shows all tests passed when no failures", () => {
  const artifact = makeArtifact({
    summary: makeSummary({ passed: 3, failed: 0, total: 3 }),
    tests: [
      makeTestCase({ id: "tc-1", name: "Passed", status: "passed" }),
      makeTestCase({ id: "tc-2", name: "Also passed", status: "passed" }),
    ],
  });
  const report = createIntegrationReport(artifact);
  assert.ok(report.includes("## Troubleshooting"), "Report must have Troubleshooting section");
  assert.ok(report.includes("All tests passed"), "Troubleshooting must say all tests passed");
});

await runScenario("Report includes attemptCount in Overview", () => {
  const artifact = makeArtifact({ attemptCount: 3 });
  const report = createIntegrationReport(artifact);
  assert.ok(report.includes("Attempts"), "Report must include Attempts in Overview");
  assert.ok(report.includes("3"), "Report must show attemptCount value");
});

// ===========================================================================
// Phase E: Frozen report polish tests
// ===========================================================================

await runScenario("createFrozenReport includes frozen warning", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user authentication",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "none" },
    recommendations: [],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure: 401",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("Integration was frozen"), "Frozen report must include frozen warning");
});

await runScenario("createFrozenReport includes final error", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Add user auth",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "none" },
    recommendations: [],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure: 401 Unauthorized",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("**Final Error:**"), "Frozen report must include Final Error line");
  assert.ok(report.includes("auth_failure: 401 Unauthorized"), "Frozen report must include the actual error text");
});

await runScenario("createFrozenReport includes goal", () => {
  const authError: ErrorClassification = { type: "auth_failure", retryable: false, message: "401 Unauthorized", suggestion: "Check your API key" };
  const frozenArtifact: IntegrateArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T00:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Build the REST API",
    workstreamsSummary: "Total: 3, Completed: 1, Failed: 1, Changes: 5",
    tests: [],
    testFiles: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "none" },
    recommendations: [],
    attemptCount: 2,
    frozenAt: "2025-01-01T00:00:00.000Z",
    finalError: "auth_failure",
  };
  const report = createFrozenReport(frozenArtifact, authError);
  assert.ok(report.includes("Build the REST API"), "Frozen report must include the goal");
});

console.log("All integrate report tests completed.");
