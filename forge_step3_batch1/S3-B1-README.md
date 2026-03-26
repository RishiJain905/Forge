# Forge V1 — Step 3 Verify Implementation Spec (Batch 1)

## Purpose of Batch 1

This is the first batch for Step 3: Verify.

Step 1 created a structured Intake layer.
Step 2 created a structured Planning layer.
Step 3 exists to verify the risky parts of that plan before implementation and before unsafe parallel execution decisions get treated as safe.

This batch defines the first real verification layer for Forge and sets the rules for how `forge verify` should behave.

## Core project assumption for Step 3

For Forge, TLA+ and TLC are not optional side ideas.

They are a core differentiator of the product.

That means Step 3 Batch 1 must not treat formal verification as maybe-later.
Instead, Batch 1 must:
- define real TLA+/TLC entry points in V1
- define how risky plan logic becomes verification cases
- define the structural lane and the formal lane together
- define output artifacts that can hold both structural and formal findings

Batch 1 still does not need to fully finish all implementation work.
But it must lock the architecture and contract around real formal verification starting in V1.

## What Step 3 is responsible for

Step 3 should take the outputs of Step 2 and perform two verification lanes.

### Lane 1 — Structural verification
Used for:
- dependency sanity
- unsafe sequencing
- unsafe or contradictory parallelization
- conflict-zone risk review
- plan contradictions
- missing safeguards

### Lane 2 — Formal verification
Used for:
- risky coordination/workflow logic
- ownership transitions
- retry/handoff flows
- duplicate execution risk
- stale write risk
- ordering constraints
- other state-machine-like plan logic

This lane should support:
- state-model construction
- TLA+ spec generation
- TLC execution
- findings and traces/errors captured into verification outputs

## Batch 1 target milestone

The primary milestone for this batch is:

> Milestone B: `forge verify` has a frozen contract, frozen verification target model, frozen two-lane architecture, and a real V1 TLA+/TLC lane defined.

That means this batch should lock:
- command purpose
- inputs
- outputs
- verification artifact shape
- what counts as a verification target
- the structural lane
- the formal TLA+/TLC lane
- carry-forward rules from Step 2
- the first build order and acceptance gates

## Step 3 verification philosophy

Step 3 should be:
- deterministic-first
- artifact-driven
- explicit about uncertainty
- selective rather than universal
- focused on risky coordination/workflow logic
- formally serious where formal checks are justified

TLA+/TLC should be used where they create real leverage, not sprayed across the whole product indiscriminately.

## What this batch covers

This batch covers five major areas:
1. Step 3 goal and boundaries
2. verify command contract and output artifacts
3. verification target model, cases, and the two verification lanes
4. formal verification scope, state models, TLA+ generation, and TLC entry
5. carry-forward rules, readiness, and the first build order

## What this batch does not cover

This batch does not:
- implement Step 4 splitting behavior
- generate execution packets
- perform code changes to the target repo as part of verification
- redesign planning
- turn TLA+ into a proof system for every kind of business logic
- add memory backends or interactive shell behavior

## Suggested reading order

1. `README.md`
2. `part-1-step3-goal-and-boundaries.md`
3. `part-2-verify-command-contract-and-output-artifacts.md`
4. `part-3-verification-target-model-cases-and-lanes.md`
5. `part-4-formal-verification-scope-state-models-and-tla-entry.md`
6. `part-5-carry-forward-rules-readiness-and-first-build-order.md`

Then implement in that order.

## What “done” means for this batch

This batch is done when:
- the Step 3 contract is frozen
- the verification-case model is frozen
- the two-lane architecture is frozen
- real TLA+/TLC entry points are frozen for V1
- carry-forward behavior from Step 2 is explicit
- the first implementation order for Step 3 is explicit

