# Batch 1.02 Complete: Command Goal and Success

## Spec implemented
- `forge intake` now requires exactly one primary task input via `--spec` or `--prompt`.
- Intake now produces a deterministic success model instead of treating all non-failure runs as generic success.
- Structured prompts with explicit acceptance criteria can now resolve to `success`; prompt inputs without them resolve to `warning`.
- The artifact now includes `taskSpec`, `repoContext`, `candidateTargets`, `ambiguities`, and `nextStepReadiness`.
- Readiness for `forge plan` is explicit through `nextStepReadiness.ready`, blocking issues, and recommended user actions.
- Status resolution is now deterministic:
  - `success` when the task is normalized, the repo is grounded, plausible targets exist, and no warnings remain.
  - `warning` when the run is still ready for planning but acceptance criteria, tests, or repo-target grounding are incomplete.
  - `failed` when primary input is invalid, grounding is unusable, candidate targets are missing, or persistence fails.

## What was added
- CLI support for `--spec` and `--prompt`.
- Task-source loading and validation.
- Task normalization for spec and prompt input.
- Bounded repo scanning for source, test, and manifest signals.
- Candidate target inference using explicit task-path matches first, then repo-structure fallback.
- Readiness evaluation with blocking issues, warnings, ambiguities, and recommended actions.
- Report rendering for the new readiness and grounding sections.
- New automated tests for the success/warning/failed model, including real Commander parser coverage for `--prompt`.

## Main code surfaces
- `src/cli.ts`
- `src/intake/input.ts`
- `src/intake/task-spec.ts`
- `src/intake/repo-context.ts`
- `src/intake/candidate-targets.ts`
- `src/intake/success.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `src/intake/runner.ts`
- `src/intake/types.ts`
- `tests/intake.boundary.test.ts`
- `tests/intake.goal-and-success.test.ts`
- `tests/support/forge-cli.ts`
- `scripts/smoke.mjs`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

All verification passed at implementation time. The smoke run reports `warning` by design because prompt mode does not include explicit acceptance criteria in that scenario, while still remaining ready for `forge plan`.

## Acceptance result
- Readiness is explicit and persisted in the artifact and report.
- Blocking issues are separate from warnings.
- Status selection is deterministic and reproducible from explicit signals.
- Missing tests and missing acceptance criteria are non-blocking warnings.
- Missing primary input and missing candidate targets are blocking failures.
