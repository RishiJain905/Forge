# Part 5 — Stage 5: CLI Wiring, Tests, and Runnable Milestone

## Purpose

This part defines the final stage of Step 3 Batch 2:
- wiring the real Step 3 path into the CLI
- hardening the implemented path with tests
- reaching the runnable milestone for `forge verify`

This is where Step 3 becomes tangible.

## Why this matters

Batch 2 is not successful just because internal verification modules look good.
It is successful when:
- `forge verify` runs
- outputs are written
- tests protect the implemented path

That is the milestone that proves Step 3 is real.

# Stage 5 — CLI wiring

## Goal

Make `forge verify` execute the real Step 3 flow from Step 2 output.

## What Codex must build

Codex must ensure the CLI layer:
- locates or receives Step 2 verification input
- calls the real Step 3 orchestrator/runner
- returns sensible status behavior
- writes outputs to `.forge/`
- does not replace artifacts with terminal-only prose

## Required implementation tasks

1. audit current command registration for `forge verify`
2. wire the command to the stabilized Step 3 runner
3. ensure the command resolves Step 2 artifact input correctly
4. keep terminal output minimal and useful
5. leave room for future verification flags without blocking Batch 2

## Required code surfaces

Likely files:
- Step 3 command entry
- main CLI registration
- Step 3 runner/orchestrator
- persistence support

## Inputs
- Step 2 artifact input
- optional repo/config context if needed

## Outputs
- invoked Step 3 runner
- command status
- on-disk verification outputs

## Edge cases
- Step 2 artifact missing
- Step 2 artifact warning-heavy but usable
- command run from unusual working directory
- command succeeds with warnings
- TLC fails while structural checks still succeed

## Acceptance criteria
- `forge verify` runs the real verification pipeline
- outputs are produced on disk
- the verification happy path is real, not simulated

## Guardrails
- do not overcomplicate CLI UX in this batch
- do not add future-step flags prematurely
- do not put business logic in the command layer

# Tests for Batch 2

## Goal

Protect the newly real Step 3 path so future work does not break it silently.

## What Codex must build

Codex must add or stabilize tests that cover:
- Step 2 artifact consumption
- verification target/case construction
- structural verification checks
- state-model construction
- TLA+ generation
- TLC execution path for the first high-value subset
- findings/result modeling
- artifact/report generation
- persistence
- end-to-end `forge verify` execution

## Required implementation tasks

1. audit current Step 3 tests
2. strengthen tests around the implemented path first
3. ensure test scopes align with the real service boundaries
4. add at least one meaningful end-to-end test for `forge verify`
5. add warning/failure tests where Step 2 input is weak or missing
6. add TLC-path tests for the chosen high-value subset

## Required code surfaces

Likely files:
- existing Step 3 test files
- new end-to-end verification test files if needed
- fixtures for state models, TLA+ specs, or TLC-path behavior where appropriate

## Inputs
- sample Step 2 artifact fixtures
- sample risky plan fixtures
- TLC-related test fixtures or adapters where appropriate

## Outputs
- reliable Batch 2 test coverage for the verification path

## Edge cases
- Step 2 artifact valid but low-confidence
- Step 2 artifact missing
- structural findings exist but formal lane is constrained
- TLC path errors
- warning-heavy verification output
- formal subset works while broader categories remain unimplemented

## Acceptance criteria
- tests protect the implemented Step 3 path enough to continue safely
- tests reflect the real architecture, not a guessed one
- real TLA+/TLC participation is covered for the first subset

## Guardrails
- do not rely only on happy-path tests
- do not overmock so much that formal integration breaks unnoticed
- prefer meaningful service and end-to-end coverage

# Runnable milestone definition

Batch 2 reaches its milestone when:

```bash
forge verify
```

or the equivalent Step 3 invocation path runs a real verification flow that:
- reads Step 2 output
- constructs verification targets/cases
- runs structural verification
- builds state models for the selected subset
- generates real TLA+ specs
- runs real TLC for the initial high-value subset
- captures structural and formal findings
- builds `.forge/verify.json`
- builds `.forge/reports/verify-report.md`
- persists those outputs
- returns a stable result without pretending Step 3 is more complete than it is

## Batch 2 completion criteria

Batch 2 is complete when:
- `forge verify` is runnable end-to-end in a partial but real way
- core Step 3 internals are materially real
- the runner is stable enough to understand the flow
- verification outputs are real and inspectable
- real TLA+/TLC exists for the first high-value subset
- tests protect the implemented milestone

That is enough to prepare Step 3 for later hardening/freeze work.

