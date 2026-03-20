# Part 1 — Batch 4 Goal, Finish Line, and Do-Not-Touch Boundaries

## Purpose

This file defines the exact mission of Batch 4 and the boundaries that must not be crossed while finishing Step 1.

Batch 4 is not another exploratory architecture batch.
It is the batch that finishes Step 1 and establishes the freeze line.

## Why this matters

Without a finish-line document, a coding agent may:
- keep reworking Step 1 endlessly
- expand into Step 2 too early
- overbuild prompt mode
- overbuild `--llm-assist`
- reopen already-settled architecture

This file prevents that drift.

## Core Batch 4 mission

The mission of Batch 4 is:

> **Finish Step 1 as a V1-complete Intake stage and freeze it except for future bug fixes.**

This means Batch 4 must ensure:
- spec mode is solid
- prompt mode reaches basic trustworthy parity
- failure/warning behavior is stable
- debug artifacts are usable
- `--llm-assist` exists in bounded V1 form
- Step 1 outputs are clean enough for Step 2

## Finish-line definition

Step 1 should be considered finished for V1 when:

1. `forge intake --spec <file>` works reliably
2. `forge intake --prompt "<task>"` works reliably at a basic parity level
3. `.forge/intake.json` is contract-stable
4. `.forge/reports/intake-report.md` is useful and consistent
5. optional debug artifacts can be emitted in a stable way
6. warning/failure behavior is predictable
7. tests are strong enough that only bug-fix work should remain
8. Step 2 can consume Step 1 output without guessing

## What Codex must build

Codex must build Batch 4 so that:
- Step 1 feels finished, not partially implemented
- no major Step 1 contract ambiguity remains
- no essential Step 1 behavior depends on future steps
- the freeze line is explicit

## Required implementation tasks

1. close remaining Step 1 gaps, especially prompt mode
2. harden warnings, failures, and debug visibility
3. implement a narrow V1 `--llm-assist`
4. align outputs for clean Step 2 consumption
5. harden tests and freeze criteria

## Do not touch

### Do not touch later-step behavior
Do not implement or reshape:
- `forge plan`
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

### Do not reopen settled Step 1 architecture without necessity
Do not:
- rewrite the Step 1 orchestrator shape
- rename files for aesthetics only
- introduce large new abstractions
- expand Step 1 into a plugin platform

## Acceptance criteria

This part is complete when:
- Batch 4’s finish-line is explicit
- Step 1’s freeze goal is explicit
- do-not-touch boundaries are explicit
- implementation work can proceed without scope confusion

