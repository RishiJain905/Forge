# Purpose and Boundary

## Purpose
Define what `forge intake` is responsible for and freeze the Step 1 boundary.

## Why this matters
If Intake tries to do planning, verification, or execution work, later pipeline stages become blurry and hard to trust.

## What Codex must build
- A Step 1 command handler contract that treats Intake as a foundation stage.
- A read-only policy for the user repo outside `.forge/`.
- A top-level Step 1 orchestration path that always aims to emit artifacts or a useful failure report.

## Required implementation tasks
- Create a clear internal constant/config declaring the Step 1 command name and allowed side effects.
- Enforce write restrictions so all Step 1 outputs go under `.forge/` only.
- Add a boundary check or convention used by the command runner to prevent accidental source edits.
- Persist purpose-aligned status metadata in the final artifact.

## Required code surfaces
- CLI command entry for `forge intake`.
- A write-path resolver limited to `.forge/`.
- A small boundary policy helper or constant set.
- Shared status/type fields on the intake artifact.

## Inputs
- CLI args and resolved repo path.
- Optional config values.

## Outputs
- A safe Step 1 execution context.
- Boundary-safe output paths.
- Artifact metadata that later steps can trust.

## Edge cases
- User runs Intake in a repo with no `.forge/` folder yet.
- User passes a custom output directory.
- An internal helper accidentally tries to write outside `.forge/`.

## Acceptance criteria
- Running `forge intake` never modifies app source files.
- All writes occur under `.forge/` or configured equivalent.
- The command can still emit a failed artifact/report instead of crashing.

## Guardrails
- Do not implement planning behavior here.
- Do not create plan items beyond basic readiness/targets.
- Do not hide write paths in utility helpers.
