# Part 5 — Step 5 Handoff Contract for `forge execute`

## Purpose

This file defines what Step 5 should be able to trust from Step 4 once Batch 3 is complete.

It does not implement Step 5.
It defines the handoff contract so Step 4 finishes in a way that supports execution cleanly and safely.

## Why this matters

Step 4 is not just a standalone command.
It is the execution partition foundation for Step 5 Execute.

If Step 4 finishes without a clear handoff contract, then Step 5 will:
- guess what work belongs in each stream
- reinterpret blocked status inconsistently
- ignore merge-order constraints
- weaken Forge’s reliability story

This file prevents that.

## What Step 5 should receive from Step 4

By the end of Batch 3, Step 5 should be able to trust that `.forge/split.json` provides:
- a stable top-level split artifact shape
- source verify reference
- structured workstreams
- stream categories
- stream dependencies
- merge-order expectations
- blocked items/streams
- carried-forward constraints/findings
- split readiness/status

Step 5 should not need to infer these from prose again.

## What Step 5 should not need to do

Once Step 4 is complete, Step 5 should not need to:
- rebuild workstreams from verification output
- guess whether a stream is blocked or partially blocked
- guess what merge-order constraints now apply
- guess which constraints must be respected during execution
- rediscover known risky groupings from scratch

Step 5 may refine or operationalize these constraints, but it should not recreate them blindly.

## What Codex must build in Step 4 to support Step 5 cleanly

Codex must ensure:
1. the `split.json` shape is stable
2. required sections are populated consistently
3. workstreams remain inspectable
4. merge-order and blocked semantics are explicit enough to guide execution
5. carried-forward constraints remain visible
6. the split report mirrors the machine-readable story for debugging

## Required implementation tasks

1. audit `.forge/split.json` against the needs of a later execute step
2. ensure no critical Step 5 input is missing from the artifact
3. ensure readiness/status can help gate execution when appropriate
4. ensure the report helps a human debug why execution may or may not be ready
5. avoid Step 4 output drift that would force Step 5 to special-case too much

## Required code surfaces

Likely files:
- split artifact schema/type definitions
- split artifact builder
- readiness/status logic
- report generation

## Inputs
- final Step 4 outputs from prior batches

## Outputs
- a stable split handoff contract suitable for Step 5 consumption

## Edge cases
- Step 4 succeeded with warnings but execution can still proceed cautiously
- Step 4 failed but emitted useful partial split outputs
- blocked work coexists with executable work
- merge-order constraints are broad but still informative

## Acceptance criteria

This part is complete when:
- Step 4 outputs are clearly usable as Step 5 inputs
- Step 5 would not need to rerun broad split logic just to proceed
- the artifact and report together explain execution readiness clearly

## Guardrails

- do not implement actual Step 5 behavior here
- do not add execution logic into Step 4
- define the handoff cleanly, then stop

