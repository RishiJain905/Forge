# Part 5 — Stage 7: CLI Wiring, Tests, and Runnable Milestone

## Purpose

This part defines the final stage of Step 2 Batch 2:
- wiring the real Step 2 path into the CLI
- hardening the implemented path with tests
- reaching the runnable milestone for `forge plan`

This is where Step 2 becomes tangible.

## Why this matters

Batch 2 is not successful just because internal planning modules look good.
It is successful when:
- `forge plan` runs
- outputs are written
- tests protect the implemented path

That is the milestone that proves Step 2 is real.

# Stage 7 — CLI wiring

## Goal

Make `forge plan` execute the real Step 2 flow from Step 1 output.

## What Codex must build

Codex must ensure the CLI layer:
- locates or receives Step 1 planning input
- calls the real Step 2 orchestrator/runner
- returns sensible status behavior
- writes outputs to `.forge/`
- does not replace artifacts with terminal-only prose

## Required implementation tasks

1. audit current command registration for `forge plan`
2. wire the command to the stabilized Step 2 runner
3. ensure the command resolves Step 1 artifact input correctly
4. keep terminal output minimal and useful
5. leave room for future assistive flags without blocking Batch 2

## Required code surfaces

Likely files:
- Step 2 command entry
- main CLI registration
- Step 2 runner/orchestrator
- persistence support

## Inputs
- Step 1 artifact input
- optional repo/config context if needed

## Outputs
- invoked Step 2 runner
- command status
- on-disk planning outputs

## Edge cases
- Step 1 artifact missing
- Step 1 artifact warning-heavy but usable
- command run from unusual working directory
- command succeeds with warnings

## Acceptance criteria
- `forge plan` runs the real planning pipeline
- outputs are produced on disk
- the planning happy path is real, not simulated

## Guardrails
- do not overcomplicate CLI UX in this batch
- do not add future-step flags prematurely
- do not put business logic in the command layer

# Tests for Batch 2

## Goal

Protect the newly real Step 2 path so future work does not break it silently.

## What Codex must build

Codex must add or stabilize tests that cover:
- Step 1 artifact consumption
- plan-item construction
- dependency/conflict analysis
- test obligations
- parallelization categories
- carry-forward behavior
- artifact/report generation
- persistence
- end-to-end `forge plan` execution

## Required implementation tasks

1. audit current Step 2 tests
2. strengthen tests around the implemented path first
3. ensure test scopes align with the real service boundaries
4. add at least one meaningful end-to-end test for `forge plan`
5. add warning/failure tests where Step 1 input is weak or missing

## Required code surfaces

Likely files:
- existing Step 2 test files
- new end-to-end planning test files if needed

## Inputs
- sample Step 1 artifact fixtures
- sample repo fixtures or current repo assumptions where appropriate

## Outputs
- reliable Batch 2 test coverage for the planning path

## Edge cases
- Step 1 artifact valid but low-confidence
- Step 1 artifact missing
- planning output warning-heavy
- conflict zones broad but not fatal
- carry-forward ambiguity still present

## Acceptance criteria
- tests protect the implemented Step 2 path enough to continue safely
- tests reflect the real architecture, not a guessed one

## Guardrails
- do not rely only on happy-path tests
- do not overmock so much that integration breaks unnoticed
- prefer meaningful service and end-to-end coverage

# Runnable milestone definition

Batch 2 reaches its milestone when:

```bash
forge plan
```

or the equivalent Step 2 invocation path runs a real planning flow that:
- reads Step 1 output
- constructs plan items
- derives dependencies/conflict zones
- assigns test obligations
- assigns stronger parallelization categories
- carries forward Step 1 ambiguity/warnings
- builds `.forge/plan.json`
- builds `.forge/reports/plan-report.md`
- persists those outputs
- returns a stable result without pretending Step 2 is more complete than it is

## Batch 2 completion criteria

Batch 2 is complete when:
- `forge plan` is runnable end-to-end in a partial but real way
- core Step 2 internals are materially real
- the runner is stable enough to understand the flow
- plan outputs are real and inspectable
- tests protect the implemented milestone

That is enough to prepare Step 2 for later hardening/freeze work.

