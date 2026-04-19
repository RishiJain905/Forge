// ---------------------------------------------------------------------------
// Integrate step — test runner
// ---------------------------------------------------------------------------
// Executes generated integration tests on disk. Writes test files to the
// repository, runs the test command, parses pass/fail results, and returns
// a structured TestRunResult.
//
// Two exported functions:
//   estimateTestCount(content, framework) — estimate test count from content
//   runIntegrationTests(testFiles, repoRoot, testCommand?) — full runner
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { IntegrationTestFile, IntegrationTestCase, TestRunResult } from "./types.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Error message returned when testFiles is empty. */
export const EMPTY_TEST_FILES_ERROR = "No test files provided to runIntegrationTests";

// ---------------------------------------------------------------------------
// estimateTestCount
// ---------------------------------------------------------------------------

/**
 * Estimate the number of test cases in a file's content by matching
 * framework-specific patterns.
 *
 * Patterns:
 *   - pytest:  `def test_\\w+`
 *   - jest:    `\\bit\\(`  (it("...", ...) or it('...', ...))
 *   - vitest:  same as jest pattern
 *   - mocha:   same as jest pattern (describe/it)
 *   - fallback: 1 (assume at least one test if content is non-empty)
 *
 * @param content  The test file source code.
 * @param framework  The detected test framework name.
 * @returns Estimated number of test cases (0 if content is empty).
 */
