# Step 6 Batch 1 — Validation Contract
## forge integrate

> This document defines the behavioral validation assertions for `forge integrate` (Step 6).
> Each assertion has: ID, Title, Behavioral Description, Tool, and Evidence Requirements.

---

## 1. CLI Command (`src/integrate/cli.ts`)

### VAL-CLI-001: Help output
- **Title:** `forge integrate --help` shows command with all options
- **Behavioral Description:** When user runs `forge integrate --help`, the CLI outputs help text listing the `integrate` command with all supported options: `--repo`, `--output-dir`, `--force`, `--auto`, `--test-framework`.
- **Tool:** CLI inspection
- **Evidence Requirements:**
  - `forge integrate --help` exits with code 0
  - Output contains "integrate" command
  - Output lists all five options with descriptions

### VAL-CLI-002: Missing execute artifact
- **Title:** `forge integrate` without execute.json fails with NO_EXECUTE_ARTIFACT
- **Behavioral Description:** When `forge integrate` runs and `.forge/execute.json` does not exist, the command returns a failure result with `failure.code === "NO_EXECUTE_ARTIFACT"` and a descriptive message instructing the user to run `forge execute` first.
- **Tool:** CLI invocation
- **Evidence Requirements:**
  - Command exits with non-zero exit code
  - `result.status === "failed"`
  - `result.failure.code === "NO_EXECUTE_ARTIFACT"`
  - `result.failure.message` contains "execute.json"

### VAL-CLI-003: All workstreams failed
- **Title:** `forge integrate` with all workstreams failed fails with ALL_WORKSTREAMS_FAILED
- **Behavioral Description:** When execute.json exists but every workstream has state `"failed"`, the command returns a failure result with `failure.code === "ALL_WORKSTREAMS_FAILED"` and explains that integration is meaningless.
- **Tool:** CLI invocation with crafted execute.json
- **Evidence Requirements:**
  - execute.json contains workstreams where all have `state: "failed"`
  - Command exits with non-zero exit code
  - `result.failure.code === "ALL_WORKSTREAMS_FAILED"`

### VAL-CLI-004: Valid execution produces integrate.json
- **Title:** `forge integrate` with valid execute.json produces integrate.json
- **Behavioral Description:** When execute.json exists and contains at least one non-failed workstream, the command proceeds to build the AI prompt, call the model, run tests, and produce `.forge/integrate.json`.
- **Tool:** CLI invocation with valid execute.json
- **Evidence Requirements:**
  - `result.status === "ready"` or `"failed"` (depending on test outcomes)
  - `result.artifactPath` points to a file that exists after execution
  - The artifact file contains valid JSON matching IntegrateArtifactSchema

### VAL-CLI-005: Exit code on test results
- **Title:** Exit code 0 when all tests pass, 1 when failures exist
- **Behavioral Description:** The CLI exit code reflects test pass/fail: 0 when `summary.failed === 0`, 1 when `summary.failed > 0`. If the command itself fails before running tests, the exit code also reflects failure.
- **Tool:** Process exit code inspection
- **Evidence Requirements:**
  - Successful integration with zero failures: exit code === 0
  - Integration with one or more failed tests: exit code === 1
  - Failed command (e.g., no execute.json): exit code !== 0

---

## 2. Type Definitions (`src/integrate/types.ts`)

### VAL-TYPES-001: All types exported
- **Title:** All integration types are exported from types.ts
- **Behavioral Description:** `IntegrationTestState`, `IntegrationTestCase`, `IntegrationTestFile`, `IntegrationSummary`, `IntegrateArtifact`, `IntegrateCommandOptions`, `IntegrateCommandResult`, `PromptBuildContext`, `BuiltPrompt`, `TestRunResult` are all exported from `src/integrate/types.ts`.
- **Tool:** TypeScript import check
- **Evidence Requirements:**
  - `import type { IntegrationTestState, ... } from "./integrate/types.js"` compiles without error
  - Each type is accessible via named export

