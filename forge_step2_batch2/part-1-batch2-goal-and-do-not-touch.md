# Part 1 — Batch 2 Goal and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Step 2 Batch 2 and the boundaries that must not be crossed while implementing it.

Batch 2 is where Step 2 stops being just a contract and starts becoming a real runnable planning stage.

## Why this matters

Without a clear mission, Batch 2 could drift into:
- Step 3 verification behavior
- Step 4 split behavior
- execution packet generation
- freeform agent brainstorming instead of structured planning
- broad refactors that are hard to debug

This file prevents that drift.

## Core Batch 2 mission

The mission of Batch 2 is:

> Make `forge plan` run through the real Step 2 pipeline and produce usable planning outputs.

This includes:
- reading Step 1 artifact input
- constructing plan items
- deriving dependencies
- identifying conflict zones
- assigning test obligations
- attaching strong parallelization categories
- carrying forward ambiguities/warnings
- generating the plan artifact
- generating the planning report
- persisting outputs
- returning a stable command result

## Priority order for Batch 2

### Highest priority
- plan-item construction
- dependency/conflict analysis
- machine-readable artifact generation
- human-readable planning report
- stable planning orchestration
- real tests for implemented behavior

### Medium priority
- bounded planning-assist hook
- optional lightweight debug artifacts
- safe cleanup of thin/duplicated code

### Lower priority
- broader polish for all edge cases
- freeze-quality hardening
- future-step refinements

## What Codex must build

Codex must build Batch 2 so that:
- Step 2 internals are materially real, not placeholder-heavy
- `forge plan` has one clear orchestration path
- plan items, dependencies, and conflict zones are inspectable
- test obligations and parallelization categories are meaningful
- outputs are real and usable by humans and later steps

## Required implementation tasks

1. align current Step 2 code with the locked planning contract
2. ensure one real orchestration path exists
3. build plan-item construction first
4. stabilize dependencies/conflict analysis
5. build real artifact/report output
6. wire the command and harden with tests

## What must not happen in Batch 2

- do not implement actual verification logic
- do not implement actual split/workstream logic
- do not create execution prompts/packets
- do not modify code as part of planning
- do not make planning dependent on heavy LLM reasoning
- do not redesign Step 2 architecture without strong reason

## Required code surfaces

Expected main code surfaces touched in this batch:
- Step 2 shared types/contracts
- Step 1 artifact consumption layer
- plan-item construction
- dependency/conflict analysis
- test-obligation logic
- parallelization categorization
- carry-forward logic
- artifact/report builders
- persistence
- Step 2 runner/orchestrator
- CLI wiring
- Step 2 tests

## Acceptance criteria

This part is complete when:
- Batch 2’s mission is explicit
- priorities are explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

