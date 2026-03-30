# Part 1 — Batch 3 Goal, Finish Line, and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Batch 3 and the boundaries that must not be crossed while finishing Step 3.

Batch 3 is not another exploratory verification batch.
It is the batch that finishes Step 3 and establishes the freeze line.

## Why this matters

Without a finish-line document, a coding agent may:
- keep refining Step 3 forever
- expand into Step 4 too early
- overbuild formal coverage without stabilizing semantics
- reopen already-settled verification architecture
- polish low-value areas instead of closing the right gaps

This file prevents that drift.

## Core Batch 3 mission

The mission of Batch 3 is:

> Finish Step 3 as a V1-complete verification stage and freeze it except for future bug fixes.

This means Batch 3 must ensure:
- `forge verify` is stable
- outputs are clean and honest
- warning/failure/readiness behavior is stable
- TLC result semantics are stable
- Tier 2 formal cases are implemented
- Step 4 can consume Step 3 output cleanly

## Finish-line definition

Step 3 should be considered finished for V1 when:

1. `forge verify` works reliably
2. `.forge/verify.json` is contract-stable
3. `.forge/reports/verify-report.md` is useful and consistent
4. optional debug verification artifacts can be emitted in a stable way
5. warning/failure/readiness behavior is predictable
6. TLC pass/fail/error/partial semantics are stable
7. Tier 1 and Tier 2 formal cases give meaningful V1 coverage
8. tests are strong enough that only bug-fix work should remain
9. Step 4 can consume Step 3 output without guessing

## What Codex must build

Codex must build Batch 3 so that:
- Step 3 feels finished, not partial
- no major verification contract ambiguity remains
- no essential verification behavior depends on future steps
- the freeze line is explicit

## Required implementation tasks

1. close remaining Step 3 gaps
2. harden warnings, failures, readiness, and debug visibility
3. harden TLC semantics and trace handling
4. implement Tier 2 formal coverage
5. align outputs for clean Step 4 consumption
6. harden tests and freeze criteria

## Do not touch

### Do not touch later-step behavior
Do not implement or reshape:
- `forge split`
- `forge execute`
- `forge integrate`

### Do not touch future-platform ideas
Do not add:
- interactive slash-command mode
- memory backends
- provider-specific execution platforms unrelated to verification

### Do not reopen settled Step 3 architecture without necessity
Do not:
- rewrite the Step 3 orchestrator shape
- rename files for aesthetics only
- introduce large new abstractions
- turn verification into a fuzzy reasoning platform

## Acceptance criteria

This part is complete when:
- Batch 3’s finish-line is explicit
- Step 3’s freeze goal is explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

