# Part 3 — Artifact, Report, Debug Output, and Readiness Hardening

## Purpose

This part hardens the actual outputs of Step 3:
- `.forge/verify.json`
- `.forge/reports/verify-report.md`
- optional debug verification artifacts
- verification readiness/status behavior for later steps

This is where Step 3 becomes stable to consume.

## Why this matters

A verification stage is only useful if:
- its machine-readable artifact is stable
- its human-readable report is useful
- its optional debug outputs are inspectable
- its readiness/status signals actually help later stages decide what to do

This part makes the outputs strong enough to freeze.

# Artifact hardening

## Goal

Ensure `.forge/verify.json` is stable and consistent.

## What Codex must build

Codex must ensure the verification artifact consistently includes:
- metadata
- source plan reference
- verification targets/cases
- structural results
- formal results
- state-model/spec references
- TLC statuses/results
- findings
- constraints/mitigations
- carried-forward ambiguity/warnings/confidence
- verification readiness or status where applicable

## Required implementation tasks

1. audit current artifact-building code
2. ensure sections are consistently present when expected
3. ensure structural and formal results remain distinct
4. ensure carried-forward context is preserved honestly
5. ensure artifact shape is stable enough for Step 4 consumption

# Report hardening

## Goal

Ensure the verification report is useful and consistent.

## What Codex must build

Codex must ensure the report clearly explains:
- what was selected for verification
- what structural checks found
- what was formally modeled
- whether TLC ran and what it found
- what remains risky
- what constraints/mitigations later steps must respect
- whether later steps can proceed and under what caution

## Required implementation tasks

1. audit report-generation quality
2. ensure report sections align with the machine-readable artifact
3. ensure warning-heavy verification remains readable
4. ensure structural and formal findings are distinguishable in the report
5. ensure TLC trace/error narratives are understandable when present

# Debug-output hardening

## Goal

Provide stable optional debug artifacts for verification inspection.

## What Codex must build

Codex must ensure optional debug outputs can be emitted for:
- verification cases
- structural findings
- state models
- generated TLA+ specs
- TLC results
- optionally readiness/status diagnostics if useful

Suggested debug files:
- `.forge/debug/verification-cases.json`
- `.forge/debug/structural-findings.json`
- `.forge/debug/state-models.json`
- `.forge/debug/tla-specs.json`
- `.forge/debug/tlc-results.json`

## Required implementation tasks

1. define when debug files are emitted
2. ensure they do not replace core outputs
3. ensure they are useful for debugging rather than noisy dumps
4. ensure warning/failure runs can still emit useful debug artifacts where appropriate

# Readiness and status hardening

## Goal

Make Step 3’s readiness/status model strong enough for later stages.

## What Codex must build

Codex must ensure Step 3 can clearly communicate:
- success
- success with warnings
- failure
- whether only structural checks were usable
- whether formal results constrain later steps
- whether blocking issues remain
- whether later steps can proceed and under what constraints

## Required implementation tasks

1. define or stabilize the verification readiness/status model in code
2. ensure it reflects Step 2 carry-forward concerns and Step 3-specific issues
3. ensure readiness/status appears in the artifact/report clearly
4. ensure later-step consumption can use it without guessing

## Inputs
- resolved Step 3 verification data
- carried-forward Step 2 readiness/confidence context

## Outputs
- stable verify artifact
- stable verify report
- optional stable debug outputs
- real readiness/status information

## Edge cases
- verification succeeds with warnings
- verification is partially useful but not fully ready
- TLC failure constrains later steps strongly
- debug output exists without cluttering primary output

## Acceptance criteria

- artifact/report/debug outputs are coherent
- readiness/status is meaningful
- Step 4 would not need to reinterpret verification quality from scratch

## Guardrails

- do not let the report become the primary truth
- do not let debug outputs sprawl into core UX
- do not fake readiness confidence where uncertainty remains

