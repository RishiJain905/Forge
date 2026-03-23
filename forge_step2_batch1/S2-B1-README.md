# Forge V1 — Step 2 Plan Implementation Spec (Batch 1)

## Purpose of Batch 1

This is the first batch for **Step 2: Plan**.

Step 1 is now considered complete enough to serve as the stable input foundation for planning.
Step 2 exists to transform Step 1 Intake output into a structured implementation plan that later steps can trust.

This batch defines the first real planning layer for Forge and sets the rules for how `forge plan` should behave.

## What Step 2 is responsible for

Step 2 should take the outputs of Step 1 and produce:

- a machine-readable implementation plan
- a human-readable planning report
- dependency relationships between plan items
- conflict zones and shared-risk areas
- test obligations per plan item
- parallelization signals that later support `split`
- carried-forward ambiguities and warnings from Intake
- planning readiness for later steps

Step 2 should **not** perform implementation, verification, or splitting yet.

## Batch 1 target milestone

The primary milestone for this batch is:

> **Milestone B: `forge plan` produces both a machine-readable planning artifact and a human-readable planning report.**

That means this batch should lock:
- command purpose
- inputs
- outputs
- plan artifact shape
- planning boundaries
- plan-item and dependency model
- carry-forward rules
- first-stage build order and acceptance gates

## Step 2 planning philosophy

Step 2 should be:
- deterministic-first
- artifact-driven
- dependency-aware
- honest about ambiguity
- shaped for later `verify`, `split`, and `integrate`

Agent reasoning may exist later in a narrow bounded form, but Step 2 should not become a fuzzy “ask the model for a plan and hope” system.

## What this batch covers

This batch covers five major areas:
1. Step 2 goal and boundaries
2. plan command contract and output artifacts
3. plan-item model, dependencies, and conflict zones
4. test obligations, parallelization signals, and carry-forward rules
5. first build order and acceptance gates

## What this batch does not cover

This batch does **not**:
- implement Step 3 verification behavior
- implement Step 4 splitting behavior
- create execution packets
- perform actual code changes
- define future interactive mode behavior
- introduce memory backend work
- introduce deep LLM planning orchestration

## Suggested reading order

1. `README.md`
2. `part-1-step2-goal-and-boundaries.md`
3. `part-2-plan-command-contract-and-output-artifacts.md`
4. `part-3-plan-item-model-dependencies-conflict-zones.md`
5. `part-4-test-obligations-parallelization-and-carry-forward-rules.md`
6. `part-5-first-build-order-and-acceptance-gates.md`

Then implement in that order.

## What “done” means for this batch

This batch is done when:
- the Step 2 contract is frozen
- the initial plan artifact shape is frozen
- plan items and dependency rules are explicit
- carry-forward behavior from Step 1 is explicit
- test obligations and parallelization signals are explicit
- the first implementation order for Step 2 is explicit

