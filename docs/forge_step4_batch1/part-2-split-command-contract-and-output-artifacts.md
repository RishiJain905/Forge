# Part 2 — Split Command Contract and Output Artifacts

## Purpose

This file defines how `forge split` should behave as a command and what artifacts it must produce.

This is the command/output contract layer for Step 4 Batch 1.

## Why this matters

Without a strong split command contract:
- workstream output drifts
- later execution cannot trust stream metadata
- humans cannot audit why work was grouped the way it was
- blocked work gets lost in prose

This file freezes the high-level `forge split` contract.

## Primary command goal

Given a valid Step 3 output, `forge split` should produce:
- `.forge/split.json`
- `.forge/reports/split-report.md`

These outputs must reflect the verified safety model and workstream boundaries.

## Input contract

### Required input
Step 4 should consume the output of Step 3, especially:
- `.forge/verify.json`

### Optional supporting input
Step 4 may later support:
- config
- flags controlling stream caps or grouping strictness
- debug toggles

But Batch 1 should focus on the core `verify.json`-driven flow first.

## Output artifacts

### Required machine-readable artifact
```text
.forge/split.json
```

### Required human-readable artifact
```text
.forge/reports/split-report.md
```

### Optional debug artifacts
Examples:
```text
.forge/debug/workstreams.json
.forge/debug/merge-order.json
.forge/debug/blocked-items.json
.forge/debug/stream-constraints.json
```

These should remain optional and secondary to the core outputs.

## Top-level `split.json` intent

The split artifact should eventually include:
- metadata
- source verify references
- workstreams
- stream categories
- stream scope / likely touched paths
- dependency edges between streams
- merge-order expectations
- blocked items
- carried-forward constraints/findings
- split readiness/status for later steps

The exact schema can be hardened later, but Batch 1 must freeze the main sections.

## Human-readable report intent

The report should help a human answer:
- what workstreams were created
- why items were grouped together
- which streams are serial, parallel-safe, protected, or blocked
- what merge order is required
- what constraints from verification still matter
- whether later steps can proceed and under what caution

## Required implementation tasks

1. define the command contract for `forge split`
2. define required machine-readable and human-readable outputs
3. define optional debug artifact direction
4. keep machine-readable output primary
5. keep the report aligned with the artifact, not independent from it

## Guardrails

- do not let the report become the primary output
- do not let Step 4 depend on later-step files
- do not put execution-specific prompt content into the split artifact yet

## Acceptance criteria

This part is complete when:
- `forge split`’s input/output contract is explicit
- required outputs are frozen
- human-readable and machine-readable roles are distinct
- later implementation can build against these outputs without guessing

