# Part 3 — Stage 3 and 4: Stream Categories, Safety, Merge Order, and Blocking

## Purpose

This part covers the next layer of split structure:
1. stream categorization and safety application
2. merge-order and blocking logic

By this stage, Step 4 should move from a set of workstreams to a meaningful and safe execution partition.

## Why this matters

Without categories:
- execution readiness is unclear
- parallel versus serial treatment is fuzzy

Without merge-order logic:
- later integration and execution become unsafe

Without blocking logic:
- unresolved risk leaks into active streams

This part makes the split actionable.

# Stage 3 — Stream categories and safety application

## Goal

Attach explicit stream categories and carried-forward safety constraints to workstreams.

## What Codex must build

Codex must make Step 4 able to:
- attach stream categories to workstreams
- distinguish serial streams from safe parallel streams
- distinguish protected-merge streams from blocked streams
- apply prior-step constraints deterministically

## Required implementation tasks

1. audit any existing category/safety logic
2. define how stream categories are represented in code
3. attach categories to workstreams deterministically where possible
4. apply prior-step findings and mitigations to category assignment
5. preserve category rationale in inspectable form

## Required code surfaces

Likely files:
- stream-category logic
- safety application module
- workstream enrichment support

## Inputs
- structured workstreams
- dependencies
- structural findings
- formal findings
- constraints/mitigations
- carried-forward warnings/confidence

## Outputs
- categorized workstreams
- applied stream-level safety constraints

## Edge cases
- a workstream is mostly parallel-safe but still carries a protected-merge rule
- a stream is serial because of one critical safety constraint
- warnings reduce confidence without fully blocking the stream
- a blocked stream still needs rich metadata

## Acceptance criteria
- stream categories are explicit and meaningful
- category assignment is inspectable
- safety constraints are materially reflected in stream output

## Guardrails
- do not assign categories casually
- do not treat all non-blocked streams as parallel-safe

# Stage 4 — Merge-order and blocking logic

## Goal

Attach explicit merge-order expectations and blocked status to workstreams.

## What Codex must build

Codex must ensure Step 4 can:
- define merge-order relationships between streams
- identify blocked streams or blocked items
- preserve the reason for blocked status
- preserve merge-order rationale

## Required implementation tasks

1. audit any existing merge-order/blocking logic
2. define merge-order relationships in code
3. identify blocked streams deterministically
4. ensure one stream may be blocked by:
   - unresolved formal failure
   - missing prerequisite stream
   - unsafe merge/serialization assumptions
   - unresolved mitigation requirements
5. ensure merge-order and blocking data appear in artifact/report outputs

## Required code surfaces

Likely files:
- merge-order logic
- blocking logic
- workstream result helpers

## Inputs
- categorized workstreams
- dependencies
- formal/structural findings
- TLC constraints
- readiness/status context

## Outputs
- merge-order relationships
- blocked items/streams
- blocking reasons

## Edge cases
- one blocked item makes an otherwise valid stream partially blocked
- merge order is required even when streams are otherwise parallel-safe
- broad findings create cautious rather than absolute blocking
- one stream depends on multiple upstream streams

## Acceptance criteria
- merge-order expectations are explicit
- blocked work is explicit
- split is no longer just grouping; it is safety-constrained partitioning

## Guardrails
- do not bury blocking in prose
- do not imply free parallelism where merge-order constraints remain

