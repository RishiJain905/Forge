# Step 3 Batch 1 Part 3 Done Summary

## Scope

Completed `forge_step3_batch1/part-3-verification-target-model-cases-and-lanes.md`.

This part now freezes the Step 3 verification target/case model in runnable code by:
- deriving explicit verification targets from persisted Step 2 signals
- deriving explicit lane-specific verification cases from those targets
- keeping structural and formal lanes separate while allowing one target to fan out into both lanes
- preserving Step 2 traceability through target risk sources, source plan item ids, and case-to-target links

## Key Changes

- Added `src/verify/model.ts` as the pure deterministic builder between verify foundation loading and artifact/report projection.
- Refined nested Step 3 verify types and schema so:
  - targets carry `sourceRiskSources` and `verificationCaseIds`
  - cases carry `verificationTargetId`
  - nested referential integrity is validated
- Reworked verify artifact/report assembly so ready runs persist populated `verification_targets` and `verification_cases`.
- Kept top-level `verify.json` keys, CLI flags, and verify-report heading order unchanged.
- Kept `structural_verification` and `formal_verification` execution status at `not_run` in Part 3, but replaced stale placeholder wording with selected-case summaries.
- Wired the new Part 3 suite into `npm.cmd test` and tightened `scripts/smoke.mjs` to assert real target/case output.

## Acceptance Evidence

- A grounded verify-ready handoff now produces explicit verification targets and cases instead of empty arrays.
- A dual-lane target can produce one structural case and one formal case with the same `verificationTargetId`.
- A structural-only target stays structural-only.
- Non-actionable verify input still blocks with `VERIFY_INPUT_TOO_WEAK` and empty target/case sections.
- Report output now renders non-empty Verification Targets / Verification Cases sections without changing heading order.

## Verification

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run smoke`
