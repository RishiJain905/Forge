// ---------------------------------------------------------------------------
// Integrate step — test runner
// ---------------------------------------------------------------------------
// Executes generated integration tests on disk. Writes test files to the
// repository, runs the test command, parses pass/fail results, and returns
// a structured TestRunResult.
//
// Exported functions:
//   estimateTestCount(content, framework) — estimate test count from content
//   parseTestOutput(output) — parse pass/fail from test runner output
//   runIntegrationTests(testFiles, repoRoot, testCommand?) — sequential runner
//   writeTestFilesParallel(testFiles, repoRoot) — parallel file writer
//   runIntegrationTestsParallel(testFiles, options) — parallel test runner
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "node:path";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IntegrationTestFile, IntegrationTestCase, TestRunResult } from "./types.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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
 *   - jest: "Tests:  5 passed, 2 failed, 7 total" (colon after `Tests`)
 *   - vitest default reporter: "Tests  10 passed (10)" or "Tests  2 failed | 8 passed (10)" (no colon)
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

  // Vitest default reporter (no colon after "Tests"):
  // "Tests  2 failed | 8 passed (10)" or "Tests  10 passed (10)"
  const vitestFailPass = output.match(
    /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed(?:\s*\((\d+)\))?/i
  );
  if (vitestFailPass) {
    failed = parseInt(vitestFailPass[1], 10);
    passed = parseInt(vitestFailPass[2], 10);
    const total = vitestFailPass[3]
      ? parseInt(vitestFailPass[3], 10)
      : passed + failed;
    return { passed, failed, total };
  }

  const vitestPassOnly = output.match(/Tests\s+(\d+)\s+passed(?:\s*\((\d+)\))?/i);
  if (vitestPassOnly) {
    passed = parseInt(vitestPassOnly[1], 10);
    const total = vitestPassOnly[2]
      ? parseInt(vitestPassOnly[2], 10)
      : passed;
    return { passed, failed: 0, total };
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
// runIntegrationTestsSequential (internal)
// ---------------------------------------------------------------------------

/**
 * Sequential implementation: write test files to disk and run a single test command.
 * Extracted from runIntegrationTests for reuse by the parallel runner for small suites.
 */
async function runIntegrationTestsSequential(
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
// runIntegrationTests (public wrapper — backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Write test files to disk and execute the test runner.
 *
 * This is the original public API. For backward compatibility, it delegates
 * to `runIntegrationTestsParallel` with default concurrency settings.
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
  const options: ParallelTestRunOptions = {
    maxConcurrency: 5,
    command: testCommand ?? "npm test",
    repoRoot,
    timeoutMs: 300_000,
  };
  return runIntegrationTestsParallel(testFiles, options);
}

// ---------------------------------------------------------------------------
// writeTestFilesParallel
// ---------------------------------------------------------------------------

/**
 * Write multiple test files to disk in parallel using Promise.all.
 *
 * For each file:
 *   1. Resolve the path relative to `repoRoot`
 *   2. Apply path traversal guards (reject absolute paths, reject paths outside repoRoot)
 *   3. Create parent directories (recursive)
 *   4. Write content to the file
 *   5. Estimate test count from content using `estimateTestCount`
 *
 * Files that fail path traversal guards are skipped with a warning and
 * recorded as placeholder entries with testCount = 0.
 *
 * @param testFiles  Array of test file descriptors to write.
 * @param repoRoot   Absolute path to the repository root.
 * @returns Array of written file descriptors with resolved paths and effective test counts.
 */
export async function writeTestFilesParallel(
  testFiles: IntegrationTestFile[],
  repoRoot: string
): Promise<IntegrationTestFile[]> {
  const writePromises = testFiles.map(async (tf) => {
    // Reject absolute paths — path traversal guard
    if (path.isAbsolute(tf.path)) {
      console.warn(
        `Warning: skipping test file with absolute path — path traversal detected: ${tf.path}`
      );
      return {
        path: tf.path,
        testCount: 0,
        language: tf.language,
        framework: tf.framework,
        content: `/* WARNING: Absolute path rejected — path traversal detected: ${tf.path} */`,
      } as IntegrationTestFile;
    }

    const absolutePath = path.resolve(repoRoot, tf.path);

    // Verify resolved path stays within repoRoot — path traversal guard
    const relativePath = path.relative(repoRoot, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      console.warn(
        `Warning: skipping test file that resolves outside repo root — path traversal detected: ${tf.path} -> ${absolutePath}`
      );
      return {
        path: tf.path,
        testCount: 0,
        language: tf.language,
        framework: tf.framework,
        content: `/* WARNING: Path traversal detected — resolves outside repo root: ${tf.path} */`,
      } as IntegrationTestFile;
    }

    const dir = path.dirname(absolutePath);

    // Create directories recursively
    await fs.mkdir(dir, { recursive: true });

    // Write file content
    await fs.writeFile(absolutePath, tf.content ?? "", "utf-8");

    // Estimate test count
    const estimatedCount = estimateTestCount(tf.content ?? "", tf.framework);
    const effectiveTestCount = tf.testCount > 0 ? tf.testCount : estimatedCount;

    return {
      path: tf.path,
      testCount: effectiveTestCount,
      language: tf.language,
      framework: tf.framework,
      content: tf.content,
    } as IntegrationTestFile;
  });

  return Promise.all(writePromises);
}

// ---------------------------------------------------------------------------
// ParallelTestRunOptions
// ---------------------------------------------------------------------------

/** Options for parallel test execution. */
export interface ParallelTestRunOptions {
  /** Maximum number of test commands to run in parallel per batch. */
  maxConcurrency: number;
  /** Base test command to execute (e.g. "npm test" or "npx jest"). */
  command: string;
  /** Absolute path to the repository root. */
  repoRoot: string;
  /** Timeout in milliseconds for each individual test command. */
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// runIntegrationTestsParallel
// ---------------------------------------------------------------------------

/**
 * Run integration tests in parallel batches.
 *
 * - If testFiles is empty, returns an error result.
 * - If testFiles < 5, delegates to `runIntegrationTestsSequential` (single batch).
 * - If testFiles >= 5, splits into batches of `maxConcurrency` and runs
 *   each batch in parallel via `Promise.all`.
 *
 * @param testFiles  Array of test file descriptors.
 * @param options    Parallel execution options.
 * @returns A TestRunResult with aggregated pass/fail counts.
 */
export async function runIntegrationTestsParallel(
  testFiles: IntegrationTestFile[],
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();

  // --- Guard: empty test files ---
  if (!testFiles || testFiles.length === 0) {
    return {
      success: false,
      tests: [],
      testFiles: [],
      durationMs: 0,
      error: EMPTY_TEST_FILES_ERROR,
    };
  }

  // Delegate to sequential for small suites (< 5 files)
  if (testFiles.length < 5) {
    return runIntegrationTestsSequential(
      testFiles,
      options.repoRoot,
      options.command
    );
  }

  // --- Parallel execution for 5+ files ---
  // First, write all test files in parallel
  const writtenFiles = await writeTestFilesParallel(testFiles, options.repoRoot);

  // Batch test files by maxConcurrency (use sanitized writtenFiles, not original testFiles)
  const safeFiles = writtenFiles.filter(tf => tf.testCount > 0);
  const concurrency = Math.max(1, Number.isFinite(options.maxConcurrency) ? options.maxConcurrency : 5);
  const batches = chunkArray(safeFiles, concurrency);
  const allResults: TestRunResult[] = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((tf) => runSingleTestFile(tf, options))
    );
    allResults.push(...batchResults);
  }

  // Aggregate results
  let totalPassed = 0;
  let totalFailed = 0;
  const allTests: IntegrationTestCase[] = [];
  let hasErrors = false;

  for (const result of allResults) {
    allTests.push(...result.tests);
    if (result.error) {
      hasErrors = true;
    }
    // Count passed and failed from the result
    totalPassed += result.tests.filter((t) => t.status === "passed").length;
    totalFailed += result.tests.filter((t) => t.status === "failed").length;
  }

  const elapsed = Date.now() - startTime;

  return {
    success: !hasErrors && totalFailed === 0 && totalPassed > 0,
    tests: allTests,
    testFiles: writtenFiles,
    durationMs: elapsed,
    ...(hasErrors ? { error: allResults.find((r) => r.error)?.error } : {}),
  };
}

