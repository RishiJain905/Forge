# Batch 2 Part 1 Done Summary

## Implemented Spec
- `forge_step1_batch2/part-1-intake-architecture-and-module-map.md`

## What Changed
- Moved Step 1 input ownership toward one clearer path by adding `resolveLoadedIntakeInput`, splitting policy validation into `validateLoadedIntakeInput`, and moving task-spec normalization into `task-parser.ts` with `task-spec.ts` left as a compatibility wrapper.
- Expanded repo-context scanning with richer internal signals for languages, package manager, framework hints, test-framework hints, key directories, entry points, and layout summary.
- Moved focus-aware prioritization into `candidate-targets.ts`, added sibling test and manifest/config enrichment, and left `focus-policy.ts` as a thin compatibility re-export.
- Added `verification-targets.ts` as the dedicated home for initial verification target detection and moved risk-analysis construction into `analysis.ts`.
- Moved readiness, status, and summary helpers into `confidence.ts`, with `success.ts` reduced to a compatibility wrapper.
- Reduced `artifact-sections.ts` to a projection layer that consumes prebuilt risk analysis and verification targets instead of recomputing them.
- Added focused architecture tests for the new seams and wired the new repo-context, candidate-targets, and verification-target suites into `npm.cmd test`.

## Completion Checklist
- [x] One clearer input-loading and validation seam exists
- [x] Task-spec normalization is owned by `task-parser.ts`
- [x] Repo-context exposes richer internal scan signals
- [x] Candidate targeting owns focus behavior and richer target enrichment
- [x] Verification-target detection has a dedicated module
- [x] Risk analysis is owned by `analysis.ts`
- [x] Confidence/readiness/status helpers are exposed from `confidence.ts`
- [x] Artifact section projection no longer derives risk and verification data inline
- [x] Full verification gate is green in the implementation worktree

## Key Files
- `src/intake/input.ts`
- `src/intake/validation.ts`
- `src/intake/task-parser.ts`
- `src/intake/repo-context.ts`
- `src/intake/candidate-targets.ts`
- `src/intake/analysis.ts`
- `src/intake/confidence.ts`
- `src/intake/verification-targets.ts`
- `src/intake/artifact-sections.ts`
- `tests/intake.core-responsibilities.test.ts`
- `tests/intake.repo-context.test.ts`
- `tests/intake.candidate-targets.test.ts`
- `tests/intake.verification-targets.test.ts`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Implementation worktree branch: `codex/s1-b2-p1-intake-architecture`
- The implementation has been merged back into `dev` and the Batch 2 Part 1 task is closed under `execution.md`

## Follow-On
- Next Batch 2 target: `forge_step1_batch2/part-2-file-responsibilities-and-safe-refactor-rules.md`
