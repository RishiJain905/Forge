# Part 3 — Workstream Model, Stream Categories, and Safety Rules

## Purpose

This file defines the heart of Step 4:
- what a workstream is
- how stream categories should be represented
- what safety rules govern stream creation

This is the structural core of the split stage.

## Why this matters

If workstreams are weak:
- execution gets vague
- merge-order assumptions break
- blocked work leaks into active streams
- unsafe parallel execution becomes more likely

Step 4 needs strong internal structure, not just a list of buckets.

## What a workstream is

A workstream is a structured execution-ready grouping of verified plan items.

A good workstream should capture:
- what grouped work it contains
- why those items belong together
- what constraints govern it
- what other streams it depends on
- what paths/modules it likely touches
- whether it is serial, parallel-safe, protected, or blocked

A workstream is not just tasks that look similar. It is a safety-aware execution unit.

## Required workstream fields

At minimum, Step 4 should shape workstreams around fields like:
- id
- title
- description
- category
- source plan item ids
- source verification case/finding ids where relevant
- likely affected paths/modules
- stream dependencies
- merge-order requirements
- constraints/mitigations
- blocked reason if applicable

Later exact schema details can be hardened in implementation batches, but these concepts must be preserved.

## Stream categories

Batch 1 should define explicit categories such as:
- serial stream
- safe parallel stream
- parallel-after-dependency stream
- protected-merge stream
- blocked stream

These should be first-class, not vague notes.

## Safety rules for stream creation

Split must use prior constraints to decide stream category and grouping.

Examples:
- formal failures may force blocked or serial treatment
- protected-merge findings may force protected stream categorization
- dependency chains may force parallel-after-dependency instead of safe-parallel
- unresolved hazards may prevent stream creation entirely

## What Codex must build

Codex must build Step 4 so that:
- workstreams are structured and inspectable
- stream categories are explicit
- safety rules are real and deterministic
- stream grouping respects prior verification constraints
- blocked work has a clear representation

## Required implementation tasks

1. define the internal workstream shape
2. define stream category logic
3. define stream grouping rules
4. define how safety findings constrain grouping
5. ensure risk and grouping relationships remain inspectable

## Inputs

Primary inputs from Step 3:
- verified plan items
- structural findings
- formal findings
- constraints/mitigations
- readiness/status
- carried-forward ambiguity/warnings/confidence

## Outputs

- structured workstreams
- stream categories
- grouping rationale and safety constraints

## Edge cases

- one plan item cannot be safely grouped with any other
- one workstream contains multiple related items but carries a protected-merge constraint
- a workstream is blocked by a single formal finding
- one stream depends on another stream’s completion before parallel execution is safe

## Acceptance criteria

This part is complete when:
- the concept of a workstream is explicit
- stream categories are explicit
- safety rules are explicit
- later-step consumers would not need to reinvent these concepts

