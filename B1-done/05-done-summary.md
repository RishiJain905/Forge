# Batch 1.05 Complete: CLI Surface and Flag Behavior

## Spec implemented
- `forge intake` now exposes the full Batch 1.05 CLI surface, including `--json-only`, `--report-only`, `--llm-assist`, `--no-llm`, and `--fail-on-low-confidence`.
- Intake now resolves output mode and LLM mode deterministically before downstream processing begins.
- Default Step 1 output behavior now writes both the JSON artifact and markdown report, while `--json-only` and `--report-only` suppress the opposite file explicitly.
- Conflicting selector pairs now fail with blocking issues and still persist useful failure output when a repo root is available.
- The artifact and report now expose a `runtime_options` section so the effective Step 1 CLI behavior is durable and inspectable.
- `--llm-assist` and `--fail-on-low-confidence` are recorded now with explicit deferred-behavior warnings instead of hidden no-op behavior.

## What changed
- Added a dedicated runtime option resolver to keep flag policy out of the Commander wiring.
- Updated the runner to honor resolved output modes when persisting files and when returning the final CLI summary paths.
- Updated the CLI summary formatter and test helper so suppressed outputs no longer appear in stdout/stderr summaries.
- Expanded the report contract with a `Runtime Options` section aligned with the new artifact data.
- Added dedicated end-to-end CLI flag coverage plus smoke assertions for the Batch 1.05 contract.

## Main code surfaces
- `src/cli.ts`
- `src/intake/types.ts`
- `src/intake/options.ts`
- `src/intake/runner.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `tests/intake.cli-flags.test.ts`
- `tests/support/forge-cli.ts`
- `scripts/smoke.mjs`
- `README.md`
- `progress.md`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run smoke`

## Acceptance result
- Intake flag resolution is now deterministic and script-friendly.
- Output suppression works without hidden defaults in the terminal summary.
- Conflicting selector flags are rejected by explicit policy instead of being silently ignored.
- Deferred flags are visible in durable outputs, so later batches can build on a stable CLI contract.
