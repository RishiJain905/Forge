# Part 1 — Step 1 Batch 3 Goal and Boundaries

## Purpose

This file defines the exact mission of Batch 3 and the boundaries that must not be crossed while implementing it.

Batch 3 is where Step 1 stops being planned architecture and starts becoming a real runnable command path.

---

## Why this matters

Without a tight boundary, Batch 3 could easily drift into:
- building half of Step 2
- over-polishing prompt mode before spec mode works
- rewriting architecture that is already good enough
- chasing edge cases before the happy path is real
- adding features that belong to future versions

This part exists to prevent that.

---

## Core Batch 3 mission

The mission of Batch 3 is:

> **Make `forge intake --spec <file>` run through the real Step 1 pipeline and produce usable outputs.**

This includes:
- resolving input
- parsing the spec
- scanning the repo
- deriving candidates/analysis
- generating the artifact
- generating the report
- persisting outputs
- returning a stable command result

---

## Priority order for Batch 3

### Highest priority
- spec-mode end-to-end path
- real artifact generation
- real report generation
- stable orchestration path
- real tests for implemented behavior

### Medium priority
- prompt mode does not regress
- safe cleanup of thin/duplicated code
- stronger internal type alignment

### Lower priority
- polishing optional LLM-assisted behavior
- broader edge-case completeness
- final UX niceties

---

## What Codex must build

Codex must build Batch 3 so that:
- Step 1’s internals are materially real, not mostly placeholders
- the orchestrator calls real services in the correct order
- spec mode is the main proven runnable path
- artifact/report output is not mocked or vague
- tests cover the implemented flow meaningfully

---

## Required implementation tasks

1. Align the current code with the locked Step 1 contracts.
2. Ensure one real orchestration path exists.
3. Make spec mode the first reliable end-to-end route.
4. Stabilize artifact generation and report generation.
5. Ensure outputs are persisted under `.forge/`.
6. Harden the implemented path with tests.

---

## What must not happen in Batch 3

- do not expand into later-step planning behavior
- do not add interactive shell mode
- do not build memory backend infrastructure
- do not begin TLA+ integration
- do not perform large aesthetic refactors
- do not rewrite working code without a strong reason

---

## Required code surfaces

Expected main code surfaces touched in this batch:
- Step 1 shared types/contracts
- input resolution
- task parsing
- repo context detection
- candidate/analysis/confidence logic
- artifact/report builders
- persistence
- runner/orchestrator
- CLI wiring
- Step 1 tests

---

## Acceptance criteria

This part is complete when:
- the Batch 3 mission is explicit
- priorities are explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without confusion about scope
