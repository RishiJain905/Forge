# Part 5 — First Build Order and Acceptance Gates

## Purpose

This file defines the first implementation order for Step 2 and the acceptance gates for this first planning batch.

The goal is to keep Step 2 build work disciplined and avoid mixing everything at once.

## Why this matters

Without a build order, Step 2 implementation may:
- start with reports before plan structure exists
- wire the CLI before artifacts are stable
- invent dependencies before plan items are modeled
- ignore carried-forward Step 1 signals until too late

This file prevents that.

## Recommended first build order

### Stage 0 — Freeze Step 2 contract
Before deep coding:
- freeze Batch 1 Step 2 behavior
- freeze required outputs
- freeze main sections of `plan.json`

### Stage 1 — Stabilize planning types/contracts
Create or stabilize the shared types for:
- plan artifact
- plan item
- dependency relationships
- conflict zones
- test obligations
- parallelization signals
- carried-forward ambiguity/warning sections

### Stage 2 — Intake consumption layer
Implement the logic that reads and validates Step 1 artifact input cleanly.

### Stage 3 — Plan-item construction
Implement deterministic decomposition from Intake outputs into structured plan items.

### Stage 4 — Dependency and conflict analysis
Implement dependency mapping and conflict-zone detection.

### Stage 5 — Test obligations, parallelization, and carry-forward logic
Attach validation expectations, parallelization signals, and preserved ambiguity/warning data.

### Stage 6 — Artifact assembly
Build `.forge/plan.json`.

### Stage 7 — Report generation
Build `.forge/reports/plan-report.md`.

### Stage 8 — Persistence and command wiring
Persist outputs and wire `forge plan` to the Step 2 path.

### Stage 9 — Tests
Harden tests around the implemented planning flow.

## Acceptance gates

### Gate 1 — Contract gate
Must be true:
- Step 2 input/output contract is stable
- main artifact sections are stable

### Gate 2 — Plan-item gate
Must be true:
- plan items are structured and deterministic
- dependencies are explicit enough to inspect

### Gate 3 — Risk/carry-forward gate
Must be true:
- conflict zones exist
- ambiguities/warnings from Step 1 are preserved honestly
- test obligations and parallelization signals are attached

### Gate 4 — Output gate
Must be true:
- `plan.json` is coherent
- `plan-report.md` is coherent
- artifact and report tell the same story

### Gate 5 — Runnable gate
Must be true:
- `forge plan` can run from Step 1 output
- outputs are written to `.forge/`
- the implemented path is test-protected enough to continue

## What Codex must build

Codex must implement Step 2 in the staged order above and avoid skipping foundational stages.

Do not:
- start with report polish
- start with CLI UX
- implement future splitting logic directly
- hide weak plan structure behind prose

## Acceptance criteria

This part is complete when:
- the first build order is explicit
- acceptance gates are explicit
- implementation can proceed in order without reopening Batch 1 questions

