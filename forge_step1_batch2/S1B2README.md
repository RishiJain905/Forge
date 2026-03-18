# Forge V1 — Step 1 Intake Implementation Spec (Batch 2)

## Purpose of Batch 2

Batch 2 defines the **internal implementation structure** for **Step 1: Intake**.

Batch 1 froze the behavior, contracts, outputs, and success model of Intake.
Batch 2 answers the next question:

> **How should Step 1 actually be structured and built inside the repository?**

This batch is intentionally:
- codebase-aware
- implementation-directive
- safe-refactor aware
- sequential
- test-aware

It is written so a coding agent or human engineer can implement or stabilize Step 1 with less ambiguity and less architectural drift.

---

## What this batch covers

This batch covers four major areas:

1. Intake internal architecture and module map
2. File-by-file responsibilities using real repo files
3. Sequential implementation/build order for Step 1 internals
4. Test strategy and acceptance gates

---

## What this batch does not cover

This batch does **not** redesign the public behavior of Step 1.
That was already locked in Batch 1.

This batch also does **not** plan Step 2 (`forge plan`) or any other later command.

---

## Required assumptions

Before using this batch, the implementing agent must assume:

- Forge V1 is local-first
- Step 1 must remain read-only outside `.forge/`
- Step 1 must support both spec mode and prompt mode
- Step 1 must produce both machine-readable and human-readable artifacts
- Step 1 must surface ambiguity rather than hide it
- deterministic logic is preferred, with optional LLM assistance only where justified
- any refactor allowed here must be safe structural cleanup only

---

## Safe structural cleanup policy

Batch 2 may allow small refactors only when they reduce future debugging risk.

Allowed examples:
- merging ultra-thin wrapper files
- moving duplicated logic into one obvious home
- clarifying one orchestrator entrypoint
- tightening import paths and file ownership
- collapsing files that are always edited together and have no meaningful independent role

Not allowed:
- rewriting Intake from scratch
- changing Step 1 behavior just for aesthetics
- renaming large parts of the system without benefit
- refactoring in ways that invalidate working tests
- moving logic across unrelated domains
- introducing abstraction layers that V1 does not need

Rule:
> prefer stability over elegance, unless the existing structure is clearly making V1 harder to build or debug

---

## How to use this batch

Suggested order:

1. Read this `README.md`
2. Read `part-1-intake-architecture-and-module-map.md`
3. Read `part-2-file-responsibilities-and-safe-refactor-rules.md`
4. Read `part-3-sequential-build-order.md`
5. Read `part-4-test-strategy-and-acceptance-gates.md`

Then implement in the order defined in Part 3.

---

## Batch 2 deliverable intent

By the end of Batch 2, Step 1 should have:

- one clear orchestration path
- stable internal module boundaries
- real file responsibilities mapped
- optional safe cleanups identified
- a clean build order
- tests aligned with the architecture
- clear acceptance gates for completion

---

## What “done” means for Batch 2

Batch 2 is done when:

- the internal structure of Step 1 is frozen well enough to build against
- file responsibilities are explicit
- any safe cleanup rules are explicit
- the build order is explicit
- the testing and acceptance bar is explicit

Once that is true, actual implementation work on Step 1 can proceed with much less ambiguity.
