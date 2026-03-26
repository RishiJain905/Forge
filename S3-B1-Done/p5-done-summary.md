# Step 3 Batch 1 Part 5 Done Summary

## Scope

Completed `forge_step3_batch1/part-5-carry-forward-rules-readiness-and-first-build-order.md`.

This part finishes Step 3 Batch 1 in runnable code by:
- making the structural lane execute deterministically from persisted Step 2 signals
- resolving readiness from actual structural plus formal outcomes instead of Step 2 input state alone
- enforcing the first Step 3 build order as structural -> formal -> readiness -> artifact/report assembly
- keeping the public `forge verify` CLI surface, `verify.json` top-level keys, and verify-report heading order frozen
- locking the shipped behavior with dedicated Part 5 acceptance gates

## Key Changes

- Added `src/verify/structural.ts` as the Step 3 owner for deterministic structural execution across dependency, sequencing, overlap, conflict-zone, and surface-safety cases derived from the persisted plan artifact.
- Added `src/verify/readiness.ts` so Step 3 now resolves warning, blocking, and later-step proceed rules from real structural and formal outcomes while preserving upstream Step 2 blockers and `VERIFY_INPUT_TOO_WEAK`.
- Reworked `src/verify/runner.ts` so `forge verify` now runs in the intended order: foundation/model, structural execution, formal execution, readiness resolution, then artifact/report persistence.
- Reworked `src/verify/artifact.ts`, `src/verify/schema.ts`, `src/verify/formal.ts`, and the verify test fixtures so:
  - structural cases no longer stay placeholder `not_run` once selected
  - top-level `findings` and `constraints` aggregate structural plus formal output coherently
  - structural failures and formal `failed` / `errored` / `invalid_spec` outcomes block readiness and CLI success
  - TLC `not_run` remains warning-grade and does not overclaim validation
- Added `tests/verify.part5-carry-forward-readiness-build-order.test.ts` and updated the existing verify regression suites so the Part 5 runtime path, readiness behavior, report parity, artifact schema, and packaged CLI path stay frozen.

## Acceptance Evidence

- Structural verification now emits real per-case `passed` / `failed` outcomes, populated structural findings/constraints, and a non-placeholder top-level `structural_verification` section.
- `verification_readiness` now states whether only structural checks ran, whether formal cases were modeled, whether TLC validated them, and what constraints still need to be carried forward.
- Formal TLC failures now block the packaged `forge verify` command with persisted artifact/report output that keeps readiness, findings, constraints, and report sections coherent.
- Warning-heavy and structural-only runs remain honest: TLC `not_run` stays visible as a warning, and later steps are not told formal validation happened when it did not.
- The public Step 3 contract stayed stable: no new CLI flags, no new top-level `verify.json` keys, and no report heading-order drift.

## Verification

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run smoke`