### VAL-TYPES-002: IntegrationTestState values
- **Title:** IntegrationTestState has correct values: pending, passed, failed, skipped
- **Behavioral Description:** The `IntegrationTestState` type alias equals `"pending" | "passed" | "failed" | "skipped"`.
- **Tool:** TypeScript type assertion / schema validation
- **Evidence Requirements:**
  - `IntegrationTestState` accepts all four string literals
  - Invalid state values produce a type error

### VAL-TYPES-003: IntegrationTestCase required fields
- **Title:** IntegrationTestCase has required fields: id, name, status
- **Behavioral Description:** `IntegrationTestCase` interface requires `id: string`, `name: string`, `status: IntegrationTestState`. Optional fields include `durationMs?: number`, `error?: string`, `recommendation?: string`.
- **Tool:** TypeScript interface check
- **Evidence Requirements:**
  - An object `{ id: "test-1", name: "Test case", status: "passed" }` satisfies `IntegrationTestCase`
  - Missing any required field produces a type error

### VAL-TYPES-004: IntegrationTestFile required fields
- **Title:** IntegrationTestFile has required fields: path, testCount, language, framework
- **Behavioral Description:** `IntegrationTestFile` interface requires `path: string`, `testCount: number`, `language: string`, `framework: string`. Optional field includes `content?: string`.
- **Tool:** TypeScript interface check
- **Evidence Requirements:**
  - An object with all four required fields satisfies `IntegrationTestFile`
  - Missing any required field produces a type error

### VAL-TYPES-005: IntegrateArtifact top-level fields
- **Title:** IntegrateArtifact has all required top-level fields
- **Behavioral Description:** `IntegrateArtifact` interface includes required fields: `schemaVersion`, `forgeVersion`, `createdAt`, `executeSource`, `planSource`, `verifySource`, `goal`, `workstreamsSummary`, `tests`, `testFiles`, `summary`, `recommendations`.
- **Tool:** TypeScript interface check
- **Evidence Requirements:**
  - A fully populated artifact object satisfies the interface
  - Missing any top-level required field produces a type error

---

## 3. Schema Validation (`src/integrate/schema.ts`)

### VAL-SCHEMA-001: IntegrateArtifactSchema validates full artifact shape
- **Title:** IntegrateArtifactSchema validates the complete artifact including all required fields
- **Behavioral Description:** `IntegrateArtifactSchema.parse(validArtifact)` parses without error when given a valid IntegrateArtifact object with all required fields and correct types.
- **Tool:** Zod schema validation
- **Evidence Requirements:**
  - `validateIntegrateArtifact(validFullArtifact)` returns the parsed object
  - No ZodError is thrown for a valid artifact

### VAL-SCHEMA-002: validateIntegrateArtifact parses valid artifacts
- **Title:** validateIntegrateArtifact() parses valid artifacts without error
- **Behavioral Description:** The `validateIntegrateArtifact(input: unknown): IntegrateArtifact` function accepts a valid artifact and returns the parsed object with inferred types.
- **Tool:** Function call with valid input
- **Evidence Requirements:**
  - Function executes without throwing
  - Return value is an object with all expected fields

### VAL-SCHEMA-003: Schema rejects missing required fields
- **Title:** Schema rejects artifacts missing required fields
- **Behavioral Description:** When an artifact is missing required fields (e.g., no `schemaVersion`, no `tests`), `IntegrateArtifactSchema.parse()` throws a ZodError describing the missing field.
- **Tool:** Zod schema validation with invalid input
- **Evidence Requirements:**
  - `IntegrateArtifactSchema.parse(incompleteArtifact)` throws ZodError
  - Error message mentions the missing field path

### VAL-SCHEMA-004: Schema rejects unknown keys (strict mode)
- **Title:** Schema rejects unknown keys via .strict()
- **Behavioral Description:** `IntegrateArtifactSchema` uses `.strict()` so any artifact with unknown top-level keys throws a ZodError on parse.
- **Tool:** Zod schema validation with extra keys
- **Evidence Requirements:**
  - `IntegrateArtifactSchema.parse(artifactWithExtraKeys)` throws ZodError
  - Error indicates an "unrecognized keys" issue

---

