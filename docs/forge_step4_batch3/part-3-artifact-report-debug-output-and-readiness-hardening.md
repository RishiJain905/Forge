# Part 3 — Artifact, Report, Debug Output, and Readiness Hardening

## Purpose

This part hardens the actual outputs of Step 4:
- `.forge/split.json`
- `.forge/reports/split-report.md`
- debug split artifacts
- split readiness/status behavior for later steps

This is where Step 4 becomes stable to consume.

## Why this matters

A split stage is only useful if:
- its machine-readable artifact is stable
- its human-readable report is useful
- its debug outputs are inspectable
- its readiness/status signals actually help later stages decide what to do

This part makes the outputs strong enough to freeze.

# Artifact hardening

## Goal

Ensure `.forge/split.json` is stable and consistent.

## What Codex must build

Codex must ensure the split artifact consistently includes:
- metadata
- source verify reference
- workstreams
- stream categories
- stream dependencies
- merge-order expectations
- blocked items/streams
- carried-forward constraints/findings
- split readiness or status where applicable

## Required implementation tasks

1. audit current artifact-building code
2. ensure sections are consistently present when expected
3. ensure regrouping rationale remains visible
4. ensure blocked and merge-order information are clearly represented
5. ensure artifact shape is stable enough for Step 5 consumption

# Report hardening

## Goal

Ensure the split report is useful and consistent.

## What Codex must build

Codex must ensure the report clearly explains:
- what workstreams were created
- why work was grouped together
- which streams are serial, parallel-safe, protected, blocked, or partially blocked
- what merge order is required
- what constraints later steps must respect
- whether later steps can proceed and under what caution

## Required implementation tasks

1. audit report-generation quality
2. ensure report sections align with the machine-readable artifact
3. ensure warning-heavy split remains readable
4. ensure blocked and merge-order narratives are understandable
5. ensure regrouping rationale is visible without clutter

# Debug-output hardening

## Goal

Provide stable debug artifacts for split inspection.

## What Codex must build

Codex must ensure debug outputs can be emitted for:
- workstreams
- merge order
- blocked items
- stream constraints

Suggested debug files:
- `.forge/debug/workstreams.json`
- `.forge/debug/merge-order.json`
- `.forge/debug/blocked-items.json`
- `.forge/debug/stream-constraints.json`

These should be present and useful, not treated as optional afterthoughts.

## Required implementation tasks

1. define when debug files are emitted
2. ensure they do not replace core outputs
3. ensure they help explain what split actually did
4. ensure warning/failure runs can still emit useful debug information where appropriate

# Readiness and status hardening

## Goal

Make Step 4’s readiness/status model strong enough for later stages.

## What Codex must build

Codex must ensure Step 4 can clearly communicate:
- success
- success with warnings
- failure
- whether blocked streams exist
- whether merge-order constraints materially limit execution
- whether later steps can proceed and under what caution

## Required implementation tasks

1. define or stabilize the split readiness/status model in code
2. ensure it reflects prior-step concerns and Step 4-specific issues
3. ensure readiness/status appears in the artifact/report clearly
4. ensure later-step consumption can use it without guessing

## Inputs
- resolved Step 4 split data
- carried-forward Step 3 readiness/confidence context

## Outputs
- stable split artifact
- stable split report
- stable debug outputs
- real readiness/status information

## Edge cases
- split succeeds with warnings
- blocked streams exist but non-blocked work can still proceed
- merge-order constraints materially narrow execution options
- debug output exists without cluttering primary output
- readiness is usable but cautious

## Acceptance criteria

- artifact/report/debug outputs are coherent
- readiness/status is meaningful
- Step 5 would not need to reinterpret split quality from scratch

## Guardrails

- do not let the report become the primary truth
- do not let debug outputs sprawl into noise
- do not fake readiness confidence where uncertainty remains

