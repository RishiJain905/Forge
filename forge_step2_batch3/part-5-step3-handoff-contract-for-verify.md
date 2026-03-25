# Part 5 — Step 3 Handoff Contract for `forge verify`

## Purpose

This file defines what Step 3 should be able to trust from Step 2 once Batch 3 is complete.

It does not implement Step 3.
It defines the handoff contract so Step 2 finishes in a way that supports verification cleanly.

## Why this matters

Step 2 is not just a standalone command.
It is the structural input foundation for Step 3 Verify.

If Step 2 finishes without a clear handoff contract, then Step 3 will:
- guess at plan structure
- reinterpret dependencies inconsistently
- reconstruct conflict/risk reasoning
- duplicate planning logic
- weaken the reliability story

This file prevents that.

## What Step 3 should receive from Step 2

By the end of Batch 3, Step 3 should be able to trust that `.forge/plan.json` provides:
- a stable top-level planning artifact shape
- source intake reference
- structured plan items
- dependency relationships
- conflict zones/shared-risk areas
- test obligations
- parallelization categories
- carried-forward ambiguities/warnings/confidence
- planning readiness/status

Step 3 should not need to infer these from prose again.

## What Step 3 should not need to do

Once Step 2 is complete, Step 3 should not need to:
- rebuild plan items from Intake
- rediscover dependency order from scratch
- guess where conflict zones are
- guess what validation expectations exist
- guess which items are likely serial-only or risky/shared
- rediscover which ambiguities were already known

Step 3 may refine or challenge these, but it should not recreate them blindly.

## What Codex must build in Step 2 to support Step 3 cleanly

Codex must ensure:
1. the `plan.json` shape is stable
2. required sections are populated consistently
3. plan items remain structured enough for verification targeting
4. dependency/conflict/parallelization signals are inspectable
5. carried-forward ambiguity and warnings remain visible
6. the planning report mirrors the machine-readable story for debugging

## Required implementation tasks

1. audit `.forge/plan.json` against the needs of a later verification step
2. ensure no critical Step 3 input is missing from the artifact
3. ensure readiness/status can help gate verification when appropriate
4. ensure the report helps a human debug why verification may or may not be ready
5. avoid Step 2 output drift that would force Step 3 to special-case too much

## Required code surfaces

Likely files:
- plan artifact schema/type definitions
- plan artifact builder
- readiness/status logic
- report generation

## Inputs
- final Step 2 outputs from prior batches

## Outputs
- a stable planning handoff contract suitable for Step 3 consumption

## Edge cases
- Step 2 succeeded with warnings but verification can still proceed
- Step 2 failed but emitted useful partial planning outputs
- conflict zones are broad but still informative
- parallelization categories are cautious rather than fully certain

## Acceptance criteria

This part is complete when:
- Step 2 outputs are clearly usable as Step 3 inputs
- Step 3 would not need to rerun broad planning logic just to proceed
- the artifact and report together explain verification readiness clearly

## Guardrails

- do not implement actual Step 3 behavior here
- do not add verification logic into Step 2
- define the handoff cleanly, then stop

