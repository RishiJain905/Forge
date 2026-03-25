# Forge V1 — Step 2 Plan Implementation Spec (Batch 3)

## Purpose of Batch 3

Batch 3 is the finish-and-freeze batch for Step 2: Plan.

Batch 1 froze the Step 2 contract.
Batch 2 made `forge plan` materially real and partially runnable.
Batch 3 exists to finish Step 2 to a V1-complete level and freeze it except for future bug fixes.

This batch focuses on:
- planning edge cases
- warning/failure hardening
- planning-assist hardening
- artifact/report/debug-output polish
- stronger readiness/status behavior
- stronger tests
- a clean handoff contract into Step 3 (`forge verify`)

## Batch 3 target milestone

The primary milestone for this batch is:

> **Milestone C: Step 2 is freeze-ready except for future bug fixes, and its handoff to Step 3 is clearly defined.**

That means by the end of this batch:
- Step 2 should feel finished for V1
- later verification work should not need to guess what planning meant
- future Step 2 work should mostly be bug fixes, not active feature building

## What Batch 3 must achieve

By the end of Batch 3, Step 2 should provide:
- stable machine-readable planning output
- stable human-readable planning report
- stable optional debug planning artifacts
- stable warning/failure/readiness behavior
- stable carried-forward ambiguity/confidence handling
- a narrow but hardened planning-assist path
- tests strong enough to freeze Step 2
- a clean handoff contract for Step 3 Verify

## What Batch 3 must not become

Batch 3 must not drift into:
- actual verification implementation
- state-machine/TLA+ behavior
- workstream splitting
- execution-packet generation
- interactive shell features
- memory backend ideas
- architecture redesign for aesthetics

This batch is about finishing Step 2, not starting Step 3 early.

## Required assumptions

Implementing agents must assume:
- Step 1 is frozen enough to trust
- Step 2 Batch 1 and Batch 2 decisions remain the foundation
- planning stays deterministic-first
- planning-assist remains narrow and bounded
- the goal is to freeze Step 2 with confidence

## Suggested reading order

1. `README.md`
2. `part-1-batch3-goal-finish-line-and-do-not-touch.md`
3. `part-2-edge-cases-warnings-failures-and-planning-assist-hardening.md`
4. `part-3-artifact-report-debug-output-and-readiness-hardening.md`
5. `part-4-step2-polish-test-hardening-and-freeze-criteria.md`
6. `part-5-step3-handoff-contract-for-verify.md`

Then implement in that order.

## What “done” means for Batch 3

Batch 3 is done when:
- Step 2 planning outputs are stable and trustworthy
- warnings/failures/readiness are coherent
- optional debug outputs are coherent
- the planning-assist path is narrow but real and hardened
- tests protect the step strongly enough to stop active Step 2 development
- Step 2 can be treated as frozen except for future bug fixes

