# Step 6 Batch 2 Part 1 Done — Flag Hardening

## Implemented Spec
- `step6_batch2/task_1_flag_hardening.md`

## What Changed
- Added `auto?: boolean` to `IntegrateCommandOptions` in `src/integrate/types.ts`
- Registered `--auto` flag on the `forge integrate` command in `src/cli.ts`
- Implemented `--force` guard in `src/integrate/cli.ts`: checks if `integrate.json` already exists; if it does and `--force` is not set, returns early with `INTEGRATE_ALREADY_EXISTS` failure
- Implemented `--auto` mode in `src/integrate/cli.ts`: when `--auto` is set, missing `plan.json` fails with `PLAN_REQUIRED`, missing `verify.json` fails with `VERIFY_REQUIRED`; sets `FORGE_NO_COLOR=true` for CI-safe output

## Flags Implemented

| Flag | Behavior |
|------|----------|
| `--force` | Re-run integration even if `integrate.json` already exists. Without `--force`, the command fails with `INTEGRATE_ALREADY_EXISTS`. |
| `--auto` | Non-interactive CI/CD mode. Missing `plan.json` → `PLAN_REQUIRED`. Missing `verify.json` → `VERIFY_REQUIRED`. Sets `FORGE_NO_COLOR=true`. All warnings become errors. |

## Error Codes Added

| Code | Condition |
|------|-----------|
| `INTEGRATE_ALREADY_EXISTS` | `integrate.json` exists and `--force` not set |
| `PLAN_REQUIRED` | `--auto` mode but `plan.json` not found |
| `VERIFY_REQUIRED` | `--auto` mode but `verify.json` not found |

## Key Files
- `src/integrate/types.ts` — added `auto?: boolean` to `IntegrateCommandOptions`
- `src/integrate/cli.ts` — added `--force` guard and `--auto` mode logic
- `src/cli.ts` — registered `--auto` flag on integrate command
- `tests/integrate.cli.test.ts` — 5 new test scenarios

## Test Coverage
- `tests/integrate.cli.test.ts` — 5 new scenarios:
  1. `forge integrate` without `--force` fails with `INTEGRATE_ALREADY_EXISTS` when `integrate.json` exists
  2. `forge integrate --force` proceeds when `integrate.json` already exists
  3. `forge integrate --auto` fails with `PLAN_REQUIRED` when `plan.json` is missing
  4. `forge integrate --auto` fails with `VERIFY_REQUIRED` when `verify.json` is missing
  5. `forge integrate --auto` proceeds past auto checks when all artifacts are present

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS (17/17 scenarios in integrate.cli.test.ts, 0 regressions)
- All 6 integrate test suites: PASS

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 2 Task 1 (Flag Hardening) is complete and verified.

## Follow-On
- Next Step 6 Batch 2 target: Task 2 (JSON Extraction)