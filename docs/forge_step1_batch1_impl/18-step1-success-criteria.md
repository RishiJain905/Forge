# Step 1 Success Criteria

## Purpose
Translate the final success checklist into concrete implementation verification goals.

## Why this matters
This is how you know Step 1 is actually done, not just partially working.

## What Codex must build
- A completion checklist that maps directly to runnable behavior.
- Minimal internal or manual tests aligned to the checklist.

## Required implementation tasks
- Ensure both input modes work.
- Ensure repo context detection works well enough to continue.
- Ensure artifacts and report are written.
- Ensure readiness and confidence are present.
- Ensure ambiguity is persisted.

## Required code surfaces
- Completion checklist file or dev notes.
- Tests or manual verification cases.

## Inputs
- Representative example repos and example inputs.

## Outputs
- A pass/fail evaluation for Step 1 completeness.

## Edge cases
- Spec mode works but prompt mode is broken.
- Artifact writes but report does not.
- Readiness is missing from otherwise good output.

## Acceptance criteria
- All eight documented success bullets are demonstrably true.

## Guardrails
- Do not declare Step 1 complete because one happy path works.
