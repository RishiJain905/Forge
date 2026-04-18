# Test Runner Module

## File: `src/integrate/test-runner.ts`

### Exported Functions

1. **`estimateTestCount(content: string, framework: string): number`**
   - Estimates test count from source content using framework patterns
   - pytest/python: counts `def test_\w+` patterns
   - jest/vitest/mocha: counts `\bit(` patterns
   - Returns 0 for empty/whitespace content
   - Returns 1 for non-empty content with no pattern matches (fallback)
   - Case-insensitive framework matching

2. **`parseTestOutput(output: string): { passed, failed, total }`**
   - Parses test runner stdout/stderr for pass/fail counts
   - Recognizes jest format: `Tests:  X passed, Y failed, Z total`
   - Recognizes pytest format: `X passed, Y failed` and `X error`
   - Generic fallback for `X passed, Y failed` patterns
   - Returns `{passed: 0, failed: 0, total: 0}` for unrecognized output

3. **`runIntegrationTests(testFiles, repoRoot, testCommand?): Promise<TestRunResult>`**
   - Writes test files to disk with recursive directory creation
   - Runs test command (defaults to "npm test")
   - Returns `TestRunResult` with success, tests, testFiles, durationMs, error
   - Empty testFiles returns `{success: false, error: EMPTY_TEST_FILES_ERROR}`
   - When testCount is 0 or not provided, estimates from content
   - Handles file write errors gracefully

### Exported Constants

- `EMPTY_TEST_FILES_ERROR = "No test files provided to runIntegrationTests"`

### Test File

- `tests/integrate.test-runner.test.ts` — 34 test cases covering all functions
