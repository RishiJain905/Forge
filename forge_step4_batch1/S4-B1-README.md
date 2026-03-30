# Forge V1 — Step 4 Split Implementation Spec (Batch 1)

## Purpose of Batch 1

This is the first batch for Step 4: Split.

Step 1 produced Intake artifacts.
Step 2 produced Planning artifacts.
Step 3 produced Verification artifacts, including constraints from structural and formal checks.
Step 4 exists to convert verified work into execution-ready workstreams without violating those constraints.

This batch defines the first real split layer for Forge and sets the rules for how `forge split` should behave.

## Core Step 4 assumption

Split is not a creativity stage.
It is a safety-constrained work partitioning stage.

That means Step 4 must:
- consume verified planning outputs
- preserve constraints from prior steps
- decide what can be run serially versus in parallel
- define merge-order expectations
- define blocked work explicitly
- produce machine-readable and human-readable split outputs

This batch must not let Split become a vague regrouping step that ignores verification.

## Batch 1 target milestone

The primary milestone for this batch is:

> Milestone B: `forge split` has a frozen contract, frozen workstream model, and a clear safety/constraint model that governs stream creation.

That means this batch should lock:
- command purpose
- inputs
- outputs
- workstream model
- stream categories
- safety rules
- carry-forward constraint handling
- merge-order and blocking rules
- first build order and acceptance gates

## Split philosophy

Step 4 should be:
- deterministic-first
- artifact-driven
- strict about prior constraints
- conservative in early regrouping
- explicit about blocked work
- shaped for later execution and integration

Split should not pretend unsafe work is parallel-safe just to maximize speed.

## What this batch covers

This batch covers five major areas:
1. Step 4 goal and boundaries
2. split command contract and output artifacts
3. workstream model, stream categories, and safety rules
4. carry-forward constraints, merge-order, and blocking rules
5. readiness and the first build order

## What this batch does not cover

This batch does not:
- implement actual code execution
- implement integration behavior
- redesign planning or verification
- ignore TLC-backed constraints
- add interactive shell behavior
- add memory backend work

## Suggested reading order

1. `README.md`
2. `part-1-step4-goal-and-boundaries.md`
3. `part-2-split-command-contract-and-output-artifacts.md`
4. `part-3-workstream-model-stream-categories-and-safety-rules.md`
5. `part-4-carry-forward-constraints-merge-order-and-blocking-rules.md`
6. `part-5-readiness-and-first-build-order.md`

Then implement in that order.

## What done means for this batch

This batch is done when:
- the Step 4 contract is frozen
- the workstream model is frozen
- stream categories and safety rules are explicit
- carry-forward behavior from prior steps is explicit
- merge-order and blocking rules are explicit
- the first implementation order for Step 4 is explicit

