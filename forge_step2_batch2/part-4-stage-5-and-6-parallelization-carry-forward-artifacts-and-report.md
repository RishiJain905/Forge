# Part 4 — Stage 5 and 6: Parallelization, Carry-Forward, Artifacts, and Report

## Purpose

This part covers the final structural outputs of Step 2:
- stronger planning-time parallelization categories
- carry-forward of Step 1 ambiguity/warnings/confidence
- plan artifact generation
- planning report generation
- optional debug artifacts

This is where the plan becomes a real product output.

## Why this matters

A plan is only useful if it is honest and future-facing.

That means it must:
- say what is safe or unsafe to parallelize
- preserve unresolved uncertainty from Intake
- produce outputs humans and later steps can trust

This part gives Step 2 that shape.

# Stage 5 — Parallelization and carry-forward logic

## Goal

Attach strong planning-time parallelization categories and preserve Step 1 uncertainty honestly.

## What Codex must build

Codex must ensure Step 2 can tag plan items with categories such as:
- serial only
- safe parallel
- parallel after dependency
- risky/shared
- protected merge required

Codex must also ensure Step 1 ambiguities, warnings, and weak-confidence areas are carried forward into planning rather than discarded.

## Required implementation tasks

1. define the parallelization categories in code
2. attach them to plan items based on dependency/conflict/risk signals
3. define how carried-forward ambiguity/warnings appear in the planning artifact
4. ensure low-confidence Intake context is not silently erased
5. make sure carry-forward concerns can influence planning readiness or caution

## Required code surfaces

Likely files:
- parallelization logic
- carry-forward helper logic
- plan-item enrichment code
- planning status/readiness support if present

## Inputs
- plan items
- dependency relationships
- conflict zones
- Step 1 ambiguities/warnings/confidence/readiness

## Outputs
- enriched plan items with stronger parallelization categories
- carried-forward ambiguity/warning/confidence context

## Edge cases
- a risky/shared item may still later be split, but only after dependency resolution
- a serial-only item may be foundational to many later tasks
- warning-heavy intake may still produce a usable plan
- one plan item may be parallel-safe while another in the same feature is not

## Acceptance criteria
- parallelization signals are stronger than vague hints
- carried-forward Step 1 context remains visible and honest
- later split work would not need to reinvent these signals from scratch

## Guardrails
- do not do full split/workstream generation yet
- do not “resolve” uncertainty by hiding it

# Stage 6 — Artifact, report, and debug outputs

## Goal

Generate real Step 2 outputs:
- `.forge/plan.json`
- `.forge/reports/plan-report.md`

and optional lightweight planning debug outputs.

## What Codex must build

Codex must ensure the code can assemble:
- a machine-readable plan artifact
- a human-readable planning report
- optional debug artifacts such as:
  - `.forge/debug/plan-items.json`
  - `.forge/debug/dependencies.json`
  - `.forge/debug/conflict-zones.json`
  - `.forge/debug/test-obligations.json`

## Required implementation tasks

1. audit any current artifact/report code for Step 2
2. align machine-readable output with Step 2 Batch 1 intent
3. ensure the artifact includes at least:
   - metadata
   - source intake reference
   - plan items
   - dependencies
   - conflict zones
   - test obligations
   - parallelization signals
   - carried-forward ambiguity/warnings
4. ensure the report clearly explains:
   - what the planner believes must be done
   - dependency order
   - shared-risk/conflict areas
   - testing expectations
   - parallelization guidance
   - unresolved ambiguity
5. ensure debug outputs are optional and secondary

## Required code surfaces

Likely files:
- Step 2 artifact builder
- Step 2 report generator
- optional debug-output helpers
- persistence support

## Inputs
- final resolved Step 2 planning data

## Outputs
- plan artifact object
- planning report string
- optional debug artifacts

## Edge cases
- plan is warning-heavy but still usable
- some sections are sparse
- carried-forward uncertainty is significant
- artifact and report could drift if built separately

## Acceptance criteria
- `plan.json` is coherent and usable
- `plan-report.md` is coherent and readable
- artifact and report tell the same story
- debug outputs help inspection without replacing the core outputs

## Guardrails
- do not let the report become the primary truth
- do not let debug output sprawl into core UX

