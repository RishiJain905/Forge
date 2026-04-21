# Step 6 Batch 3 — Task 2: Parallel Test Execution

## Owner

MiniMax

## Status

**Pending**

## Context

Currently test files are written sequentially and test execution runs a single `npm test` command for all files. Batch 3 adds concurrent test file generation and parallel test execution for large suites.

## Implementation

### Phase A: Parallel File Writes

```typescript
// src/integrate/test-runner.ts — parallel file writes

export async function writeTestFilesParallel(
  testFiles: IntegrationTestFile[],
  repoRoot: string
): Promise<IntegrationTestFile[]> {
  const writePromises = testFiles.map(async (tf) => {
    const fullPath = path.isAbsolute(tf.path) ? tf.path : path.join(repoRoot, tf.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, tf.content ?? "", "utf-8");
    return {
      ...tf,
      path: fullPath,
      testCount: tf.testCount ?? countTestsInContent(tf.content ?? "", tf.framework),
    };
  });
  return Promise.all(writePromises);
}
```

### Phase B: Parallel Test Execution

```typescript
// src/integrate/test-runner.ts — parallel test execution

export interface ParallelTestRunOptions {
  maxConcurrency: number;   // Max parallel test commands
  command: string;          // Base test command
  repoRoot: string;
  timeoutMs: number;
}

// Small suite: run sequentially (less overhead)
// Large suite (>= 5 files): run in parallel batches

export async function runIntegrationTestsParallel(
  testFiles: IntegrationTestFile[],
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();

  if (testFiles.length < 5) {
    // Small suite: run all at once via single command (existing behavior)
    return runIntegrationTestsSequential(testFiles, options);
  }

  // Large suite: run files in parallel batches
  // Each batch runs N test files concurrently
  const batches = chunkArray(testFiles, options.maxConcurrency);
  const allResults: IntegrationTestCase[] = [];
  const allFiles: IntegrationTestFile[] = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((tf) => runSingleTestFile(tf, options))
    );
    for (const result of batchResults) {
      allResults.push(...result.tests);
      allFiles.push(...result.testFiles);
    }
  }

  const totalFailed = allResults.filter((t) => t.status === "failed").length;
  return {
    success: totalFailed === 0,
    tests: allResults,
    testFiles: allFiles,
    durationMs: Date.now() - startTime,
  };
}

async function runSingleTestFile(
  tf: IntegrationTestFile,
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();
  // Run this specific file
  const command = `${options.command} ${tf.path}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.repoRoot,
      timeout: options.timeoutMs,
    });
    const output = stdout + stderr;
    const tests = parseTestOutputForFile(tf.path, output, tf.framework);
    return {
      success: tests.filter((t) => t.status === "failed").length === 0,
      tests,
      testFiles: [tf],
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      tests: [{
        id: tf.path,
        name: `Test file: ${tf.path}`,
        status: "failed",
        error: errorMessage,
        durationMs: Date.now() - startTime,
      }],
      testFiles: [tf],
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

### Phase C: Update `runIntegrationTests` Signature

Refactor existing `runIntegrationTests` to use the new parallel internals:

```typescript
export async function runIntegrationTests(
  testFiles: IntegrationTestFile[],
  repoRoot: string,
  testCommand?: string
): Promise<TestRunResult> {
  const options: ParallelTestRunOptions = {
    maxConcurrency: 5,  // default
    command: testCommand ?? "npm test -- --passWithNoTests",
    repoRoot,
    timeoutMs: 300000,
  };
  return runIntegrationTestsParallel(testFiles, options);
}
```

### Phase D: CLI Wiring

Add `maxConcurrency` option to CLI options:

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  jsonOnly?: boolean;
  testFramework?: string;
  delay?: number;
  maxRetries?: number;
  maxDurationMs?: number;
  maxConcurrency?: number;   // NEW: max parallel test operations
}
```

Update CLI registration:
```typescript
.option("--max-concurrency <n>", "Max parallel test operations (default: 5)", (val) => parseInt(val, 10))
```

Wire to test runner:
```typescript
const parallelOptions: ParallelTestRunOptions = {
  maxConcurrency: options.maxConcurrency ?? 5,
  command: detectedFramework.testCommand,
  repoRoot,
  timeoutMs: 300000,
};

const testResult = await runIntegrationTestsParallel(testFiles, parallelOptions);
```

## Test Coverage

Add to `tests/integrate.test-runner.test.ts`:

```typescript
it("writes test files in parallel", async () => {
  // Create 5 test files
  // Verify all writes complete
  // Verify timing is faster than sequential
});

it("runs large test suites (>= 5 files) in parallel batches", async () => {
  // Create 10 test files
  // Mock execAsync to track concurrent calls
  // Verify batches are used
});

it("small test suites (< 5 files) run sequentially", async () => {
  // Create 3 test files
  // Verify single npm test command is called
});

it("--max-concurrency controls parallel batch size", async () => {
  // Create 10 test files
  // Run with --max-concurrency 2
  // Verify batch size is 2
});
```

## Files Modified

- `src/integrate/test-runner.ts` — parallel writes, parallel execution
- `src/integrate/types.ts` — add `maxConcurrency` to options
- `src/integrate/cli.ts` — wire maxConcurrency to test runner
- `src/cli.ts` — register `--max-concurrency` flag
- `tests/integrate.test-runner.test.ts` — add parallel execution tests

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- All new tests pass
- `forge integrate --help` shows `--max-concurrency`
