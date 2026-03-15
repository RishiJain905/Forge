# Output Artifacts and Write Rules

## Purpose
Define what files Step 1 writes and how writing is handled.

## Why this matters
Artifact writing is the handoff substrate for the entire pipeline.

## What Codex must build
- Machine-readable artifact writing.
- Human-readable report writing.
- Optional debug artifact writing.
- Write-order and directory creation rules.

## Required implementation tasks
- Create `.forge/` and required subdirectories when missing.
- Write `.forge/intake.json` unless suppressed by explicit output mode.
- Write `.forge/reports/intake-report.md` unless suppressed by explicit output mode.
- Optionally write debug artifacts behind a simple flag or internal debug mode.

## Required code surfaces
- Artifact writer.
- Report writer.
- Directory bootstrap helper.
- Debug writer.

## Inputs
- Final assembled intake result.
- Output mode settings.

## Outputs
- Artifact files on disk.

## Edge cases
- Output dir missing.
- Write permissions issue.
- Report writing succeeds but JSON writing fails, or vice versa.

## Acceptance criteria
- Writers create directories safely.
- Partial write failure is surfaced clearly.
- Human-readable and machine-readable outputs match the same run state.

## Guardrails
- Do not write outside output directory.
- Do not print critical information only to stdout without persisting it.
