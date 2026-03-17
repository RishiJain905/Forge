# Batch 1.09 Complete: Main Artifact Schema

## Spec implemented
- Step 1 intake now has an explicit top-level artifact schema contract instead of keeping the validator only as incidental inline assembly logic.
- The top-level intake artifact fields are now locked to a stable named key set so the public contract stays predictable for later workflow steps.
- The runtime validator now preserves versioning and command/stage metadata more explicitly by validating the expected schema version, command, and stage literals.
- The top-level artifact validator now rejects malformed final objects before write, including missing required top-level sections, invalid status values, and unexpected extra top-level fields.
- The existing top-level `IntakeArtifact` type, version constant, and artifact assembly path remain intact while the contract is hardened and tested directly.

## What changed
- Added a dedicated `src/intake/artifact-schema.ts` module to hold the top-level key list, strict schema validator, and artifact validation helper.
- Refactored `src/intake/artifact.ts` so artifact assembly now validates through the dedicated schema contract module.
- Added a dedicated `tests/intake.artifact-schema.test.ts` file covering the exact top-level keys, stable metadata, missing version rejection, missing sub-result rejection, invalid status rejection, and extra top-level field rejection.
- Wired the new schema test file into the standard `npm.cmd test` pipeline.
- Left inner section modeling unchanged beyond what was necessary to formalize the Batch 1.09 top-level contract.

## Main code surfaces
- `src/intake/artifact-schema.ts`
- `src/intake/artifact.ts`
- `tests/intake.artifact-schema.test.ts`
- `package.json`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Acceptance result
- The top-level intake artifact shape is now explicitly locked rather than implied.
- Malformed top-level artifact objects are rejected before persistence.
- Version and command metadata stay stable and validated.
- Ad hoc top-level fields can no longer silently creep into `.forge/intake.json`.
