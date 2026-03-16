# Progress

## Completed
- Batch 1.01: `01-purpose-and-boundary.md`
  - Implemented the initial Forge CLI scaffold and the `forge intake` Step 1 command.
  - Enforced the Step 1 boundary so writes stay inside `.forge/` or a repo-internal configured equivalent.
  - Added artifact/report persistence with failed-run fallback behavior.
  - Added boundary-focused automated tests and smoke verification.
- Batch 1.02: `02-command-goal-and-success.md`
  - Added primary task input support with `--spec` and `--prompt`.
  - Normalized task goals and acceptance-criteria signals into the intake artifact.
  - Added repo grounding, candidate-target inference, and deterministic success/warning/failed readiness evaluation.
  - Persisted `taskSpec`, `repoContext`, `candidateTargets`, `ambiguities`, and `nextStepReadiness`.
  - Expanded tests to cover success, warning, failed, and real Commander CLI parsing paths.
- Batch 1.03: `03-input-modes-and-mode-resolution.md`
  - Made mode resolution for `--spec` and `--prompt` explicit and deterministic.
  - Normalized both entry modes into one shared raw-input object before downstream parsing.
  - Added public artifact/report metadata for `input_mode` and `source_inputs`.
  - Added prompt-mode ambiguity guidance for prompts that are too short to be actionable.
  - Expanded automated coverage and smoke assertions for the new input-mode behavior.
- Batch 1.04: `04-input-contract-and-validation.md`
  - Added validation-critical CLI support for `--notes`, `--constraints`, `--config`, and repeatable `--focus`.
  - Introduced early input validation with blocking issues, warnings, and useful failed artifact/report persistence when a repo root is available.
  - Normalized notes and constraints into `source_inputs` and appended them to downstream parser input.
  - Surfaced `config_path` and `focus_paths` metadata in the artifact/report while explicitly warning that their behavioral use is deferred.
  - Added dedicated validation-focused automated coverage plus smoke updates for the new stable source-input metadata.

## Current Branch State
- `dev` includes the completed Batch 1.04 implementation.
- `execution.md` now explicitly requires completed worktree branches to be merged back into their source branch before a task is considered complete, unless the user explicitly requests a PR-only workflow.

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Next
- Continue Batch 1 with `forge_step1_batch1_impl/05-cli-surface-and-flag-behavior.md`.
