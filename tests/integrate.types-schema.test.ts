import assert from "node:assert/strict";
import { z } from "zod";
import {
  IntegrationTestStateSchema,
  IntegrationTestCaseSchema,
  IntegrationTestFileSchema,
  IntegrationSummarySchema,
  IntegrateArtifactSchema,
  validateIntegrateArtifact,
} from "../src/integrate/schema.js";
import type {
  IntegrationTestState,
  IntegrationTestCase,
  IntegrationTestFile,
  IntegrationSummary,
  IntegrateArtifact,
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

function makeMinimalTestCase(overrides?: Partial<IntegrationTestCase>): IntegrationTestCase {
  return {
    id: "tc-1",
    name: "Should authenticate user",
    status: "passed",
    durationMs: 150,
    ...overrides,
  };
}

function makeMinimalTestFile(overrides?: Partial<IntegrationTestFile>): IntegrationTestFile {
  return {
    path: "tests/integration/auth.test.ts",
    testCount: 1,
    language: "typescript",
    framework: "jest",
    content: 'test("auth", () => { expect(true).toBe(true); });',
    ...overrides,
  };
}

function makeMinimalSummary(overrides?: Partial<IntegrationSummary>): IntegrationSummary {
  return {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    durationMs: 150,
    testFilesGenerated: 1,
    aiModelUsed: "openai/gpt-4o",
    ...overrides,
  };
}

function makeMinimalArtifact(overrides?: Partial<IntegrateArtifact>): IntegrateArtifact {
  return {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    executeSource: ".forge/execute.json",
    planSource: ".forge/plan.json",
    verifySource: ".forge/verify.json",
    goal: "Verify user authentication works end-to-end",
    workstreamsSummary: "All workstreams completed successfully",
    tests: [makeMinimalTestCase()],
    testFiles: [makeMinimalTestFile()],
    summary: makeMinimalSummary(),
    recommendations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IntegrationTestStateSchema tests
// ---------------------------------------------------------------------------

await runScenario("IntegrationTestStateSchema parses valid state 'pending'", () => {
  const result = IntegrationTestStateSchema.parse("pending");
  assert.equal(result, "pending");
});

await runScenario("IntegrationTestStateSchema parses valid state 'passed'", () => {
  const result = IntegrationTestStateSchema.parse("passed");
  assert.equal(result, "passed");
});

await runScenario("IntegrationTestStateSchema parses valid state 'failed'", () => {
  const result = IntegrationTestStateSchema.parse("failed");
  assert.equal(result, "failed");
});

await runScenario("IntegrationTestStateSchema parses valid state 'skipped'", () => {
  const result = IntegrationTestStateSchema.parse("skipped");
  assert.equal(result, "skipped");
});

await runScenario("IntegrationTestStateSchema rejects invalid state", () => {
  assert.throws(() => IntegrationTestStateSchema.parse("running"), z.ZodError);
});

await runScenario("IntegrationTestStateSchema rejects non-string input", () => {
  assert.throws(() => IntegrationTestStateSchema.parse(42), z.ZodError);
});

// ---------------------------------------------------------------------------
// IntegrationTestCaseSchema tests
// ---------------------------------------------------------------------------

await runScenario("IntegrationTestCaseSchema parses a valid test case with all fields", () => {
  const testCase: IntegrationTestCase = {
    id: "tc-1",
    name: "Should authenticate user",
    status: "passed",
    durationMs: 150,
    error: undefined,
    recommendation: undefined,
  };
  const result = IntegrationTestCaseSchema.parse(testCase);
  assert.equal(result.id, "tc-1");
  assert.equal(result.name, "Should authenticate user");
  assert.equal(result.status, "passed");
  assert.equal(result.durationMs, 150);
});

await runScenario("IntegrationTestCaseSchema parses a test case with only required fields", () => {
  const testCase = {
    id: "tc-2",
    name: "Should create user",
    status: "failed",
  };
  const result = IntegrationTestCaseSchema.parse(testCase);
  assert.equal(result.id, "tc-2");
  assert.equal(result.status, "failed");
  assert.equal(result.durationMs, undefined);
  assert.equal(result.error, undefined);
  assert.equal(result.recommendation, undefined);
});

await runScenario("IntegrationTestCaseSchema parses a test case error and recommendation", () => {
  const testCase = {
    id: "tc-3",
    name: "Should handle timeout",
    status: "failed",
    error: "Timeout after 5000ms",
    recommendation: "Increase timeout or mock external API",
  };
  const result = IntegrationTestCaseSchema.parse(testCase);
  assert.equal(result.error, "Timeout after 5000ms");
  assert.equal(result.recommendation, "Increase timeout or mock external API");
});

await runScenario("IntegrationTestCaseSchema rejects missing id", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        name: "Should authenticate user",
        status: "passed",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects missing name", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        status: "passed",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects missing status", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        name: "Should authenticate user",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects invalid status value", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        name: "Should authenticate user",
        status: "running",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects negative durationMs", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        name: "Should authenticate user",
        status: "passed",
        durationMs: -100,
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects non-integer durationMs", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        name: "Should authenticate user",
        status: "passed",
        durationMs: 10.5,
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestCaseSchema rejects unknown keys with .strict()", () => {
  assert.throws(
    () =>
      IntegrationTestCaseSchema.parse({
        id: "tc-1",
        name: "Should authenticate user",
        status: "passed",
        extraField: "not allowed",
      }),
    z.ZodError
  );
});

// ---------------------------------------------------------------------------
// IntegrationTestFileSchema tests
// ---------------------------------------------------------------------------

await runScenario("IntegrationTestFileSchema parses a valid test file with all fields", () => {
  const testFile: IntegrationTestFile = {
    path: "tests/integration/auth.test.ts",
    testCount: 3,
    language: "typescript",
    framework: "jest",
    content: 'describe("auth", () => { /* tests */ });',
  };
  const result = IntegrationTestFileSchema.parse(testFile);
  assert.equal(result.path, "tests/integration/auth.test.ts");
  assert.equal(result.testCount, 3);
  assert.equal(result.language, "typescript");
  assert.equal(result.framework, "jest");
  assert.equal(result.content, 'describe("auth", () => { /* tests */ });');
});

await runScenario("IntegrationTestFileSchema parses a valid test file without optional content", () => {
  const testFile = {
    path: "tests/integration/api.test.ts",
    testCount: 5,
    language: "typescript",
    framework: "vitest",
  };
  const result = IntegrationTestFileSchema.parse(testFile);
  assert.equal(result.path, "tests/integration/api.test.ts");
  assert.equal(result.content, undefined);
});

await runScenario("IntegrationTestFileSchema rejects missing path", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        testCount: 1,
        language: "typescript",
        framework: "jest",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestFileSchema rejects missing language", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        path: "tests/integration/auth.test.ts",
        testCount: 1,
        framework: "jest",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestFileSchema rejects missing framework", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        path: "tests/integration/auth.test.ts",
        testCount: 1,
        language: "typescript",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestFileSchema rejects negative testCount", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        path: "tests/integration/auth.test.ts",
        testCount: -1,
        language: "typescript",
        framework: "jest",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestFileSchema rejects non-integer testCount", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        path: "tests/integration/auth.test.ts",
        testCount: 1.5,
        language: "typescript",
        framework: "jest",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationTestFileSchema rejects unknown keys with .strict()", () => {
  assert.throws(
    () =>
      IntegrationTestFileSchema.parse({
        path: "tests/integration/auth.test.ts",
        testCount: 1,
        language: "typescript",
        framework: "jest",
        extraField: "not allowed",
      }),
    z.ZodError
  );
});

// ---------------------------------------------------------------------------
// IntegrationSummarySchema tests
// ---------------------------------------------------------------------------

await runScenario("IntegrationSummarySchema parses a valid summary", () => {
  const summary: IntegrationSummary = {
    total: 10,
    passed: 8,
    failed: 1,
    skipped: 1,
    durationMs: 2500,
    testFilesGenerated: 3,
    aiModelUsed: "openai/gpt-4o",
  };
  const result = IntegrationSummarySchema.parse(summary);
  assert.equal(result.total, 10);
  assert.equal(result.passed, 8);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.durationMs, 2500);
  assert.equal(result.testFilesGenerated, 3);
  assert.equal(result.aiModelUsed, "openai/gpt-4o");
});

