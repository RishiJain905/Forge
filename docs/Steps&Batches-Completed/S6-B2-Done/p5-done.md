# Step 6 Batch 2 Part 5 Done — Freeze Criteria

## Implemented Spec
- `step6_batch2/task_5_freeze_criteria.md`

## What Changed
- Modified `src/integrate/types.ts` — added `FreezeCriteria` interface, `DEFAULT_FREEZE_CRITERIA` constant, `FreezeState` interface (without dead-code `frozen` field); added `attemptCount`, `frozenAt`, `finalError` optional fields to `IntegrateArtifact`
- Modified `src/integrate/schema.ts` — extended `IntegrateArtifactSchema` with `attemptCount` (optional number), `frozenAt` (optional string), `finalError` (optional string)
- Modified `src/integrate/artifact.ts` — added `buildFrozenArtifact()` function; added `SCHEMA_VERSION` and `FORGE_VERSION` constants; consolidated `extractGoal()` with optional fallback parameter (removed duplicate `extractGoalFromPlan`)
- Modified `src/integrate/report.ts` — added `createFrozenReport()` function producing `[FROZEN]` markdown report with reason, suggestion, workstreams table, and next steps
- Modified `src/integrate/cli.ts` — added exported `shouldFreeze()` function with `elapsedMs` parameter for complete freeze decision logic; integrated freeze detection into retry loop (sets `FreezeState`, checks `shouldFreeze` + duration before retry/non-retryable decisions, produces frozen artifact and report on freeze, returns `INTEGRATION_FROZEN` failure)
- Modified `tests/integrate.cli.test.ts` — added 7 `shouldFreeze()` unit test scenarios
- Modified `tests/integrate.artifact.test.ts` — added 3 `buildFrozenArtifact()` test scenarios
- Modified `tests/integrate.report.test.ts` — added 3 `createFrozenReport()` test scenarios

## Freeze Criteria — Key Behaviors

| Condition | Behavior |
|-----------|----------|
| `attemptCount > maxRetries` | Freeze |
| Elapsed time > `maxDurationMs` (5 min default) | Freeze |
| `auth_failure` + `freezeOn.authFailure=true` | Freeze immediately |
| `parse_error` + `freezeOn.parseFailure=true` | Freeze immediately |
| `rate_limit` + `freezeOn.rateLimitHit=true` | Freeze immediately |
| `rate_limit` + `freezeOn.rateLimitHit=false` (default) | Do NOT freeze — wait out rate limits |

When frozen, the CLI:
1. Sets `freezeState.frozenAt` and `freezeState.finalError`
2. Calls `buildFrozenArtifact()` with empty tests/testFiles and zero summary
3. Writes `integrate.json` and `integration-report.md` to `.forge/`
4. Returns `{ status: "failed", code: "INTEGRATION_FROZEN" }`

## shouldFreeze() Function

```typescript
function shouldFreeze(
  criteria: FreezeCriteria,
  state: FreezeState,
  lastError: ErrorClassification | null,
  elapsedMs: number
): boolean
```

Checks all freeze conditions in one place: attempt count, duration, and error-type-based freeze flags.

## Quality Fixes Applied

- **`aiModelUsed`** in frozen artifact set to `"unknown"` (not error type) since no model response was obtained
- **DRY fix**: Consolidated duplicate `extractGoal`/`extractGoalFromPlan` into single `extractGoal(plan, fallback)` function
- **`shouldFreeze` encapsulation**: Moved duration check inside `shouldFreeze()` via `elapsedMs` parameter instead of inline in CLI
- **Removed `FreezeState.frozen`**: Write-only field that was never read — removed from interface and test fixtures

## Key Files
- `src/integrate/types.ts` (modified — FreezeCriteria, DEFAULT_FREEZE_CRITERIA, FreezeState, IntegrateArtifact extension)
- `src/integrate/schema.ts` (modified — IntegrateArtifactSchema extension)
- `src/integrate/artifact.ts` (modified — buildFrozenArtifact, SCHEMA_VERSION, FORGE_VERSION, extractGoal consolidation)
- `src/integrate/report.ts` (modified — createFrozenReport)
- `src/integrate/cli.ts` (modified — shouldFreeze, freeze logic in retry loop)
- `tests/integrate.cli.test.ts` (modified — 7 new shouldFreeze scenarios)
- `tests/integrate.artifact.test.ts` (modified — 3 new buildFrozenArtifact scenarios)
- `tests/integrate.report.test.ts` (modified — 3 new createFrozenReport scenarios)

## Test Coverage
- `tests/integrate.cli.test.ts` — 32 scenarios total (7 new for Task 5):
  - shouldFreeze returns true when attemptCount exceeds maxRetries
  - shouldFreeze returns true for auth_failure when freezeOn.authFailure is true
  - shouldFreeze returns false for auth_failure when freezeOn.authFailure is false
  - shouldFreeze returns true for parse_error when freezeOn.parseFailure is true
  - shouldFreeze returns false for rate_limit when freezeOn.rateLimitHit is false
  - shouldFreeze returns true for rate_limit when freezeOn.rateLimitHit is true
  - shouldFreeze returns false when criteria not met and no error
- `tests/integrate.artifact.test.ts` — 21 scenarios total (2 new for Task 5):
  - buildFrozenArtifact creates artifact with frozenAt, finalError, and attemptCount set
  - buildFrozenArtifact derives goal from plan artifact when provided
  - buildFrozenArtifact uses '? Unknown' goal when planArtifact is null
- `tests/integrate.report.test.ts` — 26 scenarios total (2 new for Task 5):
  - createFrozenReport contains [FROZEN] badge in title
  - createFrozenReport includes error type and suggestion
  - createFrozenReport includes workstreams table

## Commits
- `b2746f3` — feat(step6-batch2): implement freeze criteria (task 5)

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `node dist-tests/tests/integrate.cli.test.js` — 32/32 PASS
- `node dist-tests/tests/integrate.artifact.test.js` — 21/21 PASS
- `node dist-tests/tests/integrate.report.test.js` — 26/26 PASS
- `node dist-tests/tests/integrate.errors.test.js` — 21/21 PASS
- `node dist-tests/tests/integrate.extract-json.test.js` — 15/15 PASS
- `node dist-tests/tests/integrate.test-runner.test.js` — 36/36 PASS
- `node dist-tests/tests/integrate.prompt-builder.test.js` — 48/48 PASS
- `node dist-tests/tests/integrate.types-schema.test.js` — 56/56 PASS

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 2 Task 5 (Freeze Criteria) is complete and verified.

## Follow-On
- Next Step 6 Batch 2 target: Task 6 (Partial execute.json)