# Part 3 — Verification Target Model, Cases, and Lanes

## Purpose

This file defines the heart of Step 3:
- what a verification target is
- what a verification case is
- how the two verification lanes work together

This is the structural core of the verification stage.

## Why this matters

If Step 3 does not clearly define what it is verifying:
- formal checks will be sprayed too broadly
- TLC runs will be wasted on the wrong things
- structural findings will mix with formal findings
- later steps will not know what constraints actually matter

This file prevents that.

## What a verification target is

A verification target is a risky part of the plan that should be inspected by Step 3.

A good verification target should capture:
- what risky plan area is under review
- why it is risky
- which plan items it came from
- whether it belongs in the structural lane, the formal lane, or both
- what kind of findings/mitigations might result

Targets are selected from Step 2 outputs. Step 3 should not invent them from nowhere.

## What a verification case is

A verification case is the concrete verification unit executed by Step 3.

A case may represent:
- a structural rule check
- a state-model/TLA+ formal case
- or both lanes applied to the same target

A verification case should capture:
- id
- name/title
- category
- source plan items
- lane(s)
- verification rule/invariant/goal
- model or spec references where applicable
- findings/results
- mitigation/constraints
- status

## The two-lane model

### Lane 1 — Structural verification
This lane should cover things like:
- dependency contradictions
- unsafe parallelization
- missing sequencing
- conflict-zone hazards
- contradictory planning assumptions
- obvious unsafe merge-order logic

This lane is deterministic and cheaper.

### Lane 2 — Formal verification
This lane should cover risky coordination/workflow logic such as:
- retry flows
- handoffs
- ownership transitions
- duplicate execution risk
- stale write risk
- ordering constraints
- state transitions with non-trivial failure paths

This lane should support:
- state-model construction
- TLA+ generation
- TLC execution
- trace/findings capture

## What Codex must build

Codex must build Step 3 so that:
- verification targets are structured and explicit
- verification cases are inspectable
- lane assignment is explicit
- formal verification cases are grounded in risky plan logic
- structural and formal results do not get conflated

## Required implementation tasks

1. define the internal verification-target shape
2. define the internal verification-case shape
3. define lane classification logic
4. map Step 2 risky areas into verification targets/cases
5. ensure a target may produce one or more cases when needed
6. preserve traceability from Step 2 into each target/case

## Inputs

Primary inputs from Step 2:
- plan items
- dependencies
- conflict zones
- test obligations
- parallelization categories
- carried-forward ambiguity/warnings/confidence
- planning readiness/status

## Outputs

- structured verification targets
- structured verification cases
- lane classification for each case

## Edge cases

- one risky area produces both structural and formal cases
- one formal case covers multiple plan items
- the plan is warning-heavy but still worth verifying
- target confidence is weaker but still useful

## Acceptance criteria

This part is complete when:
- verification targets are explicit
- verification cases are explicit
- the two-lane model is explicit
- later implementation would not need to reinvent these concepts

