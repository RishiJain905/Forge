# Step 4 Batch 1 Part 4 Done Summary

## Implemented Spec
- `forge_step4_batch1/part-4-carry-forward-constraints-merge-order-and-blocking-rules.md`

## What Changed
- Reworked the nested Step 4 split contract so `merge_order` now emits explicit rule objects, `blocked_items` now distinguishes upstream blockers from blocked workstreams, and `carried_forward_constraints` now exposes public `stream_constraint_details` without changing the frozen top-level `split.json` key set.
- Extended `src/split/workstreams.ts` so dependency, conflict-zone, test-obligation, verification target/case/finding/constraint, carry-forward concern, and readiness sources remain explicitly linked per workstream while keeping one workstream per Step 2 plan item.
- Updated `split-report.md` plus the optional split debug mirrors so merge-order rule types, blocked-item kinds, and stream-level carried-forward constraint linkage stay visible to both humans and later machine consumers.
- Added dedicated Part 4 regression coverage and expanded the split schema/report/debug/command/smoke assertions so the stronger carry-forward, merge-order, and blocking model stays under the default verification gate.

## Completion Checklist
- [x] Carry-forward constraints are explicit in Step 4 output
- [x] Merge-order rules are explicit and machine-readable
- [x] Blocked items and blocked workstreams are explicit and distinguishable
- [x] Blocked workstreams keep useful partial metadata instead of disappearing into prose
- [x] Carried-forward concerns remain visible in both the artifact and the report
- [x] Split does not silently resolve prior risk or remove prior-step blockers
- [x] The frozen Step 4 top-level artifact/report contract stays stable
- [x] Dedicated Part 4 coverage is wired into the default verification gate
- [x] `progress.md` and the Part 4 closeout doc are updated
- [x] Full verification gate is green in the current workspace

## Key Files
- `src/split/types.ts`
- `src/split/schema.ts`
- `src/split/artifact.ts`
- `src/split/workstreams.ts`
- `src/split/readiness.ts`
- `src/split/report.ts`
- `src/split/debug.ts`
- `tests/split.part4-carry-forward-merge-order-blocking.test.ts`
- `tests/split.workstream-model.test.ts`
- `tests/split.command-contract.test.ts`
- `tests/split.artifact-schema.test.ts`
- `tests/split.report.test.ts`
- `tests/split.debug-output.test.ts`
- `scripts/smoke.mjs`
- `progress.md`
- `S4-B1-Done/p4-done-summary.md`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `step4-b1-part4`
- Step 4 Batch 1 Part 4 is implemented in the current workspace and verified on the isolated worktree.

## Follow-On
- Next Step 4 Batch 1 target: `forge_step4_batch1/part-5-readiness-and-first-build-order.md`
