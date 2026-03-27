# Forge V1 — Step 3 Verify Implementation Spec (Batch 2)

## Purpose of Batch 2

Batch 2 is the first true implementation-driving batch for Step 3: Verify.

Step 3 Batch 1 froze the verification contract, the two-lane architecture, and the requirement that real TLA+/TLC begins in V1.
Batch 2 converts that into actual code work.

This batch is written so a coding agent or human engineer can implement Step 3 in a staged way without reopening the Step 3 contract.

## Batch 2 target milestone

The primary milestone for this batch is:

> Milestone 2: `forge verify` runs end-to-end from Step 2 output in a partial but real way.

This means Batch 2 must prioritize:
- real verification target/case construction
- real structural verification checks
- real state-model construction
- real TLA+ spec generation
- real TLC execution for a narrow but high-value subset of cases
- real `verify.json`
- real `verify-report.md`
- real CLI wiring
- real tests for the implemented path

## What Batch 2 must achieve

By the end of Batch 2, the codebase should be materially closer to a usable verification stage.

Expected outcomes:
- Step 3 consumes Step 2 artifacts cleanly
- structured verification targets and cases are produced
- structural findings are produced
- formal-lane cases are turned into state models
- real TLA+ specs are generated
- real TLC execution runs for a narrow but important subset of high-value cases
- `.forge/verify.json` is real
- `.forge/reports/verify-report.md` is real
- `forge verify` is runnable in a partial but real way
- tests protect the implemented verification path

## What Batch 2 does not need to fully finish

Batch 2 does not need to fully freeze Step 3.

It does not need:
- perfect verification coverage for every risky category
- full polish of every warning/failure scenario
- complete freeze criteria
- universal TLA+/TLC across all possible cases
- Step 4 split logic
- later execution/integration behavior

Those belong in later Step 3 hardening work.

## Required assumptions

Implementing agents must assume:
- Step 2 is stable enough to consume
- Step 3 Batch 1 contracts are fixed
- this batch is implementation-first, not architecture-first
- verification remains deterministic-first
- both structural and formal lanes are real
- TLA+/TLC must be implemented in V1 now, but selectively
- later-step split/execute logic must remain out of scope

## Global guardrails for Batch 2

### Do not touch
- Step 4 or later behavior
- interactive shell mode
- memory backends
- execution-packet generation
- code-editing behavior
- broad repo cleanup unrelated to Step 3

### Allowed
- safe cleanup inside Step 3 only
- stabilizing existing files
- merging ultra-thin helpers if they add noise
- tightening tests around the real verification path

## First formal-case set for V1

Batch 2 should implement real TLA+/TLC for a narrow but high-value subset of cases such as:
- retry / reassign flow
- ownership transition
- duplicate execution risk
- stale write / version validity
- ordering constraint / serialization case

These are the initial cases because they provide real leverage and map well to state-machine reasoning.

## What done means for Batch 2

Batch 2 is done when:
- Step 3 can consume Step 2 output and produce a real verification path
- `forge verify` is partially but genuinely runnable
- verify outputs are written to disk
- structural findings and formal findings are materially real
- real TLA+ specs are generated
- real TLC execution runs for the initial high-value subset
- tests protect the implemented path enough to continue safely

