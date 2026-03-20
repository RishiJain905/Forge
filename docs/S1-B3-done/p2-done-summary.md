# Batch 3 Part 2 Done Summary

## Implemented Spec
- `forge_step1_batch3/part-2-stage-1-and-2-core-types-and-input-foundation.md`

## What Changed
- Canonicalized the Step 1 intake type layer so `src/intake/types.ts` now clearly separates pipeline/domain types from public artifact projection types instead of reusing artifact-shaped aliases for internal data.
- Promoted `RiskAnalysis` to a camelCase domain shape and kept `ArtifactRiskAnalysisSection` projection-only, so artifact/report builders now translate the internal risk model instead of defining it.
- Promoted `ConfidenceSummary` to an explicit domain contract and kept the public snake_case `confidence` section as a projection of that internal model.
- Reshaped `ResolvedIntakeInput` into one runner-facing bundle with input mode, source selection, loaded primary input, supplemental input metadata, normalized task input, and validation output in one place.
- Kept `input.ts` responsible for loading and normalization while keeping `validation.ts` policy-only, which removes the old split-brain between nullable task input and separate side arrays.
- Updated `runner.ts` to consume the canonical resolved input bundle directly and kept the Batch 1 CLI, artifact, report, and persistence contracts stable.
- Expanded the direct architecture and acceptance-gate tests so the canonical type/input foundation is now protected by compile-time and runtime coverage.

## Completion Checklist
- [x] Stage 1 core Step 1 contracts are stabilized behind one obvious type hub
- [x] Domain types no longer depend on artifact snake_case shapes for internal ownership
- [x] Stage 2 input resolution returns one deterministic runner-facing bundle
- [x] Spec-mode input loading, supplemental input normalization, and validation failure reporting remain stable
- [x] Artifact/report output stays Batch 1 compatible after the type/input refactor
- [x] Batch 2 acceptance gates remain green after the Stage 1/2 foundation change
- [x] Full verification gate is green in the implementation worktree

## Key Files
- `src/intake/types.ts`
- `src/intake/input.ts`
- `src/intake/validation.ts`
- `src/intake/runner.ts`
- `src/intake/analysis.ts`
- `src/intake/artifact-sections.ts`
- `src/intake/confidence.ts`
- `tests/intake.core-responsibilities.test.ts`
- `tests/intake.validation.test.ts`
- `tests/intake.analysis.test.ts`
- `tests/intake.task-parser.test.ts`
- `tests/intake.batch2-acceptance-gates.test.ts`
- `tests/intake.artifact-sections.test.ts`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Implementation worktree branch: `codex/s1-b3-p2-core-types-input-foundation`
- The implementation has been merged back into `dev` under `execution.md`

## Follow-On
- Next Batch 3 target: `forge_step1_batch3/part-3-stage-3-and-4-task-normalization-and-repo-context.md`