## 4. Prompt Builder (`src/integrate/prompt-builder.ts`)

### VAL-PROMPT-001: detectTestFramework finds jest from package.json
- **Title:** detectTestFramework finds jest/vitest/npm/pytest from package.json
- **Behavioral Description:** Given a repo root with `package.json` containing a `test` script with "jest", or jest in dependencies/devDependencies, `detectTestFramework` returns `{ name: "jest", language: "typescript", testCommand: "npm test -- --passWithNoTests" }`.
- **Tool:** Unit test with mocked package.json
- **Evidence Requirements:**
  - Repo with `"jest"` in test script returns `name: "jest"`
  - Repo with vitest in devDependencies returns `name: "vitest"`
  - Repo with pytest in test script returns `name: "pytest"`

### VAL-PROMPT-002: detectTestFramework falls back to pytest.ini/pyproject.toml
- **Title:** detectTestFramework falls back to pytest.ini/pyproject.toml
- **Behavioral Description:** When no `package.json` test script exists, `detectTestFramework` checks for `pytest.ini` or `pyproject.toml` with `[tool.pytest` section and returns `{ name: "pytest", language: "python", testCommand: "python -m pytest" }`.
- **Tool:** Unit test with mocked file system
- **Evidence Requirements:**
  - Repo with pytest.ini file (no package.json) returns `name: "pytest"`
  - Repo with pyproject.toml containing [tool.pytest] returns `name: "pytest"`

### VAL-PROMPT-003: buildIntegrationTestPrompt includes goal, workstreams, changed files
- **Title:** buildIntegrationTestPrompt includes goal, workstreams, changed files in the prompt
- **Behavioral Description:** `buildIntegrationTestPrompt(ctx)` returns a `BuiltPrompt` containing a `prompt` string that includes: the original task goal from plan artifact, workstream summaries from execute artifact, and changed file contents from execute artifact. The prompt also includes the detected or specified test framework.
- **Tool:** Function call with mocked context, prompt content inspection
- **Evidence Requirements:**
  - Returned `BuiltPrompt.prompt` contains the goal text
  - Returned `BuiltPrompt.prompt` contains workstream titles and states
  - Returned `BuiltPrompt.prompt` contains file path references from changesMade
  - Returned `BuiltPrompt.detectedFramework` is populated

### VAL-PROMPT-004: buildIntegrationTestPrompt produces deterministic hash
- **Title:** buildIntegrationTestPrompt produces a deterministic SHA-256 promptHash
- **Behavioral Description:** Given the same `PromptBuildContext`, `buildIntegrationTestPrompt` returns the same `promptHash` value (SHA-256 of the prompt string). Different inputs produce different hashes.
- **Tool:** Function call repeatability check
- **Evidence Requirements:**
  - Two calls with identical context produce identical `promptHash`
  - Different context produces different `promptHash`

---

## 5. Test Runner (`src/integrate/test-runner.ts`)

### VAL-RUNNER-001: runIntegrationTests writes test files to disk
- **Title:** runIntegrationTests writes test files to the specified paths
- **Behavioral Description:** `runIntegrationTests(testFiles, repoRoot, testCommand?)` writes each test file's content to disk at the path specified in `testFiles[].path`. Directories are created as needed via `fs.mkdir` with `recursive: true`.
- **Tool:** Function call with temporary directory, file system inspection
- **Evidence Requirements:**
  - After call, the file at `testFiles[0].path` exists and contains `testFiles[0].content`
  - Multiple test files are all written

### VAL-RUNNER-002: Test results are parsed and recorded
- **Title:** Test results are parsed from command output and recorded in TestRunResult
- **Behavioral Description:** When tests run and pass, `runIntegrationTests` parses the stdout/stderr to extract test names and counts, populating `TestRunResult.tests` with individual `IntegrationTestCase` entries. `TestRunResult.success` is `true` when no failures.
- **Tool:** Function call with real test framework output
- **Evidence Requirements:**
  - `TestRunResult.tests` contains entries with `status: "passed"` for passing tests
  - `TestRunResult.success` is `true` when all tests pass

