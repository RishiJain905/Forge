# Part 1 — Batch 2 Goal and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Step 3 Batch 2 and the boundaries that must not be crossed while implementing it.

Batch 2 is where Step 3 stops being just a contract and starts becoming a real runnable verification stage.

## Why this matters

Without a clear mission, Batch 2 could drift into:
- Step 4 split behavior
- broad execution logic
- vague reasoning about plans instead of actual verification
- overbroad TLA+ ambitions that slow V1
- formal scaffolding without real TLC use

This file prevents that drift.

## Core Batch 2 mission

The mission of Batch 2 is:

> Make `forge verify` run through the real Step 3 pipeline and produce usable verification outputs.

This includes:
- reading Step 2 artifact input
- constructing verification targets and cases
- running structural verification
- building state models
- generating real TLA+ specs
- running real TLC for the selected high-value subset
- generating the verification artifact
- generating the verification report
- persisting outputs
- returning a stable command result

## Priority order for Batch 2

### Highest priority
- verification target/case construction
- structural verification lane
- formal lane foundations
- real TLA+ generation
- real TLC execution for the chosen subset
- machine-readable artifact generation
- human-readable verification report
- stable verification orchestration
- real tests for implemented behavior

### Medium priority
- optional lightweight debug artifacts
- safe cleanup of thin/duplicated code

### Lower priority
- broad polish for every edge case
- freeze-quality hardening
- expanding formal coverage too widely

## What Codex must build

Codex must build Batch 2 so that:
- Step 3 internals are materially real, not placeholder-heavy
- `forge verify` has one clear orchestration path
- verification targets/cases are inspectable
- structural and formal results are distinct and meaningful
- TLA+ specs are truly generated
- TLC is truly executed for the first high-value subset
- outputs are real and usable by humans and later steps

## Required implementation tasks

1. align current Step 3 code with the locked verification contract
2. ensure one real orchestration path exists
3. build verification target/case construction first
4. stabilize structural verification
5. implement formal lane foundations with real TLA+ and TLC
6. build real artifact/report output
7. wire the command and harden with tests

## What must not happen in Batch 2

- do not implement Step 4 split/workstream logic
- do not create execution prompts/packets
- do not modify code as part of verification
- do not make verification dependent on fuzzy reasoning
- do not reduce TLA+/TLC to fake placeholders
- do not redesign Step 3 architecture without strong reason

## Required code surfaces

Expected main code surfaces touched in this batch:
- Step 3 shared types/contracts
- Step 2 artifact consumption layer
- verification target/case construction
- structural verification logic
- formal lane state-model logic
- TLA+ generation
- TLC runner/adapter
- findings and result modeling
- artifact/report builders
- persistence
- Step 3 runner/orchestrator
- CLI wiring
- Step 3 tests

## Acceptance criteria

This part is complete when:
- Batch 2’s mission is explicit
- priorities are explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

