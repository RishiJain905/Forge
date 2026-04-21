# Forge V1 — Step 3 Verify Implementation Spec (Batch 3)

## Purpose of Batch 3

Batch 3 is the finish-and-freeze batch for Step 3: Verify.

Batch 1 froze the verification contract and the requirement that real TLA+/TLC begins in V1.
Batch 2 made `forge verify` materially real and partially runnable, including the first high-value formal subset.
Batch 3 exists to finish Step 3 to a V1-complete level and freeze it except for future bug fixes.

This batch focuses on:
- Tier 2 formal-case expansion
- TLC output and trace hardening
- warning/failure/readiness hardening
- artifact/report/debug-output polish
- stronger tests
- a clean handoff contract into Step 4 (`forge split`)

## Batch 3 target milestone

The primary milestone for this batch is:

> Milestone C: Step 3 is freeze-ready except for future bug fixes, and its handoff to Step 4 is clearly defined.

That means by the end of this batch:
- Step 3 should feel finished for V1
- later split work should not need to guess what verification means
- future Step 3 work should mostly be bug fixes, not active feature building

## What Batch 3 must achieve

By the end of Batch 3, Step 3 should provide:
- stable machine-readable verification output
- stable human-readable verification report
- stable optional debug verification artifacts
- stable warning/failure/readiness behavior
- stable carried-forward ambiguity/confidence handling
- a hardened TLC result model
- Tier 2 formal cases implemented as real verification coverage
- tests strong enough to freeze Step 3
- a clean handoff contract for Step 4 Split

## Tier 2 formal expansion requirement

Batch 3 must implement the previously locked Tier 2 formal cases:
- multi-agent handoff chains
- queue / claim-release lifecycle
- merge-order safety across shared artifacts
- parallel overlap with shared resource mutation
- failure-recovery state loops

These are not optional stretch goals.
They are required V1 formal expansion cases.

Batch 3 may broaden somewhat beyond them where it is clearly justified, but it must not dilute implementation quality by expanding too broadly too early.

## What Batch 3 must not become

Batch 3 must not drift into:
- actual split implementation
- execution-packet generation
- interactive shell features
- memory backend ideas
- architecture redesign for aesthetics
- broad formal modeling of unrelated business logic

This batch is about finishing Step 3, not starting Step 4 early.

## Required assumptions

Implementing agents must assume:
- Step 2 is frozen enough to trust
- Step 3 Batch 1 and Batch 2 decisions remain the foundation
- verification stays deterministic-first
- TLA+/TLC remain core and real in V1
- the goal is to freeze Step 3 with confidence

## Suggested reading order

1. `README.md`
2. `part-1-batch3-goal-finish-line-and-do-not-touch.md`
3. `part-2-tier2-formal-case-expansion-and-tlc-hardening.md`
4. `part-3-artifact-report-debug-output-and-readiness-hardening.md`
5. `part-4-step3-polish-test-hardening-and-freeze-criteria.md`
6. `part-5-step4-handoff-contract-for-split.md`

Then implement in that order.

## What done means for Batch 3

Batch 3 is done when:
- Step 3 verification outputs are stable and trustworthy
- Tier 2 formal cases are materially implemented
- TLC semantics and trace handling are coherent
- warnings/failures/readiness are coherent
- optional debug outputs are coherent
- tests protect the step strongly enough to stop active Step 3 development
- Step 3 can be treated as frozen except for future bug fixes

