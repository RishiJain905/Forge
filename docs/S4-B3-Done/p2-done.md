# Step 4 Batch 3 Part 2 Done Summary

## Implemented Spec
- `docs/forge_step4_batch3/part-2-regrouping-blocking-and-merge-order-hardening.md`

## What Changed
- Hardened the existing aggressive regrouping path instead of reopening the split architecture, so grouped workstreams now expose structured regrouping rationale, dominant-surface context, preserved source-plan-item ids, and per-member traceability directly inside `stream_constraint_details`.
- Added member-level regrouping trace details that preserve each grouped member's title, category, likely affected paths, verification-case ids, finding ids, constraint ids, concern ids, and blocked status so regrouping stays inspectable and does not silently erase carried-forward safety context.
- Reworked grouped-stream blocking semantics so split now exposes explicit nested blocking status for `unblocked`, `partially_blocked`, and `blocked` streams, while carrying forward blocked member ids, blocked-upstream workstream ids, and the exact constraining findings, constraints, and concerns needed to understand why execution can or cannot proceed.
- Hardened merge-order semantics so stream constraint detail now carries explicit nested merge-order status, source-linked rule kinds, hard prerequisite workstream ids, and carried constraint/concern references in parallel with the existing top-level `merge_order` entries.
- Updated `split-report.md` so the carried-forward stream-constraint section now renders the new regrouping, blocking, and merge-order detail without changing the frozen top-level report heading order.
- Kept the optional debug stream-constraint mirror aligned with the artifact because it already persisted `stream_constraint_details`; the richer nested data now flows through automatically.
- Added a dedicated `tests/split.batch3-part2-regrouping-blocking-merge-order.test.ts` regression, strengthened `tests/split.workstream-model.test.ts` and `tests/split.report.test.ts`, and wired the new suite into the default `npm test` gate.
- Updated `README.md` and `progress.md` so Step 4 now reflects Batch 3 Part 2 completion and points next to Batch 3 Part 3.

## Completion Checklist
- [x] Aggressive regrouping remains in place but is more auditable and inspectable
- [x] Grouped workstreams preserve source item references and carried-forward constraint visibility
- [x] Blocked versus partially blocked semantics are explicit and structured
- [x] Merge-order semantics are explicit, source-linked, and operationally useful
- [x] Artifact, report, and debug outputs stay aligned without changing the frozen top-level split contract
- [x] Public `forge split` CLI and top-level `split.json` / `split-report.md` contracts stayed stable
- [x] Dedicated Step 4 Batch 3 Part 2 regression coverage is wired into the default test gate
- [x] README, progress tracking, and Step 4 Batch 3 Part 2 closeout docs are updated
- [x] Full verification gate is green in the implementation worktree

## Key Files
- `src/split/types.ts`
- `src/split/workstreams.ts`
- `src/split/schema.ts`
- `src/split/report.ts`
- `tests/split.workstream-model.test.ts`
- `tests/split.report.test.ts`
- `tests/split.batch3-part2-regrouping-blocking-merge-order.test.ts`
- `package.json`
- `README.md`
- `progress.md`
- `docs/S4-B3-Done/p2-done.md`

## Verification
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke`

## Final Branch State
- Target branch: `dev`
- Step 4 Batch 3 Part 2 is implemented on `dev`
- Remaining Step 4 work stays inside Batch 3 output/readiness/test hardening plus the explicit Step 5 handoff contract follow-through

## Follow-On
- Next Step 4 Batch 3 target: `docs/forge_step4_batch3/part-3-artifact-report-debug-output-and-readiness-hardening.md`
