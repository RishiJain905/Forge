# Batch 1.04 Complete: Input Contract and Validation

## Spec implemented
- `forge intake` now validates the core and supplementary Step 1 inputs before parsing proceeds.
- Intake now accepts `--notes`, `--constraints`, `--config`, and repeatable `--focus` in addition to the existing primary input flags.
- Missing or unreadable supplementary inputs now produce explicit blocking validation issues and still persist a failed artifact/report when a repo root is available.
- Notes and constraints now populate `source_inputs` and are appended to the downstream normalized task text for parsing and target inference.
- The persisted artifact now exposes `source_inputs.config_path` and `source_inputs.focus_paths`.
- Config and focus inputs are validated and recorded now, with explicit warnings that config-driven behavior and focus-aware targeting are deferred to later batches.

## What changed
- Added a dedicated intake validation module to separate input contract checks from downstream parsing work.
- Refactored intake input normalization so spec/prompt mode consumes validated inputs instead of reading raw CLI options directly.
- Expanded the CLI and test harness parser for the new validation-critical flags.
- Updated artifact and report rendering to surface the new source-input metadata and validation-driven warnings.
- Added dedicated automated coverage for supplementary-input validation and real Commander parsing of the new flags.

## Main code surfaces
- `src/cli.ts`
- `src/intake/types.ts`
- `src/intake/validation.ts`
- `src/intake/input.ts`
- `src/intake/runner.ts`
- `src/intake/success.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `tests/intake.validation.test.ts`
- `tests/support/forge-cli.ts`
- `scripts/smoke.mjs`
- `package.json`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run smoke`

All verification passed on the integrated Batch 1.04 worktree state. The smoke run still reports `warning` by design because it uses prompt mode without explicit acceptance criteria while remaining ready for `forge plan`.

## Acceptance result
- Invalid supplementary inputs are blocked explicitly instead of being ignored.
- Failed validation still emits durable artifact/report output whenever a repo root is available.
- Notes and constraints now survive normalization into the artifact and downstream parser input.
- Config and focus inputs are visible in durable outputs without introducing hidden behavior.