### VAL-RUNNER-003: Error handling when no test files generated
- **Title:** Error handling when no test files generated returns failure
- **Behavioral Description:** When `testFiles` array is empty, `runIntegrationTests` returns `TestRunResult` with `success: false` and `error: "No test files were generated"`.
- **Tool:** Function call with empty array
- **Evidence Requirements:**
  - Call with `testFiles = []` returns `success: false`
  - Returned `error` is a non-empty string describing the issue

### VAL-RUNNER-004: Test count estimation from content
- **Title:** Test runner estimates test count from file content when not provided
- **Behavioral Description:** When a test file entry has no explicit `testCount`, the runner counts tests based on framework patterns: `def test_\w+` for pytest, `\bit\s*\(` for Jest/others.
- **Tool:** Function call inspection
- **Evidence Requirements:**
  - Test file with `content: "def test_example():"` and framework `"pytest"` yields testCount >= 1
  - Test file with `content: "it('works', () => {"` and framework `"jest"` yields testCount >= 1

---

## 6. Artifact Writing (`src/integrate/artifact.ts`)

### VAL-ARTIFACT-001: buildIntegrateArtifact produces valid IntegrateArtifact
- **Title:** buildIntegrateArtifact produces an object that passes validateIntegrateArtifact
- **Behavioral Description:** `buildIntegrateArtifact` accepts ExecuteArtifact, PlanArtifact, VerifyArtifact (nullable), TestRunResult, aiModelUsed, aiConfig, schemaVersion, forgeVersion, and returns an object that `validateIntegrateArtifact` accepts without throwing.
- **Tool:** Function call with mocked inputs, schema validation
- **Evidence Requirements:**
  - `validateIntegrateArtifact(buildIntegrateArtifact(...))` does not throw
  - The returned object has `schemaVersion`, `forgeVersion`, `createdAt`, `goal`, `tests`, `testFiles`, `summary`

### VAL-ARTIFACT-002: writeIntegrateArtifact creates .forge/integrate.json
- **Title:** writeIntegrateArtifact creates the .forge/integrate.json file
- **Behavioral Description:** `writeIntegrateArtifact(artifactPath, artifact)` creates the directory if it doesn't exist and writes the artifact as JSON with 2-space indentation.
- **Tool:** Function call with temp directory, file system inspection
- **Evidence Requirements:**
  - After call, the file at `artifactPath` exists
  - File content is valid JSON
  - JSON content matches the provided artifact object

---

## 7. Report Generation (`src/integrate/report.ts`)

### VAL-REPORT-001: createIntegrationReport produces markdown report
- **Title:** createIntegrationReport produces a markdown report with all sections
- **Behavioral Description:** `createIntegrationReport(artifact)` returns a markdown string containing: title "Forge Integration Report", date, goal, workstreams summary table, test results table, test files list, individual test results with icons, AI recommendations if any, and next steps section.
- **Tool:** Function call with full artifact, output inspection
- **Evidence Requirements:**
  - Returned string contains "Forge Integration Report"
  - Returned string contains workstreams summary table
  - Returned string contains test results with ✅/❌/⏭️ icons
  - Returned string contains "Next Steps" heading

### VAL-REPORT-002: Report includes test summary, results, recommendations
- **Title:** Report includes test summary, individual results, and recommendations
- **Behavioral Description:** For a failing test artifact, the report includes the failed test name, error content (in code block), and the AI recommendation. For all artifacts, the report includes the summary counts (passed/failed/skipped/duration).
- **Tool:** Function call with failing-test artifact
- **Evidence Requirements:**
  - Failed test name appears in the report
  - Error message from failed test appears in code block
  - Recommendation from failed test appears in report

---

## 8. Cross-Area Flow

### VAL-CROSS-001: End-to-end flow executes without error
- **Title:** User runs `forge integrate` → reads execute.json → prompt builder → AI model → test runner → artifact writer → report generator
- **Behavioral Description:** A full `forge integrate` invocation with valid inputs flows through all modules: CLI reads execute.json, prompt builder constructs the AI prompt, model connector is called (mocked or real), test runner executes tests, artifact is written, report is generated. Each step passes its outputs to the next.
- **Tool:** Integration test or CLI smoke test
- **Evidence Requirements:**
  - `forge integrate` with valid execute.json produces both `integrate.json` and `integration-report.md`
  - Both files exist and are non-empty
  - `integrate.json` passes `validateIntegrateArtifact`

