# Batch 1.12 Done Summary

## Implemented Spec
- `forge_step1_batch1_impl/12-confidence-model-and-scoring.md`

## What Changed
- Added a dedicated rules-based confidence resolver and moved confidence scoring out of the inline analysis flow.
- Kept the public `confidence` artifact/report contract stable while making the level and component strengths reproducible from explicit signals.
- Added focused resolver tests plus end-to-end coverage for weak repo inspection when explicitly referenced test paths are missing.
- Kept `--fail-on-low-confidence` deferred; Batch 1.12 improves scoring only and does not change final status resolution.

## Key Files
- `src/intake/confidence.ts`
- `src/intake/analysis.ts`
- `tests/intake.confidence.test.ts`
- `tests/intake.core-responsibilities.test.ts`
- `tests/intake.artifact-sections.test.ts`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Follow-On
- Next Batch 1 target: `forge_step1_batch1_impl/13-failure-warning-and-status-resolution.md`
