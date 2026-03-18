# Batch 1.10 Complete: Detailed Artifact Sections

## Spec implemented
- Step 1 intake now persists the public artifact’s detailed inner sections through an explicit mapping layer instead of leaking internal camelCase pipeline shapes directly into `.forge/intake.json`.
- The public artifact section names are now normalized to `snake_case` for the documented Step 1 sections: `task_spec`, `repo_context`, `candidate_targets`, `initial_verification_targets`, and `next_step_readiness`.
- Added the missing public `risk_analysis` and `confidence` sections so the intake artifact now exposes deterministic initial risk zones and confidence signals directly.
- Every documented section is now always present, with explicit empty arrays or objects instead of omission-based behavior.
- The markdown report and smoke verification were updated so the human-readable output stays aligned with the new artifact contract.

## What changed
- Added `src/intake/artifact-sections.ts` to map internal parser, repo-scan, inference, and analysis outputs into stable public artifact sections.
- Updated `src/intake/types.ts` with dedicated public artifact-section interfaces for the normalized `snake_case` contract.
- Updated `src/intake/artifact.ts` so artifact assembly now builds the public sections through the new mapping layer.
- Extended `src/intake/artifact-schema.ts` to validate the renamed section keys plus the new `risk_analysis` and `confidence` sections.
- Updated `src/intake/report.ts` so the markdown report reads the normalized section keys and renders the new risk-analysis and confidence sections.
- Added `tests/intake.artifact-sections.test.ts` and updated existing intake artifact consumers, schema tests, and the smoke script for the new public section contract.

## Main code surfaces
- `src/intake/artifact-sections.ts`
- `src/intake/types.ts`
- `src/intake/artifact.ts`
- `src/intake/artifact-schema.ts`
- `src/intake/report.ts`
- `tests/intake.artifact-sections.test.ts`
- `tests/intake.artifact-schema.test.ts`
- `scripts/smoke.mjs`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Acceptance result
- Each documented detailed section is now present and typed.
- Public artifact field naming is normalized for the documented Step 1 sections instead of mixing public camelCase and snake_case.
- `risk_analysis.initial_risk_zones` is deterministic and structured.
- `confidence` is now exposed as a stable public section built from the current deterministic intake confidence model.
