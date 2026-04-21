# Part 2 — Plan Command Contract and Output Artifacts

## Purpose

This file defines how `forge plan` should behave as a command and what artifacts it must produce.

This is the main contract layer for Step 2 Batch 1.

## Why this matters

Without a strong command contract, planning can become inconsistent:
- input assumptions drift
- output shape drifts
- later steps have to guess what planning produced
- human inspection becomes harder

This file freezes the high-level `forge plan` contract.

## Primary command goal

Given a valid Step 1 output, `forge plan` should produce:

- `.forge/plan.json`
- `.forge/reports/plan-report.md`

These outputs must be deterministic-first and stable enough to support later steps.

## Input contract

### Required input
Step 2 should consume the output of Step 1, especially:
- `.forge/intake.json`

### Optional supporting input
Step 2 may later support:
- config
- flags influencing stream caps or planning strictness
- assistive reasoning flags

But Batch 1 should focus on the core `intake.json`-driven flow first.

## Output artifacts

### Required machine-readable artifact
```text
.forge/plan.json
```

### Required human-readable artifact
```text
.forge/reports/plan-report.md
```

### Optional debug artifacts
Examples:
```text
.forge/debug/plan-items.json
.forge/debug/dependencies.json
.forge/debug/conflict-zones.json
.forge/debug/test-obligations.json
```

These should remain optional and secondary to the core outputs.

## Top-level `plan.json` intent

The planning artifact should eventually include:
- metadata
- source intake references
- plan items
- dependency graph or dependency mapping
- conflict zones
- test obligations
- parallelization signals
- carried-forward ambiguities/warnings
- planning status/readiness for later steps

The exact schema can be refined in later build batches, but Batch 1 must freeze the main sections.

## Human-readable report intent

The report should help a human answer:
- what work the planner believes needs to be done
- what order the work depends on
- which areas are risky or shared
- what testing obligations exist
- what ambiguity is still unresolved
- what is likely safe or unsafe to parallelize
- whether later steps can proceed

## Required implementation tasks

1. define the command contract for `forge plan`
2. define required machine-readable and human-readable outputs
3. define optional debug artifact direction
4. keep machine-readable output primary
5. keep the report aligned with the artifact, not independent from it

## Guardrails

- do not let the report become the primary output
- do not make Step 2 dependent on future-step files
- do not add execution-specific content to the plan artifact yet

## Acceptance criteria

This part is complete when:
- `forge plan`’s input/output contract is explicit
- required outputs are frozen
- human-readable and machine-readable roles are distinct
- later implementation can build against these outputs without guessing

