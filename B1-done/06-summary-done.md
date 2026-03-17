# Batch 1.06 Complete: Core Responsibilities

## Spec implemented
- Step 1 intake now has explicit internal outputs for task parsing, repo inspection, engineering-only inference, and ambiguity/confidence analysis.
- Intake now combines those four responsibility outputs through one shared assembled-result path before artifact persistence.
- Candidate-target generation now lives under the explicit inference responsibility instead of being an isolated helper step.
- Ambiguity and preliminary confidence generation are now explicit internal responsibilities rather than incidental byproducts of readiness evaluation.
- The public artifact and report stay stable in Batch 1.06 while the internal responsibility pipeline becomes much clearer and easier to extend in later batches.

## What changed
- Added dedicated intake modules for task parsing, inference, ambiguity/confidence analysis, and assembly.
- Extended the existing repo scan to return structured repo-scan signals alongside the public repo context.
- Refactored the intake runner to orchestrate the new responsibility pipeline before final status evaluation and persistence.
- Added a dedicated responsibility-focused automated test file covering parser, repo scan, inference, analysis, and final assembly behavior.
- Preserved the existing CLI/output behavior from Batch 1.05 while strengthening internal separation of concerns.

## Main code surfaces
- `src/intake/types.ts`
- `src/intake/task-parser.ts`
- `src/intake/repo-context.ts`
- `src/intake/inference.ts`
- `src/intake/analysis.ts`
- `src/intake/assemble.ts`
- `src/intake/runner.ts`
- `tests/intake.core-responsibilities.test.ts`
- `package.json`
- `progress.md`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Acceptance result
- All four Step 1 core responsibility outputs now exist in the final assembly path.
- No responsibility is silently skipped; missing or weak evidence becomes warnings, ambiguities, or low-confidence reasons.
- Inference stays bounded to engineering necessities and does not invent new product scope.
- Existing intake CLI behavior remains intact while the internal pipeline is now ready for the later artifact-section and confidence batches.
