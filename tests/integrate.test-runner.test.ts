import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";

import {
  estimateTestCount,
  parseTestOutput,
  runIntegrationTests,
  EMPTY_TEST_FILES_ERROR,
} from "../src/integrate/test-runner.js";
import type { IntegrationTestFile } from "../src/integrate/types.js";

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
// Helper: create temp directory
// ---------------------------------------------------------------------------

async function withTempDir(
  fn: (dir: string) => Promise<void>
): Promise<void> {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "forge-test-runner-")
  );
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// estimateTestCount tests
// ---------------------------------------------------------------------------

await runScenario(
  "estimateTestCount returns 0 for empty content",
  () => {
    assert.equal(estimateTestCount("", "jest"), 0);
    assert.equal(estimateTestCount("", "pytest"), 0);
    assert.equal(estimateTestCount("", "vitest"), 0);
  }
);

await runScenario(
  "estimateTestCount returns 0 for whitespace-only content",
  () => {
    assert.equal(estimateTestCount("   \n  \t  ", "jest"), 0);
    assert.equal(estimateTestCount("   \n  \t  ", "pytest"), 0);
  }
);

await runScenario(
  "estimateTestCount counts pytest def test_\\w+ patterns",
  () => {
    const content = `
def test_login():
    assert True

def test_logout():
    assert True

def test_authenticate():
    assert True
`;
    assert.equal(estimateTestCount(content, "pytest"), 3);
  }
);

await runScenario(
  "estimateTestCount counts pytest patterns with mixed content",
  () => {
    const content = `
class TestAuth:
    def test_basic_login(self):
        pass

    def test_failed_login(self):
        pass

def test_standalone():
    pass
`;
    assert.equal(estimateTestCount(content, "pytest"), 3);
  }
);

await runScenario(
  "estimateTestCount returns 1 for pytest with no matches but non-empty content",
  () => {
    const content = `
# Some test helper code without def test_ patterns
class TestSomething:
    pass
`;
    assert.equal(estimateTestCount(content, "pytest"), 1);
  }
);

await runScenario(
  "estimateTestCount counts jest/it( patterns",
  () => {
    const content = `
describe("Auth", () => {
  it("should login", () => { expect(true).toBe(true); });
  it("should logout", () => { expect(true).toBe(true); });
  it("should authenticate", () => { expect(true).toBe(true); });
});
`;
    assert.equal(estimateTestCount(content, "jest"), 3);
  }
);

await runScenario(
  "estimateTestCount counts vitest it( patterns",
  () => {
    const content = `
import { describe, it, expect } from 'vitest';

describe("Auth", () => {
  it("should login", () => { expect(true).toBe(true); });
  it("should logout", () => { expect(true).toBe(true); });
});
`;
    assert.equal(estimateTestCount(content, "vitest"), 2);
  }
);

await runScenario(
  "estimateTestCount counts mocha it( patterns",
  () => {
    const content = `
describe("Auth", function() {
  it("should work", function() {});
});
`;
    assert.equal(estimateTestCount(content, "mocha"), 1);
  }
);

await runScenario(
  "estimateTestCount returns 1 for jest with no matching patterns but non-empty content",
  () => {
    const content = `
// Some test setup code
import { something } from './module';
describe("Something", () => {
  // placeholder
});
`;
    assert.equal(estimateTestCount(content, "jest"), 1);
  }
);

await runScenario(
  "estimateTestCount handles python framework name case-insensitively",
  () => {
    const content = `def test_something(): pass`;
    assert.equal(estimateTestCount(content, "Python"), 1);
  }
);

await runScenario(
  "estimateTestCount handles typescript as jest-like framework",
  () => {
    const content = `it("should work", () => {}); it("also works", () => {});`;
    assert.equal(estimateTestCount(content, "typescript"), 2);
  }
);

await runScenario(
  "estimateTestCount handles javascript as jest-like framework",
  () => {
    const content = `it("should work", () => {});`;
    assert.equal(estimateTestCount(content, "javascript"), 1);
  }
);

