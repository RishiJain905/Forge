# Batch 3 Part 6 Done Summary

## Implemented Spec
- `forge_step1_batch3/part-6-stage-9-cli-wiring-tests-and-runnable-milestone.md`

## What Changed
- Added a new process-level entrypoint test suite in `tests/intake.cli-entrypoint.test.ts` that exercises the packaged CLI binary (`dist/src/index.js`) directly.
- Covered three spec-mode scenarios through the real entrypoint from a non-repo working directory: a grounded success run, a weak-spec warning run, and a missing-spec failure run with persisted artifact/report output.
- Added `runForgeBinary()` to `tests/support/forge-cli.ts` so the test suite can spawn the packaged binary without replacing the existing helper-based harness.
- Updated `scripts/smoke.mjs` to spawn the packaged entrypoint in spec mode and assert artifact/report output directly.
- Added the new entrypoint test file to the default `npm.cmd test` wiring in `package.json`.
- Kept `src/*` unchanged because the existing CLI wiring already satisfied the packaged-entrypoint contract once the process-level coverage was added.

## Completion Checklist
- [x] Packaged CLI entrypoint is covered by a real process-level spec-mode test
- [x] Non-repo working-directory execution is covered
- [x] Warning spec run persists outputs and exits `0`
- [x] Missing spec path exits `1` and still persists the failed artifact/report
- [x] Smoke now proves the runnable milestone through `dist/src/index.js` in spec mode
- [x] The new test is wired into the default `npm.cmd test` suite
- [x] Fresh verification gate passed on `dev` after integration

## Key Files
- `tests/intake.cli-entrypoint.test.ts`
- `tests/support/forge-cli.ts`
- `scripts/smoke.mjs`
- `package.json`

## Verification
- `npm.cmd test` PASS
- `npm.cmd run typecheck` PASS
- `npm.cmd run build` PASS
- `npm.cmd run smoke` PASS

## Final Branch State
- Target branch: `dev`
- Source worktree branch: `codex/s1-b3-p6-entrypoint-tests` (removed after integration)
- The Batch 3 Part 6 entrypoint coverage, smoke update, test wiring changes, and doc updates are integrated onto `dev` after fresh verification.

## Follow-On
- Batch 3 is complete on `dev`. The next batch has not been defined yet.