await runScenario("IntegrationSummarySchema rejects negative total", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: -1,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects negative passed", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: -1,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects negative failed count", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: -1,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects negative skipped", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: -1,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects negative durationMs", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: -100,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects negative testFilesGenerated", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: -1,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects non-integer counts", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 1.5,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects missing aiModelUsed", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
      }),
    z.ZodError
  );
});

await runScenario("IntegrationSummarySchema rejects unknown keys with .strict()", () => {
  assert.throws(
    () =>
      IntegrationSummarySchema.parse({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "openai/gpt-4o",
        extraField: "not allowed",
      }),
    z.ZodError
  );
});

// ---------------------------------------------------------------------------
// IntegrateArtifactSchema tests
// ---------------------------------------------------------------------------

await runScenario("IntegrateArtifactSchema parses a valid minimal artifact", () => {
  const artifact = makeMinimalArtifact();
  const result = IntegrateArtifactSchema.parse(artifact);
  assert.equal(result.schemaVersion, "2.0.0");
  assert.equal(result.forgeVersion, "0.1.0");
  assert.equal(result.createdAt, "2025-01-01T10:00:00.000Z");
  assert.equal(result.executeSource, ".forge/execute.json");
  assert.equal(result.planSource, ".forge/plan.json");
  assert.equal(result.verifySource, ".forge/verify.json");
  assert.equal(result.goal, "Verify user authentication works end-to-end");
  assert.equal(result.workstreamsSummary, "All workstreams completed successfully");
  assert.equal(result.tests.length, 1);
  assert.equal(result.testFiles.length, 1);
  assert.equal(result.summary.total, 1);
  assert.deepEqual(result.recommendations, []);
});

