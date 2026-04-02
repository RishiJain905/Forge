# Step 4 Batch 1 Part 2 Done Summary

## Implemented Spec
- `forge_step4_batch1/part-2-split-command-contract-and-output-artifacts.md`

## What Changed
- Added the public `forge split` command surface so Step 4 now consumes the persisted Step 3 verify handoff and writes `.forge/split.json` plus `.forge/reports/split-report.md`.
- Froze the top-level split artifact/report contract around source verify and source plan references, the Step 4 workstream contract, conservative placeholder `workstreams` / `dependency_edges` / `merge_order` output, carried-forward constraints, split diagnostics, split readiness, and durable output-file metadata.
- Added optional split debug outputs behind `FORGE_SPLIT_DEBUG=1`, keeping `split.json` and `split-report.md` primary while exposing `split-debug.json`, `workstreams.json`, `merge-order.json`, `blocked-items.json`, and `stream-constraints.json` as secondary mirrors.
- Added dedicated split-facing contract, schema, report, debug-output, and packaged-entrypoint coverage so the shipped Step 4 command/output surface is exercised directly.

## Completion Checklist
- [x] `forge split` has an explicit public command contract
- [x] `.forge/split.json` is the required machine-readable Step 4 output
- [x] `.forge/reports/split-report.md` is the required human-readable Step 4 output
- [x] The report remains derived from the artifact instead of becoming the primary output
- [x] The frozen split contract includes source verify/source plan references plus workstream, diagnostics, readiness, and output-file sections
- [x] Optional debug artifact direction is explicit and remains secondary to the durable outputs
- [x] The Step 4 artifact/report contract stays grounded in persisted Step 3 and referenced Step 2 outputs
- [x] Dedicated split command/schema/report/debug/CLI tests cover the shipped Part 2 surface

## Key Files
- `src/cli.ts`
- `src/split/constants.ts`
- `src/split/artifact.ts`
- `src/split/report.ts`
- `src/split/debug.ts`
- `src/split/runner.ts`
- `tests/split.command-contract.test.ts`
- `tests/split.artifact-schema.test.ts`
- `tests/split.report.test.ts`
- `tests/split.debug-output.test.ts`
- `tests/split.cli-entrypoint.test.ts`
- `S4-B1-Done/p2-done-summary.md`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Step 4 Batch 1 Part 2 is implemented in the current workspace and verified on the integrated branch.

## Follow-On
- Next Step 4 Batch 1 target: `forge_step4_batch1/part-3-workstream-model-stream-categories-and-safety-rules.md`
