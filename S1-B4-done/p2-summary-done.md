# Batch 4 Part 2 Done Summary

## Implemented Spec
- `forge_step1_batch4/part-2-prompt-mode-parity-and-input-hardening.md`

## What Changed
- Hardened shared Step 1 input handling with direct resolver coverage for whitespace-only prompt input, mixed primary-input failures, and supplemental-input error accumulation so prompt/spec mode resolution stays predictable.
- Tightened prompt-mode normalization so vague prompts no longer promote a synthesized goal into `explicit_requirements`, which keeps prompt output more ambiguity-heavy and avoids inventing concrete scope.
- Expanded prompt-mode and spec-mode parity coverage for notes, constraints, focus, strict-focus, packaged CLI entrypoint runs, output artifacts, report rendering, freeze checks, and smoke verification.
- Added prompt-focused regression coverage for multiple-feature prompts, risky underdefined prompts, and prompt runs from non-repo or nested working directories while preserving the existing public artifact/report contract.

## Completion Checklist
- [x] Prompt mode still flows through the normal Step 1 pipeline and output contract
- [x] Shared input handling is deterministic for blank prompts, mixed inputs, and supplemental-input failures
- [x] Prompt mode is more conservative than spec mode when acceptance criteria are sparse
- [x] Prompt/spec parity is covered for notes, constraints, focus, strict-focus, CLI entrypoint, artifact/report output, freeze, and smoke paths
- [x] No new Step 1 schema surface was introduced
- [x] Full verification is green on `dev`

## Key Files
- `src/intake/task-parser.ts`
- `tests/intake.validation.test.ts`
- `tests/intake.task-parser.test.ts`
- `tests/intake.goal-and-success.test.ts`
- `tests/intake.output-artifacts.test.ts`
- `tests/intake.cli-entrypoint.test.ts`
- `tests/intake.batch4-freeze-criteria.test.ts`
- `scripts/smoke.mjs`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Batch 4 Part 2 is integrated onto `dev`
- Step 1 prompt/spec parity and input hardening are now materially closer to the Batch 4 freeze line while keeping the Step 1 contract stable

## Follow-On
- Next Batch 4 target: `forge_step1_batch4/part-3-edge-cases-warnings-failures-and-debug-outputs.md`
