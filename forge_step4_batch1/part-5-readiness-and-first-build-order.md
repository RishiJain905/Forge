# Part 5 — Readiness and First Build Order

## Purpose

This file defines:
- how Step 4 readiness/status should work
- the first implementation order for Step 4
- the acceptance gates for this first split batch

The goal is to keep Step 4 build work disciplined and prevent unsafe or premature stream generation.

## Why this matters

Without a build order, Step 4 implementation may:
- start with reports before workstream semantics exist
- wire the CLI before split artifacts are stable
- group work before constraints are modeled
- underuse verification findings until too late

This file prevents that.

## Split readiness/status intent

Step 4 should communicate:
- whether splitting can proceed
- whether all items were safely assigned
- whether blocked streams exist
- whether merge-order constraints were imposed
- whether later execution can proceed and under what caution

This does not need to become a giant rules engine, but it must be real and useful.

## Recommended first build order

### Stage 0 — Freeze Step 4 contract
Before deep coding:
- freeze Batch 1 Step 4 behavior
- freeze required outputs
- freeze the workstream model
- freeze stream categories
- freeze carry-forward and merge-order rules

### Stage 1 — Stabilize Step 4 types/contracts
Create or stabilize shared types for:
- split artifact
- workstream
- stream categories
- stream dependencies
- merge-order rules
- blocked items/streams
- carried-forward constraint sections
- split readiness/status

### Stage 2 — Verify consumption layer
Implement the logic that reads and validates Step 3 artifact input cleanly.

### Stage 3 — Workstream construction
Implement deterministic grouping from verified plan items into structured workstreams.

### Stage 4 — Safety/constraint application
Apply stream categories, merge-order rules, and blocking rules from prior-step constraints.

### Stage 5 — Artifact and report assembly
Build `.forge/split.json` and `.forge/reports/split-report.md`.

### Stage 6 — Persistence and command wiring
Persist outputs and wire `forge split` to the Step 4 path.

### Stage 7 — Tests
Harden tests around the implemented split flow.

## Acceptance gates

### Gate 1 — Contract gate
Must be true:
- Step 4 input/output contract is stable
- workstream model is stable
- stream categories are stable

### Gate 2 — Safety gate
Must be true:
- carry-forward constraints are preserved
- merge-order expectations are explicit
- blocked work is explicit

### Gate 3 — Output gate
Must be true:
- `split.json` is coherent
- `split-report.md` is coherent
- artifact and report tell the same story

### Gate 4 — Runnable gate
Must be true:
- `forge split` can run from Step 3 output once implemented
- outputs are written to `.forge/`
- the implemented path is test-protected enough to continue

## What Codex must build

Codex must implement Step 4 in the staged order above and avoid skipping foundational stages.

Do not:
- start with report polish
- start with CLI UX
- aggressively regroup work before constraints are modeled
- hide blocked work behind prose

## Acceptance criteria

This part is complete when:
- readiness/status intent is explicit
- the first build order is explicit
- acceptance gates are explicit
- implementation can proceed in order without reopening Batch 1 questions