// ---------------------------------------------------------------------------
// runSingleTestFile (internal helper)
// ---------------------------------------------------------------------------

/**
 * Run a single test file's test command and return a TestRunResult.
 *
 * Executes `${options.command} ${tf.path}` in the repo root directory,
 * parses the output for pass/fail counts, and returns a result.
 *
 * @param tf       The test file to run.
 * @param options  Parallel execution options.
 * @returns A TestRunResult for the single test file.
 */
async function runSingleTestFile(
  tf: IntegrationTestFile,
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();
  let stdout = "";
  let stderr = "";
  let runError: string | undefined;

  // Special case: npm test doesn't support per-file args, run the whole suite
  const isNpmTest = options.command.trim() === "npm test";
  const commandParts = isNpmTest
    ? ["npm", "test"]
    : [...options.command.split(/\s+/), tf.path];

  try {
    const result = await execFileAsync(commandParts[0], commandParts.slice(1), {
      cwd: options.repoRoot,
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
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

  // Parse the test output
  const { passed, failed, total } = parseTestOutput(combinedOutput);

  // Build test case results for this file
  const tests: IntegrationTestCase[] = buildTestCaseResults(passed, failed, [tf]);

  return {
    success: runError === undefined && failed === 0 && total > 0,
    tests,
    testFiles: [tf],
    durationMs: elapsed,
    ...(runError ? { error: runError } : {}),
  };
}

// ---------------------------------------------------------------------------
// chunkArray (utility)
// ---------------------------------------------------------------------------

/**
 * Split an array into chunks of the given size.
 *
 * @param arr   The array to split.
 * @param size  The maximum chunk size.
 * @returns An array of arrays, each of length `size` (except possibly the last).
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size < 1) {
    return [arr]; // Fallback: treat as single batch
  }
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
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
