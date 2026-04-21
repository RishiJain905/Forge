# Part 5 — Step 4 Handoff Contract for `forge split`

## Purpose

This file defines what Step 4 should be able to trust from Step 3 once Batch 3 is complete.

It does not implement Step 4.
It defines the handoff contract so Step 3 finishes in a way that supports splitting cleanly and safely.

## Why this matters

Step 3 is not just a standalone command.
It is the safety input foundation for Step 4 Split.

If Step 3 finishes without a clear handoff contract, then Step 4 will:
- guess what verification actually found
- reinterpret constraints inconsistently
- ignore TLC failures or warning-heavy areas
- weaken Forge’s reliability story

This file prevents that.

## What Step 4 should receive from Step 3

By the end of Batch 3, Step 4 should be able to trust that `.forge/verify.json` provides:
- a stable top-level verification artifact shape
- source plan reference
- structured verification targets/cases
- structural findings
- formal findings
- state-model/spec references where applicable
- TLC statuses/results
- constraints/mitigations that later steps must respect
- carried-forward ambiguity/warnings/confidence
- verification readiness/status

Step 4 should not need to infer these from prose again.

## What Step 4 should not need to do

Once Step 3 is complete, Step 4 should not need to:
- rebuild verification targets from planning
- guess whether a risky area failed formal checks
- guess what serialization or merge-order constraints now apply
- guess whether later steps must stay serial or cautious
- rediscover known risky coordination areas from scratch

Step 4 may refine or operationalize these constraints, but it should not recreate them blindly.

## What Codex must build in Step 3 to support Step 4 cleanly

Codex must ensure:
1. the `verify.json` shape is stable
2. required sections are populated consistently
3. structural and formal findings remain inspectable
4. constraints/mitigations are explicit enough to guide splitting
5. carried-forward ambiguity and warnings remain visible
6. the verification report mirrors the machine-readable story for debugging

## Required implementation tasks

1. audit `.forge/verify.json` against the needs of a later split step
2. ensure no critical Step 4 input is missing from the artifact
3. ensure readiness/status can help gate splitting when appropriate
4. ensure the report helps a human debug why splitting may or may not be ready
5. avoid Step 3 output drift that would force Step 4 to special-case too much

## Required code surfaces

Likely files:
- verify artifact schema/type definitions
- verify artifact builder
- readiness/status logic
- report generation

## Inputs
- final Step 3 outputs from prior batches

## Outputs
- a stable verification handoff contract suitable for Step 4 consumption

## Edge cases
- Step 3 succeeded with warnings but splitting can still proceed cautiously
- Step 3 failed but emitted useful partial verification outputs
- TLC failed for only some cases while others passed
- constraints are broad but still informative

## Acceptance criteria

This part is complete when:
- Step 3 outputs are clearly usable as Step 4 inputs
- Step 4 would not need to rerun broad verification logic just to proceed
- the artifact and report together explain split readiness clearly

## Guardrails

- do not implement actual Step 4 behavior here
- do not add split logic into Step 3
- define the handoff cleanly, then stop

