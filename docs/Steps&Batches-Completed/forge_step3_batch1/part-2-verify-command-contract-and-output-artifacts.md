# Part 2 — Verify Command Contract and Output Artifacts

## Purpose

This file defines how `forge verify` should behave as a command and what artifacts it must produce.

This is the command/output contract layer for Step 3 Batch 1.

## Why this matters

Without a strong verification command contract:
- findings become inconsistent
- formal and structural results get mixed confusingly
- later steps will guess what verification proved versus what it only warned about
- humans will struggle to debug failures or traces

This file freezes the high-level `forge verify` contract.

## Primary command goal

Given a valid Step 2 output, `forge verify` should produce:
- `.forge/verify.json`
- `.forge/reports/verify-report.md`

These outputs must support both the structural and formal lanes.

## Input contract

### Required input
Step 3 should consume the output of Step 2, especially:
- `.forge/plan.json`

### Optional supporting input
Step 3 may later support:
- config
- flags controlling strictness or formal execution behavior
- debug toggles
- bounded assistive reasoning flags for explanation only

But Batch 1 should focus on the core `plan.json`-driven flow first.

## Output artifacts

### Required machine-readable artifact
```text
.forge/verify.json
```

### Required human-readable artifact
```text
.forge/reports/verify-report.md
```

### Optional debug artifacts
Examples:
```text
.forge/debug/verification-cases.json
.forge/debug/structural-findings.json
.forge/debug/state-models.json
.forge/debug/tla-specs.json
.forge/debug/tlc-results.json
```

These should remain optional and secondary to the core outputs.

## Top-level `verify.json` intent

The verification artifact should eventually include:
- metadata
- source plan references
- verification targets/cases
- structural verification results
- formal verification results
- generated model/spec references
- TLC execution results or failures
- findings
- mitigations or constraints
- carried-forward warnings/ambiguities/confidence
- verification readiness/status for later steps

The exact schema can be hardened later, but Batch 1 must freeze the main sections.

## Human-readable report intent

The report should help a human answer:
- what parts of the plan were verified
- what structural issues were found
- what parts were formally modeled
- whether TLA+ specs were generated
- whether TLC ran and what it found
- what failed, what passed, and what remains risky
- whether later steps can proceed and under what constraints

## Required implementation tasks

1. define the command contract for `forge verify`
2. define required machine-readable and human-readable outputs
3. define optional debug artifact direction
4. keep machine-readable verification output primary
5. keep the report aligned with the artifact rather than independent from it

## Guardrails

- do not let the report become the primary output
- do not hide whether a result came from structural checks versus TLC-backed checks
- do not imply proofs where only warnings or failed checks exist

## Acceptance criteria

This part is complete when:
- `forge verify`’s input/output contract is explicit
- required outputs are frozen
- structural and formal outputs have a clear place
- later implementation can build against these outputs without guessing