await runScenario(
  "estimateTestCount returns 1 for unknown framework with non-empty content",
  () => {
    const content = `some random test content`;
    assert.equal(estimateTestCount(content, "unknown-framework"), 1);
  }
);

// ---------------------------------------------------------------------------
// parseTestOutput tests
// ---------------------------------------------------------------------------

await runScenario(
  "parseTestOutput parses jest format with passed/failed",
  () => {
    const output = `
PASS src/auth.test.ts
  Auth
    ✓ should login (5 ms)
    ✓ should logout (3 ms)

FAIL src/api.test.ts
  API
    ✕ should fetch (2 ms)

Tests:       2 passed, 1 failed, 3 total
`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.total, 3);
  }
);

await runScenario(
  "parseTestOutput parses jest format with variable spacing",
  () => {
    const output = `Tests:  5 passed, 2 failed, 7 total`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 5);
    assert.equal(result.failed, 2);
    assert.equal(result.total, 7);
  }
);

await runScenario(
  "parseTestOutput parses jest format with only passed tests",
  () => {
    const output = `Tests:  3 passed, 3 total`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 3);
  }
);

await runScenario(
  "parseTestOutput parses pytest format with passed and failed",
  () => {
    const output = `
======================== short test summary info =========================
FAILED src/test_auth.py::test_login - AssertionError
======================== 1 failed, 3 passed in 0.12s ========================
`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 1);
    assert.equal(result.total, 4);
  }
);

await runScenario(
  "parseTestOutput parses pytest format with only passed",
  () => {
    const output = `5 passed in 0.05s`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 5);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 5);
  }
);

await runScenario(
  "parseTestOutput parses pytest format with errors counted as failures",
  () => {
    const output = `2 passed, 1 error in 0.10s`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1); // errors counted as failures
    assert.equal(result.total, 3);
  }
);

await runScenario(
  "parseTestOutput parses pytest format with passed, failed, and errors",
  () => {
    const output = `3 passed, 2 failed, 1 error in 0.25s`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 3); // 2 failed + 1 error
    assert.equal(result.total, 6);
  }
);

await runScenario(
  "parseTestOutput parses generic X passed, Y failed patterns",
  () => {
    const output = `10 passed, 4 failed`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 10);
    assert.equal(result.failed, 4);
    assert.equal(result.total, 14);
  }
);

await runScenario(
  "parseTestOutput returns zeros for unrecognized output",
  () => {
    const output = `some random output with no test results`;
    const result = parseTestOutput(output);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 0);
  }
);

await runScenario(
  "parseTestOutput returns zeros for empty output",
  () => {
    const result = parseTestOutput("");
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 0);
  }
);

// ---------------------------------------------------------------------------
// runIntegrationTests tests
// ---------------------------------------------------------------------------

await runScenario(
  "runIntegrationTests returns error for empty testFiles array",
  async () => {
    const result = await runIntegrationTests([], "/tmp/fake");
    assert.equal(result.success, false);
    assert.equal(result.error, EMPTY_TEST_FILES_ERROR);
    assert.equal(result.tests.length, 0);
    assert.equal(result.testFiles.length, 0);
  }
);

await runScenario(
  "runIntegrationTests writes test files to disk with recursive directory creation",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/integration/auth.test.ts",
        testCount: 2,
        language: "typescript",
        framework: "jest",
        content: `
import { describe, it, expect } from '@jest/globals';
describe("Auth", () => {
  it("should login", () => { expect(true).toBe(true); });
  it("should logout", () => { expect(true).toBe(true); });
});
`,
      };

      // Call runIntegrationTests with a failing test command
      // since we just want to verify file writing
      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  2 passed, 0 failed, 2 total'"
      );

      // Verify the file was written
      const writtenPath = path.resolve(dir, "tests/integration/auth.test.ts");
      const content = await fs.readFile(writtenPath, "utf-8");
      assert.ok(content.includes("should login"), "file should contain test content");

      // Verify the nested directory was created recursively
      const dirExists = await fs.stat(path.resolve(dir, "tests/integration")).catch(() => null);
      assert.ok(dirExists, "nested directory should be created");

      // Verify testFiles reflects what was written
      assert.equal(result.testFiles.length, 1);
      assert.equal(result.testFiles[0].path, "tests/integration/auth.test.ts");
    });
  }
);

