# Part 3 — Artifact, Report, Debug Output, and Readiness Hardening

## Purpose

This part hardens the actual outputs of Step 2:
- `.forge/plan.json`
- `.forge/reports/plan-report.md`
- optional debug planning artifacts
- planning readiness/status behavior for later steps

This is where Step 2 stops merely running and starts becoming stable to consume.

## Why this matters

A planning stage is only useful if:
- its machine-readable artifact is stable
- its human-readable report is useful
- its optional debug outputs are inspectable
- its readiness/status signals actually help later stages decide what to do

This part makes the outputs strong enough to freeze.

# Artifact hardening

## Goal

Ensure `.forge/plan.json` is stable and consistent.

## What Codex must build

Codex must ensure the planning artifact consistently includes:
- metadata
- source intake reference
- plan items
- dependencies
- conflict zones
- test obligations
- parallelization categories
- carried-forward ambiguity/warnings/confidence
- planning readiness or status where applicable

## Required implementation tasks

1. audit current artifact-building code
2. ensure sections are consistently present when expected
3. ensure artifact structure is deterministic-first
4. ensure carried-forward context is preserved honestly
5. ensure artifact shape is stable enough for Step 3 consumption

# Report hardening

## Goal

Ensure the planning report is useful and consistent.

## What Codex must build

Codex must ensure the report clearly explains:
- what the planner believes must be done
- dependency order
- shared-risk/conflict areas
- testing expectations
- parallelization guidance
- unresolved ambiguity
- readiness/warning/failure state

## Required implementation tasks

1. audit report-generation quality
2. ensure report sections align with the machine-readable artifact
3. ensure warning-heavy plans are still readable
4. ensure report helps a human understand why later steps may or may not proceed

# Debug-output hardening

## Goal

Provide stable optional debug artifacts for planning inspection.

## What Codex must build

Codex must ensure optional debug outputs can be emitted for:
- plan items
- dependencies
- conflict zones
- test obligations
- optionally readiness/status diagnostics if useful

Suggested debug files:
- `.forge/debug/plan-items.json`
- `.forge/debug/dependencies.json`
- `.forge/debug/conflict-zones.json`
- `.forge/debug/test-obligations.json`

## Required implementation tasks

1. define when debug files are emitted
2. ensure they do not replace core outputs
3. ensure they are useful for debugging rather than noisy dumps
4. ensure warning/failure runs can still emit useful debug artifacts where appropriate

# Readiness and status hardening

## Goal

Make Step 2’s readiness/status model strong enough for later stages.

## What Codex must build

Codex must ensure Step 2 can communicate:
- whether the plan is usable
- whether warnings exist but later steps may still proceed
- whether blocking issues remain
- whether unresolved ambiguity should constrain later steps

This does not need to become a massive rules engine, but it must be real.

## Required implementation tasks

1. define the planning readiness/status model in code
2. ensure it reflects both Step 1 carry-forward concerns and Step 2-specific issues
3. ensure readiness/status appears in the artifact/report in a clear way
4. ensure later-step consumption can use it without guessing

## Inputs
- resolved Step 2 planning data
- carried-forward Step 1 readiness/confidence context

## Outputs
- stable plan artifact
- stable planning report
- optional stable debug outputs
- real readiness/status information

## Edge cases
- plan succeeds with warnings
- plan is partially useful but not fully ready
- carried-forward ambiguity remains significant
- debug output exists without cluttering primary output

## Acceptance criteria

- artifact/report/debug outputs are coherent
- readiness/status is meaningful
- Step 3 would not need to reinterpret planning quality from scratch

## Guardrails

- do not let the report become the primary truth
- do not let debug outputs sprawl into core UX
- do not fake readiness confidence where uncertainty remains

