# Step 4 Batch 2 Part 5 Done Summary

## Implemented Spec
- `forge_step4_batch2/part-5-stage-6-cli-wiring-tests-and-runnable-milestone.md`

## What Changed
- Added a dedicated `tests/split.batch2-part5-runnable-milestone.test.ts` suite so Step 4 now has an explicit Batch 2 closeout gate instead of relying only on the broader split command, report, and smoke coverage.
- Added a packaged-CLI runnable-milestone regression that runs `forge intake` -> `forge plan` -> `forge verify` -> `forge split`, removes upstream source files before the split step, and proves the real Step 4 path can rerun entirely from persisted Step 3 plus referenced Step 2 artifacts.
- Kept the public `forge split` CLI surface and the frozen top-level `split.json` / `split-report.md` contract unchanged while proving durable outputs, non-empty workstreams/dependency edges/merge-order output, carried-forward stream-constraint detail, and minimal terminal output.
- Wired the new Part 5 suite into the default `npm.cmd test` script so the runnable milestone is part of the normal verification gate instead of a one-off manual check.
- Updated README and progress tracking so Step 4 Batch 2 is now documented as complete, with later Step 4 work reserved for hardening and freeze follow-up.

## Completion Checklist
- [x] `forge split` is proven runnable end to end from persisted Step 3 output and the referenced Step 2 plan artifact
- [x] The default `npm.cmd test` gate includes the dedicated Step 4 Batch 2 Part 5 runnable-milestone suite
- [x] Durable `split.json` and `split-report.md` outputs are proven on the packaged CLI path
- [x] Minimal CLI output is proven without leaking report markdown into stdout or stderr
- [x] Public `forge split` CLI, top-level `split.json` keys, and split-report heading order stayed stable
- [x] README, progress tracking, and Batch 2 Part 5 closeout docs are updated
- [x] Full verification gate is green in the implementation workspace

## Key Files
- `tests/split.batch2-part5-runnable-milestone.test.ts`
- `package.json`
- `README.md`
- `progress.md`
- `S4-B2-Done/p5-done-summary.md`

## Verification
- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Final Branch State
- Target branch: `dev`
- Step 4 Batch 2 Part 5 is implemented in the current workspace and ready for review or integration onto `dev`

## Follow-On
- Step 4 Batch 2 is complete
- Later Step 4 work is reserved for hardening and freeze follow-up
