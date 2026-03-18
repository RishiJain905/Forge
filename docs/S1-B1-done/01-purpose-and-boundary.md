# Batch 1.01 Complete: Purpose and Boundary

## Spec implemented
- `forge intake` now exists as the Step 1 command entrypoint.
- Step 1 is enforced as a foundation stage only: no planning, split, verify-execution, or source-edit behavior was added.
- Intake writes only under `.forge/` by default, or a repo-internal configured equivalent via `--output-dir`.
- Output path resolution blocks writes outside the allowed output root.
- Invalid or unwritable custom output roots fail safely and fall back to default `.forge/` when a safe repo root exists.
- Failed runs still persist a useful artifact/report when possible instead of crashing.

## What was added
- Minimal Node + TypeScript CLI scaffold.
- CLI entry and command wiring for `forge intake`.
- Boundary policy constants and Step 1 metadata.
- Repo-root and output-root resolution helpers.
- Artifact builder and Markdown report writer.
- Failure handling with boundary-safe fallback persistence.
- Smoke script and automated boundary tests.

## Main code surfaces
- `package.json`
- `src/cli.ts`
- `src/index.ts`
- `src/intake/constants.ts`
- `src/intake/path-policy.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `src/intake/runner.ts`
- `tests/intake.boundary.test.ts`
- `tests/support/forge-cli.ts`
- `scripts/smoke.mjs`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

All verification passed at implementation time.

## Acceptance result
- `forge intake` does not modify app source files.
- All Step 1 writes stay under `.forge/` or a repo-internal configured equivalent.
- The command emits a failed artifact/report instead of crashing when the repo root is valid but output persistence fails.
- Artifact metadata includes command, stage, status, purpose, output root, and write-policy fields for later-step trust.
