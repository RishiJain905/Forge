# Step 6 Batch 3 Part 1 Done — Open Questions

## Implemented Spec
- `step6_batch3/tasks/task_1_open_questions.md`

## What Changed

### OQ1: `--force` Overwrite Behavior

**Decision: Overwrite only.** No code change needed — existing implementation already overwrites when `--force` is set. Added a test to confirm overwrite behavior.

### OQ2: Add `--delay` Flag

**Decision: Add `--delay <seconds>` flag.** Overrides exponential backoff in the retry loop with a fixed delay.

- Added `delay?: number` to `IntegrateCommandOptions` in `src/integrate/types.ts`
- Registered `--delay <seconds>` CLI flag in `src/cli.ts`
- Wired delay override in `src/integrate/cli.ts` retry loop: when `options.delay` is set, uses `options.delay * 1000` ms instead of exponential backoff

### OQ3: Add `--json-only` Flag

**Decision: Keep report always by default. Add `--json-only` to skip it.**

- Added `jsonOnly?: boolean` to `IntegrateCommandOptions` in `src/integrate/types.ts`
- Registered `--json-only` CLI flag in `src/cli.ts`
- Wired conditional report writing in `src/integrate/cli.ts`: both success and frozen paths skip `integration-report.md` when `jsonOnly` is true
- `reportPath` in result is `undefined` when `jsonOnly` is true

### OQ4: Persist `attemptCount` to Artifact

**Decision: Yes.** Already partially implemented in Batch 2 (schema and types). This task wires it through:

- Added `attemptCount?: number` to `BuildIntegrateArtifactParams` in `src/integrate/artifact.ts`
- `buildIntegrateArtifact` now accepts and passes `attemptCount` to the artifact
- `runIntegrateCommand` passes `freezeState.attemptCount || 1` on the success path
- Report now displays `**Attempts**: N` in the overview section of `src/integrate/report.ts`

### OQ5: CLI Flags for Freeze Criteria

**Decision: CLI flags only for V1.** Add `--max-retries` and `--max-duration`.

- Added `maxRetries?: number` and `maxDurationMs?: number` to `IntegrateCommandOptions` in `src/integrate/types.ts`
- Registered `--max-retries <n>` and `--max-duration <ms>` CLI flags in `src/cli.ts`
- Wired effective freeze criteria in `src/integrate/cli.ts`: `options.maxRetries ?? DEFAULT_FREEZE_CRITERIA.maxRetries` and `options.maxDurationMs ?? DEFAULT_FREEZE_CRITERIA.maxDurationMs`

## Flags Implemented

| Flag | Behavior |
|------|----------|
| `--force` | Overwrite existing `integrate.json` (no delete, just overwrite) |
| `--auto` | Non-interactive mode: fail on any warning or error |
| `--json-only` | Only write `integrate.json`, skip writing `integration-report.md` |
| `--delay <seconds>` | Override retry delay in seconds (replaces exponential backoff) |
| `--max-retries <n>` | Override maximum retry attempts before freezing |
| `--max-duration <ms>` | Override maximum duration in ms before freezing |

## Key Files

- `src/integrate/types.ts` — added `jsonOnly`, `delay`, `maxRetries`, `maxDurationMs` to `IntegrateCommandOptions`
- `src/integrate/cli.ts` — wired all new options (freeze criteria override, delay, jsonOnly, attemptCount)
- `src/integrate/artifact.ts` — added `attemptCount` to `BuildIntegrateArtifactParams`
- `src/integrate/report.ts` — added `**Attempts**` to overview
- `src/cli.ts` — registered `--json-only`, `--delay`, `--max-retries`, `--max-duration` flags
- `tests/integrate.cli.test.ts` — 7 new test scenarios

## Test Coverage

7 new test scenarios in `tests/integrate.cli.test.ts`:

1. `shouldFreeze uses custom maxRetries from override` — Verifies custom maxRetries override works
2. `shouldFreeze uses custom maxDurationMs from override` — Verifies custom maxDurationMs override works
3. `shouldFreeze with default FreezeCriteria values works as expected` — Smoke test with defaults
4. `FreezeState tracks attemptCount as 1-based counter` — Verifies 1-based tracking logic
5. `IntegrateCommandOptions accepts jsonOnly, delay, maxRetries, maxDurationMs fields` — Type acceptance test
6. `force overwrite behavior: existing integrate.json is overwritten when force=true` — OQ1 verification
7. `auto mode with --max-retries override: SOME_WORKSTREAMS_FAILED still fails` — Integration-level test

## Verification

- `npx tsc --noEmit` — PASS (0 errors)
- 192 tests pass across 6 integrate test suites