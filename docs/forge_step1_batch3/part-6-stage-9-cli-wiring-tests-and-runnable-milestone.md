# Part 6 — Stage 9: CLI Wiring, Tests, and Runnable Milestone

## Purpose

This part defines the final stage of Batch 3:
- wiring the real Step 1 path into the CLI
- hardening the implemented path with tests
- reaching the runnable milestone for spec mode

This is the point where Batch 3 becomes tangible.

---

## Why this matters

Batch 3 is not successful just because internal modules look good.
It is successful when:
- the real CLI command works
- outputs are written
- tests protect the implemented path

This stage is where the implementation becomes something you can actually run.

---

# Stage 9 — CLI wiring

## Goal

Make `forge intake --spec <file>` execute the real Step 1 flow.

## What Codex must build

Codex must ensure the CLI layer:
- parses spec-mode arguments correctly
- calls the real Step 1 orchestrator
- returns a sensible result/exit behavior
- does not replace artifacts with terminal-only output

## Required implementation tasks

1. Audit the current command registration for `forge intake`.
2. Wire the command to the stabilized runner.
3. Ensure required flags behave correctly for spec mode.
4. Preserve room for prompt mode, but do not let it block spec-mode completion.
5. Keep terminal output minimal and useful; rely on artifacts/reports for full detail.

## Required code surfaces

Likely files:
- main CLI entry
- intake command file if separate
- command registration/wiring files

## Inputs
- CLI args for spec mode
- repo path
- optional config/focus inputs

## Outputs
- invoked runner
- command status
- on-disk Intake outputs

## Edge cases
- command invoked with invalid paths
- command invoked with missing required input
- command invoked from unusual working directory
- command succeeds with warnings

## Acceptance criteria
- `forge intake --spec spec.md` runs the real pipeline
- artifacts are produced on disk
- spec-mode happy path is real, not simulated

## Guardrails
- do not overcomplicate terminal UX in this batch
- do not try to add interactive mode
- do not make CLI wiring the place where business logic lives

---

# Tests for Batch 3

## Goal

Protect the newly real spec-mode path so future work does not break it silently.

## What Codex must build

Codex must add or stabilize tests that cover:
- input resolution for spec mode
- task parsing for representative specs
- repo context for supported repos
- candidate targeting for plausible cases
- warning/failure behavior
- artifact/report creation
- persistence
- end-to-end spec-mode intake execution

## Required implementation tasks

1. Audit current Step 1 tests.
2. Strengthen tests around the implemented spec-mode path first.
3. Ensure test names and scopes map cleanly to the real service boundaries.
4. Add at least one meaningful end-to-end test for spec mode.
5. Add failure/warning tests where the spec path is weak or invalid.

## Required code surfaces

Likely files:
- existing Step 1 test files
- new spec-mode end-to-end test files if needed

## Inputs
- sample spec fixtures
- sample repo fixtures or current repo assumptions where appropriate

## Outputs
- reliable Batch 3 test coverage for spec mode

## Edge cases
- valid spec with weak structure
- invalid spec path
- repo missing git
- no tests found in repo
- warnings but not hard failure

## Acceptance criteria
- tests protect the implemented path enough to continue Batch 4 safely
- tests are aligned with the real architecture, not a guessed one

## Guardrails
- do not write only happy-path tests
- do not overmock so heavily that integration breaks unnoticed
- prefer meaningful service and end-to-end coverage over noisy quantity

---

# Runnable milestone definition

Batch 3 reaches its milestone when the following is true:

```bash
forge intake --spec <path-to-spec>
```

runs a real Step 1 flow that:
- resolves the input
- parses the spec
- scans the repo
- derives candidate data and analysis
- builds `.forge/intake.json`
- builds `.forge/reports/intake-report.md`
- persists those outputs
- returns a stable result without pretending Step 1 is more complete than it is

This milestone does not require perfect prompt-mode support yet.

---

## Batch 3 completion criteria

Batch 3 is complete when:
- spec mode is runnable end-to-end
- core Step 1 internals are materially real
- the runner is stable enough to understand the whole flow
- artifact/report output is real and inspectable
- persistence works
- tests protect the implemented milestone

That is enough to make Step 1 feel real and prepare for the next batch.
