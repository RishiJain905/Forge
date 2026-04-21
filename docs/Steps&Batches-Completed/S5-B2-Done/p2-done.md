# S5-B2 Phase 2 — Error Handling Polish — COMPLETE

## What was done

Implemented error handling polish for the `forge execute` command:

### Changes

#### `src/execute/cli.ts`
- **Exit code determination** (before write phase): scans all workstream states
  - `exitCode = 0` if all workstreams are `completed`
  - `exitCode = 1` if any workstream is `failed`
  - `exitCode = 2` if any workstream is `queued` (and none failed)
- **Write failure handling**: wrapped `writeExecuteArtifact` + `fs.writeFile` for the report in `try/catch`
  - On failure: `console.error("Failed to write execute artifact:", err)` + `process.exit(1)`
- `exitCode` field added to the return object

#### `src/execute/types.ts`
- `exitCode?: number` added to `ExecuteCommandResult` interface

#### `src/cli.ts`
- `result.reportPath ? Report: ${result.reportPath}` added to `formatExecuteCommandOutput`
- Execute action now maps `result.exitCode` to the CLI's `exitCode` variable (exit code 0, 1, or 2 propagated)

### Tests

`tests/execute.error-handling.test.ts` (316 lines) — scenarios covering:
1. Missing `split.json` → exit code 1, error about missing file
2. Corrupt `split.json` (bad JSON) → exit code 1, error about invalid JSON
3. Write failure for `execute.json` → exit code 1
4. All workstreams complete → exit code 0
5. Some workstreams failed → exit code 1
6. Some workstreams remain queued (blocked) → exit code 2
7. Invalid state transition (`done` on queued ws) → shows error but doesn't crash

Note: Fixtures used to exercise execute exit-code semantics were brought up to the strict `v2.0.0` split artifact schema (`FORGE_SCHEMA_VERSION = "2.0.0"`), including the required top-level fields, cross-referenced plan/verify artifacts, and valid workstream structure, so those tests reach the execute REPL/write paths instead of failing immediately in `validateSplitArtifact()`. Only the scenarios that intentionally verify validation failures use malformed or missing inputs.

### Key implementation notes

- `os.tmpdir` in Node.js is a **function** — must call `os.tmpdir()`, not use it as a property
- The CLI binary lives at `dist/src/index.js` (not `dist/cli.js`)
- Build output is `dist/src/` because `tsconfig.json` has `rootDir: "."`
- The `try/catch` for writes is placed **after** the exit code determination, so exit codes 0/1/2 are computed before any writes attempt
- Write failures always exit with code 1 (can't distinguish 1 vs 2 when disk is full)

## Files changed

- `src/execute/cli.ts` — exit code logic + try/catch writes
- `src/execute/types.ts` — `exitCode?: number`
- `src/cli.ts` — `reportPath` in output + exit code mapping
- `tests/execute.error-handling.test.ts` — 17 test scenarios

## Verification

- `npm run build` passes ✓
- Full test suite: all existing tests pass, no regressions ✓
- Branch merged into `dev` and pushed ✓
