# Batch 1.07 Complete: Non-Goals and Boundary Enforcement

## Spec implemented
- Step 1 intake now has an explicit boundary-enforcement pass that shapes final persisted output before the artifact and report are written.
- Intake now emits pointer-only `initialVerificationTargets` so later steps can see likely verification surfaces without Step 1 performing any verification work.
- Boundary notes now clearly defer code edits, workstream splitting, formal verification, and execution-packet behavior to later workflow stages.
- The Step 1 boundary policy constants now document excluded capabilities more explicitly instead of relying only on implicit conventions.
- Failed intake runs remain boundary-safe and still persist the same non-goal guardrails when a repo-root-backed artifact can be written.

## What changed
- Added a dedicated `src/intake/boundary.ts` helper to derive initial verification targets and final deferred-capability notes from already-resolved Step 1 outputs.
- Extended the artifact and report contracts to include `initialVerificationTargets` and a dedicated report section for those pointers.
- Refactored the intake runner so artifact/report persistence now consumes a boundary-safe result rather than raw assembled intake output.
- Expanded the shared Step 1 boundary policy with additional excluded-capability entries for workstreams, formal verification work, and direct source editing.
- Added a dedicated non-goals test file covering direct implementation prompts, work splitting/formal verification requests, and boundary-safe failed-run output.

## Main code surfaces
- `src/intake/boundary.ts`
- `src/intake/types.ts`
- `src/intake/runner.ts`
- `src/intake/artifact.ts`
- `src/intake/report.ts`
- `src/intake/constants.ts`
- `tests/intake.non-goals.test.ts`
- `README.md`
- `progress.md`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Acceptance result
- Step 1 stops at intake outputs and no longer risks implying that planning, verification execution, or workstream generation already happened.
- Verification output is now intentionally limited to initial pointers, not executable verification work.
- The artifact and report remain aligned on both successful and failed runs while preserving the Step 1 boundary contract.
