# Forge V1 — Step 1 Intake Implementation Spec (Batch 3)

## Purpose of Batch 3

Batch 3 is the first **true implementation-driving batch** for **Step 1: Intake**.

Batch 1 froze the contract.
Batch 2 froze the internal architecture and build order.
Batch 3 converts that into **actual code work**.

This batch is written so that a coding agent or human engineer can implement Step 1 in a staged way without reopening architecture questions.

---

## Batch 3 target milestone

The primary milestone for this batch is:

> **Milestone 2: `forge intake --spec <file>` works end-to-end in a partial but real way.**

This means Batch 3 must prioritize:
- real internal code work
- real file/function responsibilities
- real test coverage improvements
- real CLI wiring for spec mode
- stable artifact and report generation

Prompt mode remains important, but **spec mode comes first in Batch 3**.

---

## What Batch 3 must achieve

By the end of Batch 3, the codebase should be much closer to a usable Step 1.

Expected outcomes:
- core Step 1 contracts are reflected in code
- spec-mode input path works through the real pipeline
- orchestrator flow is visible and stable
- artifact output is real
- report output is real
- persistence is real
- tests cover the implemented path well enough to trust further work

---

## What Batch 3 does not need to fully finish

Batch 3 does not need to completely perfect Step 1.

It does not need:
- flawless prompt mode
- full optional LLM assistance
- every edge case polished
- every test scenario finalized
- deep cleanup of every Intake file
- any work on Step 2+

Those can continue in the next batch.

---

## Required assumptions

Implementing agents must assume:
- Step 1 contracts from Batch 1 are fixed
- Step 1 architecture from Batch 2 is fixed
- safe cleanup only; no broad rewrites
- existing Intake files are the primary implementation surface
- spec mode is the top priority
- prompt mode should not be broken, but does not need full parity yet
- the goal is to make `forge intake --spec ...` real, not to build future steps early

---

## Global guardrails for Batch 3

### Do not touch
- Step 2 or later command behavior
- interactive slash-command mode
- memory backends like Mem0/OpenViking
- TLA+ / TLC implementation
- speculative SaaS features
- unrelated repo cleanup
- public mission/philosophy docs unless absolutely required by implementation

### Allowed
- safe structural cleanup in Step 1 only
- stabilizing existing files
- merging ultra-thin Intake helpers when it clearly reduces debugging risk
- tightening tests that protect Step 1 behavior

---

## Suggested reading order

1. `README.md`
2. `part-1-step1-batch3-goal-and-boundaries.md`
3. `part-2-stage-1-and-2-core-types-and-input-foundation.md`
4. `part-3-stage-3-and-4-task-normalization-and-repo-context.md`
5. `part-4-stage-5-and-6-targeting-analysis-confidence.md`
6. `part-5-stage-7-and-8-artifacts-report-persistence-and-runner.md`
7. `part-6-stage-9-cli-wiring-tests-and-runnable-milestone.md`

Then implement in stage order.

---

## What “done” means for Batch 3

Batch 3 is done when:
- spec mode can run end-to-end through the Intake pipeline
- the pipeline writes real artifact outputs
- the pipeline writes a real report
- tests protect the implemented flow well enough to continue safely
- the Step 1 codebase is stronger without reopening Batch 1/2 decisions
