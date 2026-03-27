# Part 4 — Stage 4: Artifacts, Report, Debug Outputs, and Findings

## Purpose

This part covers the Step 3 outputs that make verification usable:
- `.forge/verify.json`
- `.forge/reports/verify-report.md`
- optional debug verification artifacts
- structural and formal findings output

This is where verification becomes a consumable product output.

## Why this matters

Verification is only useful if:
- its results are inspectable
- structural and formal findings are clearly separated
- the artifact is stable enough for later steps
- the report is useful for humans
- debug outputs can explain what the verifier actually did

This part gives Step 3 that shape.

# Artifact and findings generation

## Goal

Generate a stable Step 3 artifact that captures both lanes honestly.

## What Codex must build

Codex must ensure `.forge/verify.json` can consistently include:
- metadata
- source plan reference
- verification targets/cases
- structural results
- formal results
- generated model/spec references
- TLC statuses/results
- findings
- constraints/mitigations
- carried-forward ambiguity/warnings/confidence
- verification readiness/status

## Required implementation tasks

1. audit any current artifact-building code for Step 3
2. ensure structural and formal results have distinct homes
3. ensure findings can reference their lane and source case
4. ensure trace/error information from TLC can be represented
5. ensure the artifact is stable enough for later-step consumption

# Report generation

## Goal

Ensure the verification report is useful and consistent.

## What Codex must build

Codex must ensure the report clearly explains:
- what was selected for verification
- what structural checks found
- what was formally modeled
- whether TLA+ specs were generated
- whether TLC ran and what it found
- what remains risky
- what constraints/mitigations later steps must respect
- whether later steps can proceed and under what caution

## Required implementation tasks

1. audit report-generation quality
2. ensure report sections align with the artifact
3. ensure warning-heavy verification remains readable
4. ensure structural and formal findings are distinguishable in the report

# Debug-output generation

## Goal

Provide stable optional debug artifacts for verification inspection.

## What Codex must build

Codex must ensure optional debug outputs can be emitted for:
- verification cases
- structural findings
- state models
- generated TLA+ specs
- TLC results

Suggested debug files:
- `.forge/debug/verification-cases.json`
- `.forge/debug/structural-findings.json`
- `.forge/debug/state-models.json`
- `.forge/debug/tla-specs.json`
- `.forge/debug/tlc-results.json`

## Required implementation tasks

1. define when debug files are emitted
2. ensure they do not replace core outputs
3. ensure they help explain what verification actually did
4. ensure warning/failure runs can still emit useful debug information when appropriate

## Inputs
- final resolved Step 3 verification data

## Outputs
- verify artifact object
- verify report string
- optional debug artifacts

## Edge cases
- structural findings exist but no formal cases were runnable
- formal cases exist but TLC errors
- verification is warning-heavy but still useful
- debug output exists without cluttering primary output

## Acceptance criteria
- `verify.json` is coherent and usable
- `verify-report.md` is coherent and readable
- structural/formal findings are clearly separated
- debug outputs help inspection without replacing core outputs

## Guardrails
- do not let the report become the primary truth
- do not let debug outputs sprawl into core UX
- do not blur the difference between structural and formal findings

