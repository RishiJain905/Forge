# Forge V1 — Step 2 Plan Implementation Spec (Batch 2)

## Purpose of Batch 2

Batch 2 is the first true implementation-driving batch for Step 2: Plan.

Step 2 Batch 1 froze the planning contract, artifact direction, and structural concepts.
Batch 2 converts that into actual code work.

This batch is written so a coding agent or human engineer can implement Step 2 in a staged way without reopening the Step 2 contract.

## Batch 2 target milestone

The primary milestone for this batch is:

> Milestone 2: `forge plan` runs end-to-end from Step 1 output in a partial but real way.

This means Batch 2 must prioritize:
- real plan-item construction
- real dependency/conflict analysis
- real test obligations
- real parallelization signals
- real plan artifact generation
- real planning report generation
- real CLI wiring
- real tests for the implemented path

## What Batch 2 must achieve

By the end of Batch 2, the codebase should be materially closer to a usable planning stage.

Expected outcomes:
- Step 2 consumes Step 1 artifacts cleanly
- structured plan items are produced
- dependencies and conflict zones are produced
- test obligations and stronger-than-hint parallelization signals are produced
- `.forge/plan.json` is real
- `.forge/reports/plan-report.md` is real
- `forge plan` is runnable in a partial but real way
- tests protect the implemented planning path

## What Batch 2 does not need to fully finish

Batch 2 does not need to fully freeze Step 2.

It does not need:
- perfect planning quality in all edge cases
- full polish of every warning/failure scenario
- complete future-step readiness
- full Step 2 freeze criteria
- deep reasoning-heavy planning behavior
- Step 3 verification logic

Those belong in later Step 2 hardening work.

## Required assumptions

Implementing agents must assume:
- Step 1 is stable enough to consume
- Step 2 Batch 1 contracts are fixed
- this batch is implementation-first, not architecture-first
- planning remains deterministic-first
- a narrow bounded planning-assist hook is allowed
- stronger parallelization categories should be included now
- later-step execution/splitting logic must still remain out of scope

## Global guardrails for Batch 2

### Do not touch
- Step 3 or later behavior
- interactive shell mode
- memory backends
- TLA+ / TLC systems
- execution-packet generation
- code-editing behavior
- broad repo cleanup unrelated to Step 2

### Allowed
- safe cleanup inside Step 2 only
- stabilizing existing files
- merging ultra-thin helpers if they add noise
- tightening tests around the real planning path

## Suggested reading order

1. `README.md`
2. `part-1-batch2-goal-and-do-not-touch.md`
3. `part-2-stage-1-and-2-intake-consumption-plan-item-foundation.md`
4. `part-3-stage-3-and-4-dependencies-conflict-zones-test-obligations.md`
5. `part-4-stage-5-and-6-parallelization-carry-forward-artifacts-and-report.md`
6. `part-5-stage-7-cli-wiring-tests-and-runnable-milestone.md`

Then implement in stage order.

## What done means for Batch 2

Batch 2 is done when:
- Step 2 can consume Step 1 output and produce a real plan path
- `forge plan` is partially but genuinely runnable
- plan outputs are written to disk
- dependencies/conflict zones/test obligations/parallelization signals are materially real
- tests protect the implemented path enough to continue safely

