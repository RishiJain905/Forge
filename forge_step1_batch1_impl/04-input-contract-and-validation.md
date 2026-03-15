# Input Contract and Validation

## Purpose
Define exactly what inputs are allowed and how they are validated.

## Why this matters
Weak validation will poison every downstream stage with bad assumptions.

## What Codex must build
- Input validation rules for core and optional inputs.
- A consistent validation error structure.
- Early validation behavior that still aims to emit useful failure output.

## Required implementation tasks
- Validate existence/readability of `--spec`, `--constraints`, `--notes`, and `--config` when provided.
- Validate repo root existence or auto-detection result.
- Validate focus paths when provided.
- Implement a validation result object with blocking errors and warnings.

## Required code surfaces
- Input validator.
- Validation result type.
- File existence helpers.
- Repo root resolution helper.

## Inputs
- CLI arguments and filesystem state.

## Outputs
- Validated input object or blocking validation issues.

## Edge cases
- Missing optional file explicitly requested by user.
- Repo path points to a non-repo directory but still has files.
- Focus path exists but is outside repo root.

## Acceptance criteria
- Invalid primary inputs cause failure or hard blocking before parse work.
- Optional invalid inputs are surfaced explicitly.
- Validation output can be included in failed artifact/report.

## Guardrails
- Do not skip validation because later steps might catch it.
- Do not assume files exist because the CLI parsed successfully.