await runScenario("IntegrateArtifactSchema parses artifact with populated tests and files", () => {
  const artifact = makeMinimalArtifact({
    tests: [
      makeMinimalTestCase({ id: "tc-1", name: "Auth login", status: "passed" }),
      makeMinimalTestCase({ id: "tc-2", name: "Auth logout", status: "failed", error: "Timeout", recommendation: "Increase timeout for logout tests" }),
      makeMinimalTestCase({ id: "tc-3", name: "Auth session", status: "skipped" }),
    ],
    testFiles: [
      makeMinimalTestFile({ path: "tests/integration/auth.test.ts", testCount: 3, language: "typescript", framework: "jest" }),
      makeMinimalTestFile({ path: "tests/integration/api.test.py", testCount: 2, language: "python", framework: "pytest" }),
    ],
    summary: makeMinimalSummary({ total: 3, passed: 1, failed: 1, skipped: 1, testFilesGenerated: 2 }),
    recommendations: ["Increase timeout for logout tests", "Add retry logic for flaky API calls"],
  });
  const result = IntegrateArtifactSchema.parse(artifact);
  assert.equal(result.tests.length, 3);
  assert.equal(result.testFiles.length, 2);
  assert.equal(result.tests[1].error, "Timeout");
  assert.equal(result.tests[1].recommendation, "Increase timeout for logout tests");
  assert.equal(result.testFiles[1].language, "python");
  assert.equal(result.testFiles[1].framework, "pytest");
  assert.equal(result.recommendations.length, 2);
});

await runScenario("IntegrateArtifactSchema uses .strict() and rejects unknown keys", () => {
  assert.throws(
    () =>
      IntegrateArtifactSchema.parse({
        ...makeMinimalArtifact(),
        extraTopLevelField: "not allowed",
      }),
    z.ZodError
  );
});

await runScenario("IntegrateArtifactSchema rejects missing schemaVersion", () => {
  const { schemaVersion: _, ...rest } = makeMinimalArtifact();
  assert.throws(() => IntegrateArtifactSchema.parse(rest), z.ZodError);
});

await runScenario("IntegrateArtifactSchema rejects missing goal", () => {
  const { goal: _, ...rest } = makeMinimalArtifact();
  assert.throws(() => IntegrateArtifactSchema.parse(rest), z.ZodError);
});

await runScenario("IntegrateArtifactSchema rejects missing summary", () => {
  const { summary: _, ...rest } = makeMinimalArtifact();
  assert.throws(() => IntegrateArtifactSchema.parse(rest), z.ZodError);
});

await runScenario("IntegrateArtifactSchema rejects invalid nested test case status", () => {
  const artifact = makeMinimalArtifact({
    tests: [
      { id: "tc-1", name: "Bad test", status: "running" } as unknown as IntegrationTestCase,
    ],
  });
  assert.throws(() => IntegrateArtifactSchema.parse(artifact), z.ZodError);
});

await runScenario("IntegrateArtifactSchema rejects invalid nested test file", () => {
  const artifact = makeMinimalArtifact({
    testFiles: [
      {
        path: "tests/test.ts",
        testCount: -1, // invalid: negative
        language: "typescript",
        framework: "jest",
      },
    ],
  });
  assert.throws(() => IntegrateArtifactSchema.parse(artifact), z.ZodError);
});