### VAL-CROSS-002: executeWorkstream from model-connector is reused
- **Title:** CLI reuses executeWorkstream from src/execute/model-connector.ts
- **Behavioral Description:** `src/integrate/cli.ts` imports `executeWorkstream` from `"../execute/model-connector.js"` and calls it to send the integration test prompt to the AI model. No new AI model connector is created.
- **Tool:** Source code inspection
- **Evidence Requirements:**
  - `src/integrate/cli.ts` contains `import { executeWorkstream }` from `"../execute/model-connector.js"`
  - `executeWorkstream` is called with the built prompt

### VAL-CROSS-003: Schema version and forge version are set correctly
- **Title:** Artifact contains correct schemaVersion and forgeVersion
- **Behavioral Description:** `buildIntegrateArtifact` receives schemaVersion and forgeVersion as arguments and places them in the output artifact. The CLI passes `SCHEMA_VERSION = "1.0.0"` and `FORGE_VERSION` from the package.json or a default.
- **Tool:** Artifact inspection after full run
- **Evidence Requirements:**
  - `integrate.json.schemaVersion` is a non-empty string
  - `integrate.json.forgeVersion` is a non-empty string

---

## Validation Summary Matrix

| ID | Area | Title |
|----|------|-------|
| VAL-CLI-001 | CLI | help output |
| VAL-CLI-002 | CLI | missing execute artifact |
| VAL-CLI-003 | CLI | all workstreams failed |
| VAL-CLI-004 | CLI | valid execution produces integrate.json |
| VAL-CLI-005 | CLI | exit code reflects test results |
| VAL-TYPES-001 | Types | all types exported |
| VAL-TYPES-002 | Types | IntegrationTestState values |
| VAL-TYPES-003 | Types | IntegrationTestCase required fields |
| VAL-TYPES-004 | Types | IntegrationTestFile required fields |
| VAL-TYPES-005 | Types | IntegrateArtifact top-level fields |
| VAL-SCHEMA-001 | Schema | validates full artifact |
| VAL-SCHEMA-002 | Schema | parse valid artifacts |
| VAL-SCHEMA-003 | Schema | rejects missing required fields |
| VAL-SCHEMA-004 | Schema | rejects unknown keys (strict) |
| VAL-PROMPT-001 | Prompt | detectTestFramework from package.json |
| VAL-PROMPT-002 | Prompt | detectTestFramework fallback pytest |
| VAL-PROMPT-003 | Prompt | buildIntegrationTestPrompt content |
| VAL-PROMPT-004 | Prompt | deterministic prompt hash |
| VAL-RUNNER-001 | Runner | writes test files to disk |
| VAL-RUNNER-002 | Runner | parses test results |
| VAL-RUNNER-003 | Runner | error on no test files |
| VAL-RUNNER-004 | Runner | test count from content |
| VAL-ARTIFACT-001 | Artifact | produces valid artifact |
| VAL-ARTIFACT-002 | Artifact | writes .forge/integrate.json |
| VAL-REPORT-001 | Report | produces markdown report |
| VAL-REPORT-002 | Report | includes summary, results, recommendations |
| VAL-CROSS-001 | Cross | end-to-end flow |
| VAL-CROSS-002 | Cross | reuses model-connector |
| VAL-CROSS-003 | Cross | schema/forge version set |

---

## Notes

- This validation contract is derived from the OVERVIEW.md implementation specification for Step 6 Batch 1.
- The contract validates behavior, not implementation details.
- Each area can be tested independently as well as part of the full cross-area flow.
- Error codes that should be validated: `NO_EXECUTE_ARTIFACT`, `ALL_WORKSTREAMS_FAILED`, `AI_GENERATION_FAILED`, `NO_TEST_FILES_GENERATED`, `IO_ERROR`.
