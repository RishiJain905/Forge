# Part 4 — Stage 5: Artifacts, Report, Debug Outputs, and Readiness

## Purpose

This part covers the outputs that make Split usable:
- `.forge/split.json`
- `.forge/reports/split-report.md`
- optional debug split artifacts
- split readiness/status behavior

This is where split becomes a real product output.

## Why this matters

A split stage is only useful if:
- its workstreams are inspectable
- merge-order and blocking are clear
- its artifact is stable enough for later steps
- its report is useful for humans
- debug outputs can explain what split actually did

This part gives Step 4 that shape.

# Artifact generation

## Goal

Generate a stable Step 4 artifact that captures workstreams and safety honestly.

## What Codex must build

Codex must ensure `.forge/split.json` can consistently include:
- metadata
- source verify reference
- workstreams
- stream categories
- stream dependencies
- merge-order expectations
- blocked items/streams
- carried-forward constraints/findings
- split readiness/status

## Required implementation tasks

1. audit any current artifact-building code for Step 4
2. ensure workstreams, categories, merge order, and blocked work have distinct homes
3. ensure carried constraints remain visible
4. ensure artifact shape is stable enough for later-step consumption

# Report generation

## Goal

Ensure the split report is useful and consistent.

## What Codex must build

Codex must ensure the report clearly explains:
- what workstreams were created
- why work was grouped together
- which streams are serial, parallel-safe, protected, or blocked
- what merge order is required
- what constraints later steps must respect
- whether later steps can proceed and under what caution

## Required implementation tasks

1. audit report-generation quality
2. ensure report sections align with the artifact
3. ensure warning-heavy split remains readable
4. ensure blocked work and merge-order logic are distinguishable in the report

# Debug-output generation

## Goal

Provide stable optional debug artifacts for split inspection.

## What Codex must build

Codex must ensure optional debug outputs can be emitted for:
- workstreams
- merge order
- blocked items
- stream constraints

Suggested debug files:
- `.forge/debug/workstreams.json`
- `.forge/debug/merge-order.json`
- `.forge/debug/blocked-items.json`
- `.forge/debug/stream-constraints.json`

## Required implementation tasks

1. define when debug files are emitted
2. ensure they do not replace core outputs
3. ensure they help explain what split actually did
4. ensure warning/failure runs can still emit useful debug information where appropriate

# Readiness and status

## Goal

Make Step 4’s readiness/status model meaningful for later stages.

## What Codex must build

Codex must ensure Step 4 can communicate:
- whether splitting can proceed
- whether blocked streams exist
- whether merge-order constraints materially limit execution
- whether later steps can proceed and under what caution

## Required implementation tasks

1. define the split readiness/status model in code
2. ensure it reflects prior-step concerns and Step 4-specific issues
3. ensure readiness/status appears in the artifact/report clearly
4. ensure later-step consumption can use it without guessing

## Inputs
- final resolved Step 4 split data

## Outputs
- split artifact object
- split report string
- optional debug artifacts
- split readiness/status information

## Edge cases
- split succeeds with warnings
- blocked streams exist but non-blocked work can still proceed
- merge-order constraints materially narrow execution options
- debug output exists without cluttering primary output

## Acceptance criteria
- `split.json` is coherent and usable
- `split-report.md` is coherent and readable
- debug outputs help inspection without replacing core outputs
- readiness/status is meaningful

## Guardrails
- do not let the report become the primary truth
- do not let debug outputs sprawl into core UX
- do not fake readiness confidence where uncertainty remains