export function estimateTestCount(content: string, framework: string): number {
  if (!content || content.trim().length === 0) {
    return 0;
  }

  const lower = framework.toLowerCase();

  // Python / pytest pattern: def test_<name>(
  if (lower === "pytest" || lower === "python") {
    const matches = content.match(/def test_\w+/g);
    return matches ? matches.length : 1;
  }

  // JavaScript/TypeScript test frameworks: it("...") or it('...')
  if (
    lower === "jest" ||
    lower === "vitest" ||
    lower === "mocha" ||
    lower === "javascript" ||
    lower === "typescript"
  ) {
    const matches = content.match(/\bit\(/g);
    return matches ? matches.length : 1;
  }

  // Fallback: assume at least one test in non-empty content
  return 1;
}

// ---------------------------------------------------------------------------
// parseTestOutput
// ---------------------------------------------------------------------------

/**
 * Parse the combined stdout+stderr of a test run to extract pass/fail counts.
 *
 * Recognised patterns:
 *   - jest/vitest: "Tests:  5 passed, 2 failed, 7 total"
 *   - jest/vitest: "Tests: 5 passed, 2 failed, 7 total" (various spacing)
 *   - pytest: "5 passed, 2 failed" or "5 passed, 1 error" or "5 passed"
 *   - Generic: look for "X passed" and "X failed" patterns
 *
 * @param output  Combined stdout + stderr from the test runner.
 * @returns An object with `passed`, `failed`, and total counts.
 */
export function parseTestOutput(output: string): {
  passed: number;
  failed: number;
  total: number;
} {
  // Default: all zeros (nothing detected)
  let passed = 0;
  let failed = 0;

  // Try jest/vitest style: "Tests:  5 passed, 2 failed, 7 total"
  // Also handles "Tests: 5 passed, 2 failed, 7 total" with variable spacing
  const jestMatch = output.match(
    /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/
  );
  if (jestMatch) {
    passed = parseInt(jestMatch[1], 10);
    failed = parseInt(jestMatch[2], 10);
    return { passed, failed, total: passed + failed };
  }

  // jest/vitest style with only passed: "Tests:  5 passed, 5 total"
  const jestPassedOnly = output.match(
    /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/
  );
  if (jestPassedOnly) {
    passed = parseInt(jestPassedOnly[1], 10);
    const total = parseInt(jestPassedOnly[2], 10);
    failed = Math.max(0, total - passed);
    return { passed, failed, total };
  }

  // pytest style: "5 passed, 2 failed" or "5 passed, 1 error"
  const pytestPassedMatch = output.match(/(\d+)\s+passed/);
  if (pytestPassedMatch) {
    passed = parseInt(pytestPassedMatch[1], 10);
  }

  const pytestFailedMatch = output.match(/(\d+)\s+failed/);
  if (pytestFailedMatch) {
    failed = parseInt(pytestFailedMatch[1], 10);
  }

  // Also check for pytest errors (treat as failures)
  const pytestErrorMatch = output.match(/(\d+)\s+error/);
  if (pytestErrorMatch) {
    failed += parseInt(pytestErrorMatch[1], 10);
  }

  if (pytestPassedMatch || pytestFailedMatch) {
    return { passed, failed, total: passed + failed };
  }

  // Generic fallback: look for "X passed" and "X failed" anywhere
  const genericPassed = output.match(/(\d+)\s+passed/);
  const genericFailed = output.match(/(\d+)\s+failed/);

  if (genericPassed) {
    passed = parseInt(genericPassed[1], 10);
  }
  if (genericFailed) {
    failed = parseInt(genericFailed[2] ?? genericFailed[1], 10);
  }

  if (genericPassed || genericFailed) {
    return { passed, failed, total: passed + failed };
  }

  return { passed: 0, failed: 0, total: 0 };
}

// ---------------------------------------------------------------------------
// runIntegrationTests
// ---------------------------------------------------------------------------

/**
 * Write test files to disk and execute the test runner.
 *
 * For each file in `testFiles`:
 *   1. Resolve the file path relative to `repoRoot`
 *   2. Create parent directories (recursive)
 *   3. Write `content` to the file
 *   4. Estimate the test count from `content` using `estimateTestCount`
 *
 * After writing all files, runs `testCommand` (defaults to "npm test") and
 * parses the output for pass/fail counts.
 *
 * If `testFiles` is empty, returns `{ success: false, error: "No test files provided..." }`.
 *
 * @param testFiles     Array of test file descriptors (path, content, language, framework).
 * @param repoRoot      Absolute path to the repository root.
 * @param testCommand   Optional override for the test command (defaults to "npm test").
 * @returns A TestRunResult indicating success/failure, test cases, durations, etc.
 */
export async function runIntegrationTests(
  testFiles: IntegrationTestFile[],
  repoRoot: string,
  testCommand?: string
): Promise<TestRunResult> {
  const startTime = Date.now();

  // --- Guard: empty test files ---
  if (!testFiles || testFiles.length === 0) {
    return {
      success: false,
      tests: [],
      testFiles: [],
      durationMs: Date.now() - startTime,
      error: EMPTY_TEST_FILES_ERROR,
    };
  }

  // --- Step 1: Write test files to disk ---
  const writtenFiles: IntegrationTestFile[] = [];

  for (const tf of testFiles) {
    try {
      // Reject absolute paths before resolving — path traversal guard
      if (path.isAbsolute(tf.path)) {
        console.warn(
          `Warning: skipping test file with absolute path — path traversal detected: ${tf.path}`
        );
        writtenFiles.push({
          path: tf.path,
          testCount: 0,
          language: tf.language,
          framework: tf.framework,
          content: `/* WARNING: Absolute path rejected — path traversal detected: ${tf.path} */`,
        });
        continue;
      }

      const absolutePath = path.resolve(repoRoot, tf.path);

      // Verify resolved path stays within repoRoot — path traversal guard
      const relativePath = path.relative(repoRoot, absolutePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        console.warn(
          `Warning: skipping test file that resolves outside repo root — path traversal detected: ${tf.path} -> ${absolutePath}`
        );
        writtenFiles.push({
          path: tf.path,
          testCount: 0,
          language: tf.language,
          framework: tf.framework,
          content: `/* WARNING: Path traversal detected — resolves outside repo root: ${tf.path} */`,
        });
        continue;
      }

      const dir = path.dirname(absolutePath);

      // Create directories recursively
      await fs.mkdir(dir, { recursive: true });

      // Write file content
      await fs.writeFile(absolutePath, tf.content ?? "", "utf-8");

      // Estimate test count and record what was written
      // Use estimated count when testCount is 0 or not provided
      const estimatedCount = estimateTestCount(tf.content ?? "", tf.framework);
      const effectiveTestCount = tf.testCount > 0 ? tf.testCount : estimatedCount;
      writtenFiles.push({
        path: tf.path,
        testCount: effectiveTestCount,
        language: tf.language,
        framework: tf.framework,
        content: tf.content,
      });
    } catch (writeError) {
      const elapsed = Date.now() - startTime;
      return {
        success: false,
        tests: [],
        testFiles: writtenFiles,
        durationMs: elapsed,
        error: `Failed to write test file ${tf.path}: ${
          writeError instanceof Error ? writeError.message : String(writeError)
        }`,
      };
    }
  }

  // --- Step 2: Run the test command ---
  const command = testCommand ?? "npm test";

  let stdout = "";
  let stderr = "";
  let runError: string | undefined;

  try {
    const result = await execAsync(command, {
      cwd: repoRoot,
      timeout: 300_000, // 5-minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10 MB buffer
    });
    stdout = result.stdout ?? "";
    stderr = result.stderr ?? "";
  } catch (err: unknown) {
    // Many test runners exit with non-zero when tests fail — that's expected.
    // We still capture output for parsing.
    if (err && typeof err === "object" && "stdout" in err && "stderr" in err) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      stdout = execErr.stdout ?? "";
      stderr = execErr.stderr ?? "";
      // Only set a real error flag if the process couldn't run at all
      // (e.g., command not found). Test failures are handled via parsing.
    } else {
      runError = err instanceof Error ? err.message : String(err);
    }
  }

  const combinedOutput = `${stdout}\n${stderr}`;
  const elapsed = Date.now() - startTime;

  // --- Step 3: Parse the test output ---
  const { passed, failed, total } = parseTestOutput(combinedOutput);

  // --- Step 4: Build individual test case results ---
  // Since we can't easily map individual test cases from output,
  // we create synthetic results based on parsed counts.
  const tests: IntegrationTestCase[] = buildTestCaseResults(
    passed,
    failed,
    writtenFiles
  );

  // --- Step 5: Return result ---
  return {
    success: runError === undefined && failed === 0 && total > 0,
    tests,
    testFiles: writtenFiles,
    durationMs: elapsed,
    ...(runError ? { error: runError } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build synthetic test case results from parsed pass/fail counts and
 * the written test files. This provides a best-effort mapping when the
 * test runner doesn't output structured results.
 */
function buildTestCaseResults(
  passed: number,
  failed: number,
  writtenFiles: IntegrationTestFile[]
): IntegrationTestCase[] {
  const results: IntegrationTestCase[] = [];
  let passIndex = 0;
  let failIndex = 0;

  for (const file of writtenFiles) {
    const fileTestCount = file.testCount;

    // Distribute passes and failures across files proportionally
    // This is a best-effort approximation since individual test
    // names aren't available from raw output parsing.
    for (let i = 0; i < fileTestCount; i++) {
      if (passIndex < passed) {
        results.push({
          id: `test-${results.length + 1}`,
          name: `Test case ${results.length + 1} (${path.basename(file.path)})`,
          status: "passed",
          durationMs: 0,
        });
        passIndex++;
      } else if (failIndex < failed) {
        results.push({
          id: `test-${results.length + 1}`,
          name: `Test case ${results.length + 1} (${path.basename(file.path)})`,
          status: "failed",
          error: "Test failed (see output for details)",
        });
        failIndex++;
      } else {
        // Extra estimated tests not accounted for in parsed output
        results.push({
          id: `test-${results.length + 1}`,
          name: `Test case ${results.length + 1} (${path.basename(file.path)})`,
          status: "pending",
        });
      }
    }
  }

  return results;
}
