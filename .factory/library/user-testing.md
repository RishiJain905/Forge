# User Testing

## Validation Surface

`forge integrate` is a CLI command. Validation is done through:
- CLI invocation (`forge integrate`, `forge integrate --help`)
- Exit code inspection
- File system inspection (checking for integrate.json and integration-report.md)
- Schema validation of generated artifacts

## No Browser/UI Testing

This step has no web UI or browser-accessible surfaces. All validation is done via:
- CLI commands
- TypeScript compilation checks
- Unit test execution
- File system checks

## Resource Cost Classification

`forge integrate` is lightweight — it:
- Reads JSON artifacts from disk
- Calls an AI model (user-provided API key)
- Writes test files and executes them via npm test or pytest
- Writes output artifacts

No dedicated services need to run. Resource usage is dominated by:
- The AI model call (network I/O)
- Test execution (CPU/disk I/O depending on project)

## How to Validate

1. **Type check:** `npm run typecheck`
2. **Build:** `npm run build`
3. **Unit tests:** `npm run test`
4. **Smoke test:** `npm run smoke`
5. **CLI help:** `forge integrate --help`
6. **CLI error case:** `forge integrate` without execute.json → should fail with NO_EXECUTE_ARTIFACT
7. **Full flow:** With valid execute.json, `forge integrate` produces integrate.json and integration-report.md

## Validation Concurrency

Max concurrent validators: 3

This is a pure TypeScript library module with no services, no browser UI, and no shared mutable state. Validators operate on the same codebase but read-only. Types and schemas can be validated concurrently without interference.

## Flow Validator Guidance: types-and-schemas

**Surface:** TypeScript type definitions and Zod schemas in `src/integrate/types.ts` and `src/integrate/schema.ts`

**Isolation rules:**
- All validators share the same codebase and run read-only operations
- No shared mutable state between validators
- Validators may run concurrently
- Each validator should run `npm run typecheck` and/or `node dist-tests/tests/integrate.types-schema.test.js` independently

**Constraints:**
- Do NOT modify any source files
- Do NOT start or stop any services (none needed)
- All assertions are code-level validations via type checking and unit tests

**Commands to run:**
- Type checking: `npm run typecheck` (in project root)
- Build: `npm run build` (in project root)
- Schema tests: `node dist-tests/tests/integrate.types-schema.test.js` (after build + test compile)

## Flow Validator Guidance: prompt-and-test-runner

**Surface:** Prompt builder and test runner modules in `src/integrate/prompt-builder.ts` and `src/integrate/test-runner.ts`

**Isolation rules:**
- All validators share the same codebase and run read-only operations
- No shared mutable state between validators
- Validators may run concurrently
- Each validator should run `node dist-tests/tests/integrate.prompt-builder.test.js` and/or `node dist-tests/tests/integrate.test-runner.test.js` independently
- Do NOT modify any source files
- Do NOT start or stop any services (none needed)

**Constraints:**
- Test files use temp directories (via `os.tmpdir()`) that are cleaned up after each test
- Prompt builder tests create mock package.json and config files in temp dirs
- Test runner tests create mock test files in temp dirs and use `echo` as test command
- All assertions are code-level validations via unit test execution

**Commands to run:**
- Build: `npm run build` then `tsc -p tsconfig.test.json` (to compile test files)
- Prompt builder tests: `node dist-tests/tests/integrate.prompt-builder.test.js`
- Test runner tests: `node dist-tests/tests/integrate.test-runner.test.js`
- Type checking: `npm run typecheck`

**Key validation points:**
- detectTestFramework: jest, vitest, mocha from package.json; pytest from pytest.ini/pyproject.toml; npm fallback
- buildIntegrationTestPrompt: prompt includes goal, workstreams, changed files, framework info; deterministic hash
- deriveFrameworkFromOverride: correct language/testCommand derivation from framework name
- runIntegrationTests: file writing with recursive directory creation, test output parsing, empty testFiles error
- estimateTestCount: pytest/jest pattern matching, fallback for non-empty content
- parseTestOutput: jest format, pytest format, generic format, fallback to zeros

## Flow Validator Guidance: cli-wiring

**Surface:** CLI command (`forge integrate`), artifact builder (`src/integrate/artifact.ts`), report generator (`src/integrate/report.ts`), and their integration with model-connector

**Isolation rules:**
- All validators share the same codebase and run read-only operations
- No shared mutable state between validators
- Validators may run concurrently
- CLI error-case tests create temp directories (via `os.tmpdir()`) that are cleaned up after each test
- Do NOT modify any source files
- Do NOT start or stop any services (none needed)

**Constraints:**
- CLI error cases (NO_EXECUTE_ARTIFACT, NO_WORKSTREAMS, ALL_WORKSTREAMS_FAILED) can be tested by invoking `runIntegrateCommand` from the test file or running the CLI in temp directories without forge artifacts
- The full happy path (VAL-CLI-004, VAL-CROSS-001) requires an AI model connection — without it, the command fails at AI_GENERATION_FAILED. For validation purposes, the code path can be verified by tracing: the CLI writes `integrate.json` and `integration-report.md` after successful AI call (lines 244-252 of cli.ts)
- VAL-CROSS-002 can be verified by inspecting the import statements in `src/integrate/cli.ts` — it should import `loadModelConfig` and `callModel` from `../execute/model-connector.js`, NOT `executeWorkstream`
- VAL-CROSS-003 can be verified by confirming the CLI correctly uses `loadModelConfig` + `callModel` to get a raw AI response, then parses it with `parseTestFilesFromAIResponse`

**Commands to run:**
- Artifact tests: `node dist-tests/tests/integrate.artifact.test.js`
- Report tests: `node dist-tests/tests/integrate.report.test.js`
- CLI tests: `node dist-tests/tests/integrate.cli.test.js`
- Integration types/schema tests: `node dist-tests/tests/integrate.types-schema.test.js`
- Prompt builder tests: `node dist-tests/tests/integrate.prompt-builder.test.js`
- Test runner tests: `node dist-tests/tests/integrate.test-runner.test.js`

**Assertions to validate:**
- VAL-ARTIFACT-001: buildIntegrateArtifact produces object passing validateIntegrateArtifact
- VAL-ARTIFACT-002: writeIntegrateArtifact creates 2-space indented JSON with recursive directory creation
- VAL-REPORT-001: Report includes 'Forge Integration Report' heading
- VAL-REPORT-002: Report includes all required sections and status icons
- VAL-CLI-001: forge integrate without execute.json fails with NO_EXECUTE_ARTIFACT
- VAL-CLI-002: forge integrate with empty workstreams fails with NO_WORKSTREAMS
- VAL-CLI-003: forge integrate with all failed workstreams fails with ALL_WORKSTREAMS_FAILED
- VAL-CLI-004: forge integrate with valid inputs produces .forge/integrate.json
- VAL-CLI-005: Exit code is 0 when summary.failed === 0, 1 when summary.failed > 0
- VAL-CROSS-001: forge integrate produces integration-report.md alongside artifact
- VAL-CROSS-002: CLI uses loadModelConfig + callModel (not executeWorkstream)
- VAL-CROSS-003: CLI correctly integrates with model-connector for AI calls
