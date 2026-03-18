# Part 5 — Stage 7 and 8: Artifacts, Report, Persistence, and Runner

## Purpose

This part covers the output and orchestration layer that makes Step 1 real:
- artifact assembly
- human-readable report generation
- persistence to `.forge/`
- runner/orchestrator stabilization

Without this layer, Step 1 may have good internals but still not feel like a real command.

---

## Why this matters

Batch 3’s target milestone is a runnable spec-mode Step 1.
That requires:
- building the real artifact
- building the real report
- writing them to disk
- having a runner that coordinates the whole path visibly

This is where Step 1 starts feeling like a real CLI feature.

---

# Stage 7 — Artifact assembly and report generation

## Goal

Generate real Step 1 outputs that reflect the Batch 1 contracts.

## What Codex must build

Codex must ensure the code can assemble:
- `.forge/intake.json`
- `.forge/reports/intake-report.md`

The artifact must include the required top-level sections.
The report must include the required human-readable sections.

## Required implementation tasks

1. Audit current artifact-building code.
2. Align machine-readable output with Batch 1.
3. Ensure the artifact includes:
   - metadata
   - source inputs
   - task spec
   - repo context
   - candidate targets
   - risk analysis
   - ambiguities
   - warnings
   - initial verification targets
   - confidence
   - next-step readiness
4. Audit current report builder.
5. Ensure the report clearly exposes:
   - intake summary
   - normalized task view
   - repo context
   - candidate files/modules
   - initial risks
   - ambiguities/warnings
   - confidence
   - planning readiness

## Required code surfaces

Likely files:
- artifact builder files
- report generator file(s)
- any section-building helpers

## Inputs
- final resolved Step 1 data sections

## Outputs
- artifact object
- markdown report string

## Edge cases
- failed run still has partial data
- warnings-heavy run needs readable report
- optional sections may be sparse
- debug artifacts may exist or not

## Acceptance criteria
- artifact matches Batch 1 contract closely
- report is readable and useful for debugging
- artifact and report tell a consistent story

## Guardrails
- do not make report generation responsible for status resolution
- do not let report formatting reshape the artifact contract

---

# Stage 8 — Persistence and runner stabilization

## Goal

Write outputs to disk and make the real Step 1 orchestrator easy to follow.

## What Codex must build

Codex must ensure:
- output directories are created reliably
- artifact/report are written reliably
- optional debug outputs can be written if supported
- the runner sequences the full Step 1 flow cleanly

## Required implementation tasks

1. Audit current persistence logic.
2. Ensure `.forge/` paths are stable.
3. Ensure failed or warning runs still persist useful output when appropriate.
4. Audit `runner.ts`.
5. Make `runner.ts` the obvious orchestration entrypoint.
6. Ensure the runner:
   - receives resolved input
   - calls services in Batch 2 order
   - collects outputs
   - resolves final result
   - triggers artifact/report builders
   - triggers persistence

## Required code surfaces

Likely files:
- `src/intake/persistence.ts`
- `src/intake/runner.ts`

## Inputs
- final artifact/report/debug outputs
- output directory configuration

## Outputs
- written files
- stable command result object

## Edge cases
- output directory missing
- write failure
- failed run with partial analysis
- persistence occurs but report is incomplete
- runner obscures failure source

## Acceptance criteria
- files are written to the expected places
- runner shows the real Step 1 sequence clearly
- the system can be debugged from runner flow + generated outputs

## Guardrails
- do not bury orchestration in helpers
- do not mix persistence with parsing/analysis logic
- keep the runner coordinating, not doing deep work itself
