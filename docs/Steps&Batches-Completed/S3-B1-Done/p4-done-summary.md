# Step 3 Batch 1 Part 4 Done Summary

## Scope

Completed `forge_step3_batch1/part-4-formal-verification-scope-state-models-and-tla-entry.md`.

This part makes the Step 3 formal lane real in runnable code by:
- making formal-lane entry explicit per verification case
- generating deterministic state models for formal-risk categories
- generating persisted `.tla` / `.cfg` artifacts for each formal case
- running TLC through `FORGE_TLC_JAR_PATH` when configured
- attaching formal findings, traces, errors, and caution notes to both the case output and the top-level formal verification section

## Key Changes

- Added `src/verify/formal.ts` as the single Step 3 owner for formal entry criteria, state-model construction, TLA+ rendering, TLC execution, and formal result aggregation.
- Extended the Step 3 verify type/schema contract so:
  - formal cases carry `formalDetails`
  - state models point back to `verification_case_id` and `verification_target_id`
  - generated specs point back to `verification_case_id` and `state_model_id`
  - TLC results point back to `verification_case_id` and `tla_spec_id`
  - `formal_verification` carries top-level `caution_notes`
- Reworked verify artifact assembly and report rendering so ready runs now persist and display formal state models, generated spec/config paths, TLC results, traces, errors, and caution notes without changing the frozen top-level `verify.json` keys or report heading order.
- Kept formal verification selective by limiting the real formal lane to risky coordination categories and leaving structural-only cases with `formalDetails: null`.
- Wired the new Part 4 runtime suite into `npm.cmd test` and tightened `scripts/smoke.mjs` so the runnable smoke path proves generated formal artifacts and honest `not_run` behavior when TLC is not configured.

## Acceptance Evidence

- Formal-lane entry is explicit through per-case `entryCriteria`, `stateModelId`, `tlaSpecId`, and `tlcResultId`.
- Each formal verification case produces a deterministic state model plus one persisted `.tla` / `.cfg` pair under the verify output root.
- TLC results now distinguish `not_run`, `passed`, `failed`, `errored`, and `invalid_spec`, and failure/trace/error details are persisted in both artifact and report output.
- Warning-heavy Step 2 handoffs still carry caution forward even when TLC passes, so the report does not overclaim proof strength.
- Structural-only cases remain outside the formal lane and keep `formalDetails: null`.

## Verification

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run smoke`
