# Part 5 — Step 2 Handoff Contract for `forge plan`

## Purpose

This file defines what Step 2 should be able to trust from Step 1 once Batch 4 is complete.

It does **not** implement Step 2.
It defines the handoff contract so Step 1 finishes in a way that actually supports the next stage cleanly.

## Why this matters

Step 1 is not just a standalone command.
It is the input foundation for Step 2.

If Step 1 finishes without a clear handoff contract, then Step 2 will:
- guess at meanings
- reinterpret output inconsistently
- duplicate logic
- re-ask questions Step 1 should already have answered

This file prevents that.

## What Step 2 should receive from Step 1

By the end of Batch 4, Step 2 should be able to trust that `.forge/intake.json` provides:

- a stable top-level artifact shape
- resolved input metadata
- a normalized task spec
- usable repo context
- plausible candidate files/modules
- risk analysis
- ambiguities
- warnings
- initial verification targets
- confidence summary
- next-step readiness

Step 2 should not need to infer these from raw text again.

## What Step 2 should **not** need to do

Once Step 1 is complete, Step 2 should not need to:
- re-parse the raw spec just to understand the task
- rediscover the repo at a broad intake level
- guess whether the input was too weak to trust
- reconstruct confidence or readiness from scratch
- rediscover major initial risks/ambiguities from zero

Step 2 may refine or expand these insights, but it should not have to recreate them blindly.

## What Codex must build in Step 1 to support Step 2 cleanly

Codex must ensure:
1. the `IntakeArtifact` shape is stable
2. required sections are populated consistently enough for planning
3. readiness and blocking issues are meaningful
4. candidate targets and risk zones are inspectable enough to guide planning
5. ambiguities remain explicit rather than buried in prose
6. report output mirrors the machine-readable story for debugging

## Required implementation tasks

1. audit `.forge/intake.json` against the needs of a later planning step
2. ensure no critical Step 2 input is missing from the artifact
3. ensure readiness/blocking issues can gate planning when appropriate
4. ensure the report helps a human debug why planning may or may not be ready
5. avoid Step 1 output drift that would force Step 2 to special-case too much

## Required code surfaces

Likely files:
- artifact schema/type definitions
- artifact builder
- readiness/status logic
- report generation

## Inputs

- final Step 1 outputs from all prior batches

## Outputs

- a stable Intake handoff contract suitable for Step 2 consumption

## Edge cases

- Step 1 succeeded with warnings but planning can still proceed
- Step 1 failed but emitted useful partial outputs
- prompt mode creates weaker artifacts than spec mode
- candidate targeting is low confidence but still informative

## Acceptance criteria

This part is complete when:
- Step 1 outputs are clearly usable as Step 2 inputs
- Step 2 would not need to re-run broad intake logic just to proceed
- the artifact and report together explain planning readiness clearly

## Guardrails

- do not implement actual Step 2 behavior here
- do not add planning logic into Step 1
- define the handoff cleanly, then stop

