# Part 1 — Step 3 Goal and Boundaries

## Purpose

This file defines the mission and boundaries of Step 3: Verify.

Step 3 must take the structured planning output from Step 2 and verify the risky parts of that plan before later steps treat them as implementation-ready.

## Why this matters

Without a verification stage, later steps risk:
- unsafe parallelization
- bad sequencing assumptions
- hidden duplicate execution risks
- hidden stale state risks
- brittle retry or handoff logic
- false confidence in planning output

This is where Forge begins to differentiate itself more strongly from ordinary agent tooling.

## Core Step 3 mission

The mission of Step 3 is:

> Transform Step 2 planning output into verified or constrained planning output by applying both structural verification and formal TLA+/TLC-backed verification to risky coordination/workflow logic.

This includes:
- selecting verification targets from the plan
- running structural checks
- constructing state-oriented verification cases where justified
- generating TLA+ specs for risky coordination logic
- running TLC for those specs
- recording findings, failures, traces, and mitigations
- producing machine-readable and human-readable verification outputs

## What Step 3 must do

Step 3 must:
- consume Step 2 outputs instead of redoing planning
- preserve carried-forward uncertainty from prior steps
- explicitly decide what is worth verifying
- separate structural issues from formal issues
- use TLA+/TLC in V1 for the formal lane
- record findings honestly
- constrain or annotate the plan for later steps

## What Step 3 must not do

Step 3 must not:
- become a universal theorem prover for all business logic
- verify arbitrary non-stateful app behavior
- implement actual split/execution behavior
- hide weak plan inputs behind fake verification confidence
- treat all planning work as equally worthy of formal modeling

## Deterministic-first rule

Step 3 should remain deterministic-first in how it:
- selects verification targets
- classifies verification cases
- runs structural checks
- determines when formal modeling is justified
- maps results into findings/readiness

An optional assistive reasoning layer may exist later for explanation/refinement, but the verification skeleton must not depend on fuzzy reasoning.

## Scope of V1 verification

Step 3 V1 should focus on risky coordination/workflow logic and plan logic, such as:
- ownership transitions
- retries
- handoffs
- duplicate execution risk
- stale writes
- ordering constraints
- unsafe parallel overlap
- dependency contradictions
- risky merge/serialization assumptions

It should not aim to formally verify general product/business behavior that does not benefit from state-space reasoning.

## Required implementation tasks

1. define Step 3’s role clearly in code and docs
2. define what counts as a verification target
3. define the structural and formal lanes explicitly
4. define where TLA+/TLC begin in V1
5. prevent Step 3 from drifting into later-step logic

## Required code surfaces

Likely future surfaces:
- Step 3 command entry
- verify orchestrator/runner
- verification target/case models
- structural verification services
- state-model and TLA+ generation services
- TLC execution service/adapter
- findings/report builders
- persistence

## Acceptance criteria

This part is complete when:
- Step 3’s mission is explicit
- boundaries are explicit
- deterministic-first expectations are explicit
- formal verification is clearly part of V1
- later-step drift is clearly prohibited

