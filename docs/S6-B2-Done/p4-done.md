# Step 6 Batch 2 Part 4 Done — Missing Artifact Handling

## Implemented Spec
- `step6_batch2/task_4_missing_artifact_handling.md`

## What Changed
- Modified `src/integrate/cli.ts` — upgraded `createPlanStub()` to accept `executeArtifact` parameter, deriving goal from workstream title; refactored artifact loading to call loaders only once with explicit null-check fallback; added `console.warn` for missing artifacts in non-auto mode; added Zod validation via `validatePlanArtifact`/`validateVerifyArtifact` in loaders; split loader catch blocks to differentiate "file not found" from "file invalid" warnings.
- Modified `tests/integrate.cli.test.ts` — added 3 new test scenarios for missing artifact handling; fixed `makePlanArtifact()` and `makeVerifyArtifact()` fixtures to pass Zod validation.

## Missing Artifact Handling — Key Behaviors

| Scenario | Behavior |
|----------|----------|
| Missing plan.json without `--auto` | Creates stub derived from execute artifact, logs warning, proceeds |
| Missing plan.json with `--auto` | Fails immediately with `PLAN_REQUIRED` |
| Missing verify.json without `--auto` | Creates empty stub, logs warning, proceeds |
| Missing verify.json with `--auto` | Fails immediately with `VERIFY_REQUIRED` |
| Both missing without `--auto` | Creates both stubs, logs warnings, proceeds |
| Both missing with `--auto` | Fails on first missing (plan) with `PLAN_REQUIRED` |
| Invalid plan.json (fails Zod) | Logs "invalid" warning, treats as missing, falls back to stub |
| Invalid verify.json (fails Zod) | Logs "invalid" warning, treats as missing, falls back to stub |

## createPlanStub(executeArtifact) Improvements

- **Goal derivation**: `executeArtifact.workstreams[0]?.title ?? "Unknown task"` — derives a meaningful goal from the execute artifact's workstream data instead of an empty string
- **Summary**: Set to `"Plan stub derived from execute artifact — plan.json was missing"` for traceability
- **carry_forward.task_spec.goal**: Populated with the derived goal value

## Zod Validation in Loaders

- `loadPlanArtifact` now calls `validatePlanArtifact(JSON.parse(content))` instead of `JSON.parse(content) as PlanArtifact`
- `loadVerifyArtifact` now calls `validateVerifyArtifact(JSON.parse(content))` instead of `JSON.parse(content) as VerifyArtifact`
- Both loaders use inner/outer try-catch: outer catches file-not-found (ENOENT), inner catches validation errors (ZodError)
- Invalid files get a more specific warning message including the validation error details

## Key Files
- `src/integrate/cli.ts` (modified — createPlanStub signature, loader validation, null-check refactoring, warning messages)
- `src/integrate/errors.ts` (unchanged — used by Task 3)
- `src/integrate/types.ts` (unchanged — ErrorClassification, RetryConfig types from Task 3)
- `tests/integrate.cli.test.ts` (modified — 3 new test scenarios, fixture updates for Zod compliance)

## Test Coverage
- `tests/integrate.cli.test.ts` — 21 scenarios total (3 new for Task 4):
  - Missing plan.json without --auto creates stub with execute-derived goal and proceeds
  - Both plan.json and verify.json missing without --auto creates both stubs and proceeds
  - Both missing with --auto fails on first missing (plan) with PLAN_REQUIRED
  - Plus 6 existing scenarios from Tasks 1-3: --force guard, --auto with PLAN_REQUIRED, --auto with VERIFY_REQUIRED, --auto passes with all artifacts, AI error classification, parse/JSON extraction

## Commits
- `0104005` — feat(step6-batch2): implement missing artifact handling (task 4)
- `a24f1c7` — feat(step6-batch2): add Zod validation to artifact loaders (task 4 spec compliance)
- `cc5dd3f` — test(step6-batch2): fix test fixtures for Zod validation and improve loader error messages (task 4)

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `node dist-tests/tests/integrate.cli.test.js` — 21/21 PASS
- `node dist-tests/tests/integrate.errors.test.js` — 21/21 PASS
- `node dist-tests/tests/integrate.extract-json.test.js` — 15/15 PASS

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 2 Task 4 (Missing Artifact Handling) is complete and verified.

## Follow-On
- Next Step 6 Batch 2 target: Task 5 (Freeze Criteria)