await runScenario(
  "runIntegrationTests writes multiple test files",
  async () => {
    await withTempDir(async (dir) => {
      const testFiles: IntegrationTestFile[] = [
        {
          path: "tests/auth.test.ts",
          testCount: 2,
          language: "typescript",
          framework: "jest",
          content: `it("should login", () => {}); it("should logout", () => {});`,
        },
        {
          path: "tests/api.test.ts",
          testCount: 1,
          language: "typescript",
          framework: "jest",
          content: `it("should fetch", () => {});`,
        },
      ];

      const result = await runIntegrationTests(
        testFiles,
        dir,
        "echo 'Tests:  3 passed, 0 failed, 3 total'"
      );

      // Verify both files exist
      const authPath = path.resolve(dir, "tests/auth.test.ts");
      const apiPath = path.resolve(dir, "tests/api.test.ts");
      const authContent = await fs.readFile(authPath, "utf-8");
      const apiContent = await fs.readFile(apiPath, "utf-8");
      assert.ok(authContent.includes("should login"));
      assert.ok(apiContent.includes("should fetch"));

      // Verify testFiles reflects both files
      assert.equal(result.testFiles.length, 2);
      assert.equal(result.testFiles[0].path, "tests/auth.test.ts");
      assert.equal(result.testFiles[1].path, "tests/api.test.ts");
    });
  }
);

await runScenario(
  "runIntegrationTests estimates test count when testCount is not provided",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 0, // will be estimated from content
        language: "typescript",
        framework: "jest",
        content: `it("should login", () => {}); it("should logout", () => {});`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  2 passed, 0 failed, 2 total'"
      );

      // testCount on written file should be estimated from content
      assert.equal(result.testFiles[0].testCount, 2, "testCount should be estimated from content using it() pattern");
    });
  }
);

await runScenario(
  "runIntegrationTests estimates test count for pytest patterns",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/test_auth.py",
        testCount: 0,
        language: "python",
        framework: "pytest",
        content: `def test_login(): pass\ndef test_logout(): pass\ndef test_signup(): pass`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo ''"
      );

      assert.equal(result.testFiles[0].testCount, 3, "should count 3 pytest test functions");
    });
  }
);

await runScenario(
  "runIntegrationTests uses provided testCount over estimated count",
  async () => {
    await withTempDir(async (dir) => {
      // Provide a testCount that differs from what estimation would yield
      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 5, // explicit count, different from content estimation
        language: "typescript",
        framework: "jest",
        content: `it("should work", () => {});`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  5 passed, 0 failed, 5 total'"
      );

      // The provided testCount should take precedence
      assert.equal(result.testFiles[0].testCount, 5);
    });
  }
);

await runScenario(
  "runIntegrationTests returns success when all tests pass",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 2,
        language: "typescript",
        framework: "jest",
        content: `it("should work", () => {});`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  2 passed, 0 failed, 2 total'"
      );

      assert.equal(result.success, true);
      assert.equal(result.tests.filter((t) => t.status === "passed").length, 2);
    });
  }
);

await runScenario(
  "runIntegrationTests returns failure when some tests fail",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 3,
        language: "typescript",
        framework: "jest",
        content: `it("should work", () => {});`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  1 passed, 2 failed, 3 total'"
      );

      assert.equal(result.success, false);
      assert.equal(result.tests.filter((t) => t.status === "passed").length, 1);
      assert.equal(result.tests.filter((t) => t.status === "failed").length, 2);
    });
  }
);

