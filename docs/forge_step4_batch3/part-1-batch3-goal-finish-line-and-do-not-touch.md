# Part 1 — Batch 3 Goal, Finish Line, and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Batch 3 and the boundaries that must not be crossed while finishing Step 4.

Batch 3 is not another exploratory split batch.
It is the batch that finishes Step 4 and establishes the freeze line.

## Why this matters

Without a finish-line document, a coding agent may:
- keep refining Step 4 forever
- expand into Step 5 too early
- overbuild regrouping behavior without stabilizing semantics
- reopen already-settled split architecture
- polish low-value areas instead of closing the right gaps

This file prevents that drift.

## Core Batch 3 mission

The mission of Batch 3 is:

> Finish Step 4 as a V1-complete split stage and freeze it except for future bug fixes.

This means Batch 3 must ensure:
- `forge split` is stable
- outputs are clean and honest
- warning/failure/readiness behavior is stable
- regrouping semantics are stable
- merge-order and blocking semantics are stable
- Step 5 can consume Step 4 output cleanly

## Finish-line definition

Step 4 should be considered finished for V1 when:

1. `forge split` works reliably
2. `.forge/split.json` is contract-stable
3. `.forge/reports/split-report.md` is useful and consistent
4. debug split artifacts can be emitted in a stable way
5. warning/failure/readiness behavior is predictable
6. aggressive regrouping remains auditable and traceable
7. merge-order, blocked, and partially blocked semantics are stable
8. tests are strong enough that only bug-fix work should remain
9. Step 5 can consume Step 4 output without guessing

## What Codex must build

Codex must build Batch 3 so that:
- Step 4 feels finished, not partial
- no major split contract ambiguity remains
- no essential split behavior depends on future steps
- the freeze line is explicit

## Required implementation tasks

1. close remaining Step 4 gaps
2. harden warnings, failures, readiness, and debug visibility
3. harden regrouping semantics
4. harden merge-order and blocking semantics
5. align outputs for clean Step 5 consumption
6. harden tests and freeze criteria

## Do not touch

### Do not touch later-step behavior
Do not implement or reshape:
- `forge execute`
- `forge integrate`

### Do not touch future-platform ideas
Do not add:
- interactive slash-command mode
- memory backends
- unrelated execution platform abstractions

### Do not reopen settled Step 4 architecture without necessity
Do not:
- rewrite the Step 4 orchestrator shape
- rename files for aesthetics only
- introduce large new abstractions
- destabilize grouping semantics with experimental regrouping logic

## Acceptance criteria

This part is complete when:
- Batch 3’s finish-line is explicit
- Step 4’s freeze goal is explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