await runScenario("IntegrateArtifactSchema rejects invalid nested summary", () => {
  const artifact = makeMinimalArtifact({
    summary: {
      total: -1, // invalid: negative
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      testFilesGenerated: 0,
      aiModelUsed: "openai/gpt-4o",
    },
  });
  assert.throws(() => IntegrateArtifactSchema.parse(artifact), z.ZodError);
});

// ---------------------------------------------------------------------------
// validateIntegrateArtifact tests
// ---------------------------------------------------------------------------

await runScenario("validateIntegrateArtifact parses and returns a valid IntegrateArtifact", () => {
  const input = makeMinimalArtifact();
  const result = validateIntegrateArtifact(input);
  assert.equal(result.schemaVersion, "2.0.0");
  assert.equal(result.tests[0].id, "tc-1");
  assert.equal(result.summary.aiModelUsed, "openai/gpt-4o");
});

await runScenario("validateIntegrateArtifact throws ZodError for missing required fields", () => {
  assert.throws(
    () => validateIntegrateArtifact({ schemaVersion: "2.0.0" }),
    z.ZodError
  );
});

await runScenario("validateIntegrateArtifact throws ZodError for extra keys", () => {
  const input = {
    ...makeMinimalArtifact(),
    unexpectedField: "should fail",
  };
  assert.throws(() => validateIntegrateArtifact(input), z.ZodError);
});

await runScenario("validateIntegrateArtifact throws ZodError for invalid test case status", () => {
  const input = makeMinimalArtifact({
    tests: [
      { id: "tc-1", name: "test", status: "invalid_status" } as unknown as IntegrationTestCase,
    ],
  });
  assert.throws(() => validateIntegrateArtifact(input), z.ZodError);
});

await runScenario("validateIntegrateArtifact throws ZodError for negative testCount in test file", () => {
  const input = makeMinimalArtifact({
    testFiles: [
      { path: "test.ts", testCount: -5, language: "typescript", framework: "jest" } as unknown as IntegrationTestFile,
    ],
  });
  assert.throws(() => validateIntegrateArtifact(input), z.ZodError);
});

await runScenario("validateIntegrateArtifact throws ZodError for negative summary total", () => {
  const input = makeMinimalArtifact({
    summary: { total: -1, passed: 0, failed: 0, skipped: 0, durationMs: 0, testFilesGenerated: 0, aiModelUsed: "openai/gpt-4o" } as unknown as IntegrationSummary,
  });
  assert.throws(() => validateIntegrateArtifact(input), z.ZodError);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

await runScenario("IntegrationTestCaseSchema allows all four valid states", () => {
  for (const status of ["pending", "passed", "failed", "skipped"] as const) {
    const result = IntegrationTestCaseSchema.parse({
      id: `tc-${status}`,
      name: `Test ${status}`,
      status,
    });
    assert.equal(result.status, status);
  }
});

await runScenario("IntegrationTestFileSchema allows testCount of zero", () => {
  const result = IntegrationTestFileSchema.parse({
    path: "tests/empty.test.ts",
    testCount: 0,
    language: "typescript",
    framework: "jest",
  });
  assert.equal(result.testCount, 0);
});

await runScenario("IntegrationSummarySchema allows all zero counts", () => {
  const result = IntegrationSummarySchema.parse({
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    testFilesGenerated: 0,
    aiModelUsed: "none",
  });
  assert.equal(result.total, 0);
});

await runScenario("IntegrateArtifactSchema allows empty tests and testFiles arrays", () => {
  const artifact = makeMinimalArtifact({
    tests: [],
    testFiles: [],
    summary: makeMinimalSummary({ total: 0, passed: 0, failed: 0, skipped: 0, testFilesGenerated: 0 }),
  });
  const result = IntegrateArtifactSchema.parse(artifact);
  assert.equal(result.tests.length, 0);
  assert.equal(result.testFiles.length, 0);
});

await runScenario("IntegrateArtifactSchema allows non-empty recommendations array", () => {
  const artifact = makeMinimalArtifact({
    recommendations: ["Fix flaky test", "Add retry logic"],
  });
  const result = IntegrateArtifactSchema.parse(artifact);
  assert.deepEqual(result.recommendations, ["Fix flaky test", "Add retry logic"]);
});

console.log("All integrate types-schema tests completed.");
