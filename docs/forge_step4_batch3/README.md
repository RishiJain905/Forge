# Forge V1 — Step 4 Split Implementation Spec (Batch 3)

## Purpose of Batch 3

Batch 3 is the finish-and-freeze batch for Step 4: Split.

Batch 1 froze the split contract, workstream model, stream categories, and safety model.
Batch 2 made `forge split` materially real and partially runnable with more aggressive regrouping and first-class blocked work.
Batch 3 exists to finish Step 4 to a V1-complete level and freeze it except for future bug fixes.

This batch focuses on:
- hardening aggressive regrouping behavior
- blocking and partial-blocking semantics
- merge-order and constraint polish
- artifact/report/debug-output polish
- stronger readiness/status behavior
- stronger tests
- a clean handoff contract into Step 5 (`forge execute`)

## Batch 3 target milestone

The primary milestone for this batch is:

> Milestone C: Step 4 is freeze-ready except for future bug fixes, and its handoff to Step 5 is clearly defined.

That means by the end of this batch:
- Step 4 should feel finished for V1
- later execution work should not need to guess what split output means
- future Step 4 work should mostly be bug fixes, not active feature building

## What Batch 3 must achieve

By the end of Batch 3, Step 4 should provide:
- stable machine-readable split output
- stable human-readable split report
- stable debug split artifacts
- stable warning/failure/readiness behavior
- stable carried-forward constraint handling
- hardened aggressive regrouping semantics
- hardened merge-order and blocking semantics
- tests strong enough to freeze Step 4
- a clean handoff contract for Step 5 Execute

## Regrouping policy for Batch 3

Batch 2 already moved into more aggressive regrouping.
Batch 3 should keep that aggressiveness, but harden it.

That means:
- preserve stronger regrouping where it improves execution readiness
- keep source traceability explicit
- make grouping rationale inspectable
- make blocked and constrained outputs clearer
- avoid widening regrouping logic so much that semantics become unstable right before freezing

Rule:
Batch 3 should harden aggressive regrouping, not reinvent it.

## What Batch 3 must not become

Batch 3 must not drift into:
- actual execution implementation
- code-edit packet generation
- interactive shell features
- memory backend ideas
- architecture redesign for aesthetics
- broad regrouping experiments that destabilize split semantics

This batch is about finishing Step 4, not starting Step 5 early.

## Required assumptions

Implementing agents must assume:
- Step 3 is frozen enough to trust
- Step 4 Batch 1 and Batch 2 decisions remain the foundation
- split stays deterministic-first
- blocked work remains first-class
- the goal is to freeze Step 4 with confidence

## Suggested reading order

1. `README.md`
2. `part-1-batch3-goal-finish-line-and-do-not-touch.md`
3. `part-2-regrouping-blocking-and-merge-order-hardening.md`
4. `part-3-artifact-report-debug-output-and-readiness-hardening.md`
5. `part-4-step4-polish-test-hardening-and-freeze-criteria.md`
6. `part-5-step5-handoff-contract-for-execute.md`

Then implement in that order.

## What done means for Batch 3

Batch 3 is done when:
- Step 4 split outputs are stable and trustworthy
- regrouping remains aggressive but auditable
- blocking and merge-order semantics are coherent
- warnings/failures/readiness are coherent
- debug outputs are coherent
- tests protect the step strongly enough to stop active Step 4 development
- Step 4 can be treated as frozen except for future bug fixes

