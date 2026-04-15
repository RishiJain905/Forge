# Part 1 — Batch 2 Goal and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Step 4 Batch 2 and the boundaries that must not be crossed while implementing it.

Batch 2 is where Step 4 stops being just a contract and starts becoming a real runnable split stage.

## Why this matters

Without a clear mission, Batch 2 could drift into:
- Step 5 execution behavior
- vague stream grouping with weak safety guarantees
- overaggressive regrouping that harms traceability
- hiding blocked work
- broad refactors that are hard to debug

This file prevents that drift.

## Core Batch 2 mission

The mission of Batch 2 is:

> Make `forge split` run through the real Step 4 pipeline and produce usable split outputs.

This includes:
- reading Step 3 artifact input
- constructing workstreams
- assigning stream categories
- applying safety and verification constraints
- deriving merge-order expectations
- identifying blocked items and streams
- generating the split artifact
- generating the split report
- persisting outputs
- returning a stable command result

## Priority order for Batch 2

### Highest priority
- verify-artifact consumption
- workstream construction
- stream categories and safety application
- merge-order and blocking logic
- machine-readable artifact generation
- human-readable split report
- stable split orchestration
- real tests for implemented behavior

### Medium priority
- optional lightweight debug artifacts
- safe cleanup of thin/duplicated code
- more aggressive regrouping where clearly justified

### Lower priority
- broad polish for every edge case
- freeze-quality hardening
- future execution concerns

## What Codex must build

Codex must build Batch 2 so that:
- Step 4 internals are materially real, not placeholder-heavy
- `forge split` has one clear orchestration path
- workstreams are inspectable
- stream categories are meaningful
- merge-order and blocking are explicit
- outputs are real and usable by humans and later steps

## Required implementation tasks

1. align current Step 4 code with the locked split contract
2. ensure one real orchestration path exists
3. build workstream construction first
4. stabilize stream categorization and safety application
5. implement merge-order and blocking logic
6. build real artifact/report output
7. wire the command and harden with tests

## What must not happen in Batch 2

- do not implement actual execution logic
- do not create code-edit prompts/packets
- do not modify code as part of splitting
- do not ignore verification constraints
- do not redesign Step 4 architecture without strong reason

## Required code surfaces

Expected main code surfaces touched in this batch:
- Step 4 shared types/contracts
- Step 3 artifact consumption layer
- workstream construction
- stream-category logic
- merge-order logic
- blocking logic
- carried-constraint logic
- artifact/report builders
- persistence
- Step 4 runner/orchestrator
- CLI wiring
- Step 4 tests

## Acceptance criteria

This part is complete when:
- Batch 2’s mission is explicit
- priorities are explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

