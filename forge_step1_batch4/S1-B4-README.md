# Forge V1 — Step 1 Intake Implementation Spec (Batch 4)

## Purpose of Batch 4

Batch 4 is the **finish-and-freeze** batch for **Step 1: Intake**.

Batch 1 defined the contract.
Batch 2 defined the internal architecture.
Batch 3 drove Step 1 into a real runnable spec-mode path.

Batch 4 exists to:

- finish Step 1 to a V1-complete level
- add basic but trustworthy prompt-mode parity
- harden edge cases, warnings, failures, and debug outputs
- define a narrow V1 implementation of `--llm-assist`
- polish tests and freeze Step 1 except for future bug fixes
- ensure Step 1 hands off cleanly into Step 2 (`forge plan`)

## Batch 4 target milestone

The primary milestone for this batch is:

> **Milestone B: Step 1 is feature-complete for V1 and safe to freeze except for future bug fixes.**

That means by the end of this batch, Step 1 should not feel “in progress.”
It should feel like a stable finished first stage of the Forge pipeline.

## What Batch 4 must achieve

By the end of Batch 4, Step 1 should provide:

- spec mode working end-to-end
- prompt mode working end-to-end at a basic but trustworthy level
- stable warning/failure behavior
- stable optional debug outputs
- a narrow but real V1 `--llm-assist` implementation
- strong enough tests to freeze the step
- a clean handoff contract for Step 2

## What Batch 4 must not become

Batch 4 must not drift into:
- redesigning Step 1 architecture again
- partial implementation of Step 2 logic
- heavy memory/backends work
- interactive shell features
- deep TLA+/TLC work
- over-ambitious LLM orchestration

This batch is about **finishing Step 1**, not starting the rest of the product early.

## Required assumptions

Implementing agents must assume:

- Batch 1, 2, and 3 decisions remain the foundation
- safe cleanup is still allowed, but only if it reduces risk
- prompt mode should reach trustworthy parity, not become overengineered
- `--llm-assist` should remain narrow and bounded
- the main goal is to freeze Step 1 with confidence

## Suggested reading order

1. `README.md`
2. `part-1-batch4-goal-finish-line-and-do-not-touch.md`
3. `part-2-prompt-mode-parity-and-input-hardening.md`
4. `part-3-edge-cases-warnings-failures-and-debug-outputs.md`
5. `part-4-step1-polish-test-hardening-and-freeze-criteria.md`
6. `part-5-step2-handoff-contract-for-plan.md`

Then implement in that order.

## What “done” means for Batch 4

Batch 4 is done when:

- Step 1 supports both spec and prompt input modes in a trustworthy way
- `--llm-assist` exists in a narrow V1 form
- edge-case handling is stable enough to trust the command
- output artifacts and debug artifacts are coherent
- tests protect the step strongly enough to stop active Step 1 development
- Step 1 can be treated as frozen except for future bug fixes

