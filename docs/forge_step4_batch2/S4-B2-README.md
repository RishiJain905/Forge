# Forge V1 — Step 4 Split Implementation Spec (Batch 2)

## Purpose of Batch 2

Batch 2 is the first true implementation-driving batch for Step 4: Split.

Step 4 Batch 1 froze the split contract, workstream model, stream categories, and safety model.
Batch 2 converts that into actual code work.

This batch is written so a coding agent or human engineer can implement Step 4 in a staged way without reopening the Step 4 contract.

## Batch 2 target milestone

The primary milestone for this batch is:

> Milestone 2: `forge split` runs end-to-end from Step 3 output in a partial but real way.

This means Batch 2 must prioritize:
- real verify-artifact consumption
- real workstream construction
- real stream categorization
- real merge-order and blocking logic
- real `split.json`
- real `split-report.md`
- real CLI wiring
- real tests for the implemented path

## What Batch 2 must achieve

By the end of Batch 2, the codebase should be materially closer to a usable split stage.

Expected outcomes:
- Step 4 consumes Step 3 artifacts cleanly
- structured workstreams are produced
- stream categories are produced
- merge-order expectations are produced
- blocked items/streams are produced
- `.forge/split.json` is real
- `.forge/reports/split-report.md` is real
- `forge split` is runnable in a partial but real way
- tests protect the implemented split path

## Regrouping policy for Batch 2

Batch 1 was conservative by design.
Batch 2 should be more aggressive where it clearly improves:
- safety
- merge order
- stream clarity
- execution readiness

But that aggressiveness must remain bounded by:
- strong traceability back to plan and verification artifacts
- explicit carried-forward constraints
- honest blocking behavior
- inspectable grouping rationale

Rule:
More aggressive regrouping is allowed in Batch 2 only when it does not make the split artifact harder to audit.

## What Batch 2 does not need to fully finish

Batch 2 does not need to fully freeze Step 4.

It does not need:
- perfect stream grouping in all edge cases
- full polish of every warning/failure scenario
- complete freeze criteria
- actual code execution behavior
- integration behavior
- all future regrouping sophistication

Those belong in later Step 4 hardening work.

## Required assumptions

Implementing agents must assume:
- Step 3 is stable enough to consume
- Step 4 Batch 1 contracts are fixed
- this batch is implementation-first, not architecture-first
- split remains deterministic-first
- blocked work must be first-class
- later execution/integration logic must remain out of scope

## Global guardrails for Batch 2

### Do not touch
- Step 5 or later behavior
- interactive shell mode
- memory backends
- code-editing/execution behavior
- broad repo cleanup unrelated to Step 4

### Allowed
- safe cleanup inside Step 4 only
- stabilizing existing files
- merging ultra-thin helpers if they add noise
- tightening tests around the real split path

## What done means for Batch 2

Batch 2 is done when:
- Step 4 can consume Step 3 output and produce a real split path
- `forge split` is partially but genuinely runnable
- split outputs are written to disk
- workstreams, categories, merge order, and blocking are materially real
- tests protect the implemented path enough to continue safely

