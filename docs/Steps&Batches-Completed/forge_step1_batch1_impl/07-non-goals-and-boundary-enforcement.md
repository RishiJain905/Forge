# Non-Goals and Boundary Enforcement

## Purpose
Explicitly prevent Step 1 from expanding into later pipeline work.

## Why this matters
Without enforcement, Codex may overbuild and waste time on Step 2+ behavior.

## What Codex must build
- Checks or conventions that keep Step 1 from generating plans, workstreams, or code edits.
- A boundary note in the final report when later-stage questions are deferred.

## Required implementation tasks
- Add code comments/constants documenting excluded capabilities.
- Ensure the Step 1 runner only emits initial verification targets, not actual verification work.
- Keep report language clear about what comes next vs what Step 1 already did.

## Required code surfaces
- Boundary enforcement helper/constants.
- Deferred-capability notes in report builder.

## Inputs
- Resolved Step 1 sub-results.

## Outputs
- Boundary-safe artifact and report.

## Edge cases
- Spec mentions work splitting or formal verification.
- Prompt asks to implement code directly.

## Acceptance criteria
- Step 1 stops at intake outputs.
- No execution packets or plan items are emitted.

## Guardrails
- Do not sneak future-step fields into the artifact unless they are explicitly initial pointers.
