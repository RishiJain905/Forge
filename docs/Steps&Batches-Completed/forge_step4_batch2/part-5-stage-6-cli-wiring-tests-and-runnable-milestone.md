# Part 5 — Stage 6: CLI Wiring, Tests, and Runnable Milestone

## Purpose

This part defines the final stage of Step 4 Batch 2:
- wiring the real Step 4 path into the CLI
- hardening the implemented path with tests
- reaching the runnable milestone for `forge split`

This is where Step 4 becomes tangible.

## Why this matters

Batch 2 is not successful just because internal split modules look good.
It is successful when:
- `forge split` runs
- outputs are written
- tests protect the implemented path

That is the milestone that proves Step 4 is real.

# Stage 6 — CLI wiring

## Goal

Make `forge split` execute the real Step 4 flow from Step 3 output.

## What Codex must build

Codex must ensure the CLI layer:
- locates or receives Step 3 split input
- calls the real Step 4 orchestrator/runner
- returns sensible status behavior
- writes outputs to `.forge/`
- does not replace artifacts with terminal-only prose

## Required implementation tasks

1. audit current command registration for `forge split`
2. wire the command to the stabilized Step 4 runner
3. ensure the command resolves Step 3 artifact input correctly
4. keep terminal output minimal and useful
5. leave room for future split flags without blocking Batch 2

## Required code surfaces

Likely files:
- Step 4 command entry
- main CLI registration
- Step 4 runner/orchestrator
- persistence support

## Inputs
- Step 3 artifact input
- optional repo/config context if needed

## Outputs
- invoked Step 4 runner
- command status
- on-disk split outputs

## Edge cases
- Step 3 artifact missing
- Step 3 artifact warning-heavy but usable
- command run from unusual working directory
- command succeeds with warnings
- blocked streams exist while non-blocked streams are still emitted

## Acceptance criteria
- `forge split` runs the real split pipeline
- outputs are produced on disk
- the split happy path is real, not simulated

## Guardrails
- do not overcomplicate CLI UX in this batch
- do not add future-step flags prematurely
- do not put business logic in the command layer

# Tests for Batch 2

## Goal

Protect the newly real Step 4 path so future work does not break it silently.

## What Codex must build

Codex must add or stabilize tests that cover:
- Step 3 artifact consumption
- workstream construction
- stream categorization
- merge-order logic
- blocking logic
- carried-constraint behavior
- artifact/report generation
- persistence
- end-to-end `forge split` execution

## Required implementation tasks

1. audit current Step 4 tests
2. strengthen tests around the implemented path first
3. ensure test scopes align with the real service boundaries
4. add at least one meaningful end-to-end test for `forge split`
5. add warning/failure tests where Step 3 input is weak or missing
6. add blocked-stream and merge-order tests for the chosen grouping behavior

## Required code surfaces

Likely files:
- existing Step 4 test files
- new end-to-end split test files if needed
- fixtures for blocked streams, merge-order, and carried constraints where appropriate

## Inputs
- sample Step 3 artifact fixtures
- sample verified plan fixtures
- stream grouping and blocking fixtures where appropriate

## Outputs
- reliable Batch 2 test coverage for the split path

## Edge cases
- Step 3 artifact valid but low-confidence
- Step 3 artifact missing
- blocked streams exist
- merge-order is broad but still informative
- regrouping is more aggressive yet remains traceable

## Acceptance criteria
- tests protect the implemented Step 4 path enough to continue safely
- tests reflect the real architecture, not a guessed one
- blocked work and merge-order behavior are meaningfully covered

## Guardrails
- do not rely only on happy-path tests
- do not overmock so much that integration breaks unnoticed
- prefer meaningful service and end-to-end coverage

# Runnable milestone definition

Batch 2 reaches its milestone when:

```bash
forge split
```

or the equivalent Step 4 invocation path runs a real split flow that:
- reads Step 3 output
- constructs workstreams
- assigns stream categories
- applies carried-forward safety constraints
- derives merge-order expectations
- marks blocked items/streams
- builds `.forge/split.json`
- builds `.forge/reports/split-report.md`
- persists those outputs
- returns a stable result without pretending Step 4 is more complete than it is

## Batch 2 completion criteria

Batch 2 is complete when:
- `forge split` is runnable end-to-end in a partial but real way
- core Step 4 internals are materially real
- the runner is stable enough to understand the flow
- split outputs are real and inspectable
- tests protect the implemented milestone

That is enough to prepare Step 4 for later hardening/freeze work.

