# Batch 1.03 Complete: Input Modes and Mode Resolution

## Spec implemented
- `forge intake` now resolves `--spec` vs `--prompt` deterministically and still rejects missing-both and both-together input cases.
- Spec mode and prompt mode now converge into one normalized internal raw-input object before task parsing, target inference, and readiness evaluation.
- The persisted artifact now exposes the selected mode through `input_mode`.
- The persisted artifact now exposes a minimal `source_inputs` section with the selected mode, primary input reference, normalized task text, and empty `notes` / `constraints` arrays.
- Prompt mode now emits explicit ambiguity and follow-up guidance when the prompt is too short to be actionable under the Batch 1.03 heuristic.

## What changed
- Reworked the intake input resolver to build a shared normalized task-input object for both modes.
- Added prompt-to-synthetic-spec normalization so prompt mode goes through the same downstream parsing path as spec mode.
- Removed the old public `inputMode` artifact field and updated downstream output/tests to use `input_mode`.
- Updated report rendering to include a `Source Inputs` section aligned with the new artifact shape.
- Expanded automated coverage for spec mode, prompt mode, prompt-too-short ambiguity handling, and the real Commander parser path.

## Main code surfaces
- `src/intake/types.ts`
- `src/intake/input.ts`
- `src/intake/task-spec.ts`
- `src/intake/candidate-targets.ts`
- `src/intake/success.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `src/intake/runner.ts`
- `tests/intake.goal-and-success.test.ts`
- `tests/intake.input-modes.test.ts`
- `scripts/smoke.mjs`
- `package.json`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run smoke`

All verification passed on the integrated Batch 1.03 worktree state. The smoke run still reports `warning` by design because it uses prompt mode without explicit acceptance criteria while remaining ready for `forge plan`.

## Acceptance result
- Mode resolution is deterministic and enforced through explicit failure cases.
- Both spec mode and prompt mode produce the same downstream normalized input shape.
- The artifact is tagged with `input_mode` and includes the normalized `source_inputs` section.
- Prompt mode surfaces stronger ambiguity and follow-up signals when the prompt is too short to be actionable.