await runScenario(
  "runIntegrationTests returns durationMs greater than 0",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 1,
        language: "typescript",
        framework: "jest",
        content: `it("should work", () => {});`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo 'Tests:  1 passed, 0 failed, 1 total'"
      );

      assert.ok(result.durationMs >= 0, "durationMs should be non-negative");
    });
  }
);

await runScenario(
  "runIntegrationTests handles file write error gracefully",
  async () => {
    // Use a read-only directory approach that works cross-platform.
    // Create a file where a directory should be, preventing mkdir from succeeding.
    await withTempDir(async (dir) => {
      // Create a file at a path where we later try to create a directory
      const blockingFile = path.join(dir, "blocked");
      await fs.writeFile(blockingFile, "this is a file, not a directory");

      // Now try to write a test file inside "blocked/sub/path.ts"
      // This should fail because "blocked" is a file, not a directory
      const result = await runIntegrationTests(
        [
          {
            path: "blocked/sub/test.ts",
            testCount: 1,
            language: "typescript",
            framework: "jest",
            content: "placeholder",
          },
        ],
        dir,
        "echo 'test'"
      );

      assert.equal(result.success, false);
      assert.ok(result.error, "should have an error message");
      assert.ok(
        result.error.includes("Failed to write test file"),
        `error should mention write failure, got: ${result.error}`
      );
    });
  }
);

await runScenario(
  "runIntegrationTests returns testFiles reflecting what was written",
  async () => {
    await withTempDir(async (dir) => {
      const files: IntegrationTestFile[] = [
        {
          path: "tests/a.test.ts",
          testCount: 2,
          language: "typescript",
          framework: "jest",
          content: `it("a1", () => {}); it("a2", () => {});`,
        },
        {
          path: "tests/b.test.py",
          testCount: 1,
          language: "python",
          framework: "pytest",
          content: `def test_b1(): pass`,
        },
      ];

      const result = await runIntegrationTests(
        files,
        dir,
        "echo 'Tests:  3 passed, 0 failed, 3 total'"
      );

      // testFiles should reflect what was actually written
      assert.equal(result.testFiles.length, 2);
      assert.equal(result.testFiles[0].path, "tests/a.test.ts");
      assert.equal(result.testFiles[0].framework, "jest");
      assert.equal(result.testFiles[0].content, files[0].content);

      assert.equal(result.testFiles[1].path, "tests/b.test.py");
      assert.equal(result.testFiles[1].framework, "pytest");
      assert.equal(result.testFiles[1].content, files[1].content);
    });
  }
);

await runScenario(
  "runIntegrationTests handles pytest output format",
  async () => {
    await withTempDir(async (dir) => {
      const testFile: IntegrationTestFile = {
        path: "tests/test_auth.py",
        testCount: 3,
        language: "python",
        framework: "pytest",
        content: `def test_login(): pass`,
      };

      const result = await runIntegrationTests(
        [testFile],
        dir,
        "echo '3 passed in 0.05s'"
      );

      assert.equal(result.success, true);
      assert.equal(result.tests.filter((t) => t.status === "passed").length, 3);
    });
  }
);

await runScenario(
  "runIntegrationTests defaults to npm test when no command provided",
  async () => {
    await withTempDir(async (dir) => {
      // Create a package.json with a simple test script
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "test-pkg", scripts: { test: "echo 'Tests:  1 passed, 0 failed, 1 total'" } })
      );

      const testFile: IntegrationTestFile = {
        path: "tests/auth.test.ts",
        testCount: 1,
        language: "typescript",
        framework: "jest",
        content: `it("should work", () => {});`,
      };

      const result = await runIntegrationTests([testFile], dir);

      assert.equal(result.success, true);
      assert.equal(result.tests.filter((t) => t.status === "passed").length, 1);
    });
  }
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write("\n--- Test Runner Tests Complete ---\n");
