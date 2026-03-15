# Main Artifact Schema

## Purpose
Define the stable top-level shape of `.forge/intake.json`.

## Why this matters
If the top-level artifact churns, later steps become brittle.

## What Codex must build
- Type/interface/schema for the top-level intake artifact.
- Stable top-level fields with explicit names.

## Required implementation tasks
- Create a typed artifact model matching the agreed top-level structure.
- Add schema validation or lightweight runtime checks before writing.
- Preserve versioning and command metadata.

## Required code surfaces
- TypeScript interface/type for intake artifact.
- Runtime validator or schema checker.
- Version constant.

## Inputs
- All sub-results produced by Step 1.

## Outputs
- Validated top-level artifact object.

## Edge cases
- A sub-result is missing.
- Status is unresolved when artifact assembly happens.
- Version field is absent.

## Acceptance criteria
- Top-level artifact matches the documented structure.
- A validator rejects malformed final objects before write.

## Guardrails
- Do not let ad hoc fields creep in during implementation.
- Keep the top level stable and boring.
