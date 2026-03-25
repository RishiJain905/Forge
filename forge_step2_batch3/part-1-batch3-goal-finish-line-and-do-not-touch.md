# Part 1 — Batch 3 Goal, Finish Line, and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Batch 3 and the boundaries that must not be crossed while finishing Step 2.

Batch 3 is not another exploratory planning batch.
It is the batch that finishes Step 2 and establishes the freeze line.

## Why this matters

Without a finish-line document, a coding agent may:
- keep refining Step 2 forever
- expand into Step 3 verification too early
- overbuild planning-assist
- reopen already-settled planning architecture
- polish low-value areas instead of closing the right gaps

This file prevents that drift.

## Core Batch 3 mission

The mission of Batch 3 is:

> Finish Step 2 as a V1-complete planning stage and freeze it except for future bug fixes.

This means Batch 3 must ensure:
- `forge plan` is stable
- outputs are clean and honest
- warning/failure/readiness behavior is stable
- planning-assist remains bounded and hardened
- Step 3 can consume Step 2 output cleanly

## Finish-line definition

Step 2 should be considered finished for V1 when:

1. `forge plan` works reliably
2. `.forge/plan.json` is contract-stable
3. `.forge/reports/plan-report.md` is useful and consistent
4. optional debug planning artifacts can be emitted in a stable way
5. warning/failure/readiness behavior is predictable
6. test obligations and parallelization categories are stable enough for later steps
7. tests are strong enough that only bug-fix work should remain
8. Step 3 can consume Step 2 output without guessing

## What Codex must build

Codex must build Batch 3 so that:
- Step 2 feels finished, not partial
- no major planning contract ambiguity remains
- no essential planning behavior depends on future steps
- the freeze line is explicit

## Required implementation tasks

1. close remaining Step 2 gaps
2. harden warnings, failures, readiness, and debug visibility
3. harden the bounded planning-assist path
4. align outputs for clean Step 3 consumption
5. harden tests and freeze criteria

## Do not touch

### Do not touch later-step behavior
Do not implement or reshape:
- `forge verify`
- `forge split`
- `forge execute`
- `forge integrate`

### Do not touch future-platform ideas
Do not add:
- interactive slash-command mode
- memory backends
- OpenViking / Mem0 integration
- TLA+ / TLC systems
- provider-specific execution platforms

### Do not reopen settled Step 2 architecture without necessity
Do not:
- rewrite the Step 2 orchestrator shape
- rename files for aesthetics only
- introduce large new abstractions
- turn planning into a fuzzy agent platform

## Acceptance criteria

This part is complete when:
- Batch 3’s finish-line is explicit
- Step 2’s freeze goal is explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

