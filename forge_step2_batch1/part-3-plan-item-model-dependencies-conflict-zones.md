# Part 3 — Plan-Item Model, Dependencies, and Conflict Zones

## Purpose

This file defines the heart of Step 2:
- what a plan item is
- how dependencies should be represented
- how conflict zones should be identified

This is the structural core of planning.

## Why this matters

If plan items are weak, then:
- verification has nothing stable to inspect
- splitting has nothing safe to decompose
- execution becomes vague
- integration becomes reactive

Step 2 needs strong internal structure, not just a list of tasks.

## What a plan item is

A plan item is a structured unit of implementation work.

A good plan item should capture:
- what needs to be changed
- why it matters
- what files/modules it likely affects
- what depends on it
- what testing it requires
- whether it is safe or risky to parallelize

A plan item is not just “do X.” It is an actionable planning unit.

## Required plan-item fields

At minimum, Step 2 should shape plan items around fields like:
- id
- title
- description
- type/category
- source requirement(s)
- likely affected paths/modules
- dependencies
- risk level
- test obligations
- verification relevance
- parallelization signal

Later exact schema details can be hardened in implementation batches, but these concepts must be preserved.

## Dependency model

Dependencies should explain:
- what must happen before another item
- what can only proceed after interface/schema/foundation work
- what can remain independent

Dependency relationships should be explicit enough that:
- Step 3 can reason about risky sequencing
- Step 4 can split safely
- humans can inspect the planned order

Preferred dependency categories may include:
- hard dependency
- soft dependency
- sequencing dependency
- interface-first dependency

Batch 1 does not need to overformalize these yet, but it must preserve the concept clearly.

## Conflict zones

Conflict zones are areas of likely overlap or merge risk.

Examples:
- shared interfaces
- central types
- package manifests
- route registries
- config files
- schemas/migrations
- common utilities
- entrypoint modules

Step 2 must identify these explicitly rather than pretending the plan is cleanly isolated.

## What Codex must build

Codex must build Step 2 so that:
- plan items are structured, not vague bullet points
- dependencies are explicit
- conflict zones are visible
- plan-item structure helps later splitting and verification
- shared-risk areas are not buried

## Required implementation tasks

1. define the internal plan-item shape
2. map Step 1 requirements/candidates into plan items
3. define how dependencies are attached to plan items
4. define how conflict zones are recorded
5. ensure risk and dependency relationships remain inspectable

## Inputs

Primary inputs from Step 1:
- normalized task spec
- candidate targets
- repo context
- risk analysis
- ambiguities/warnings
- verification targets

## Outputs

- structured plan items
- dependency relationships
- conflict zones/shared-risk areas

## Edge cases

- one requirement maps to multiple plan items
- multiple requirements map to one plan item
- dependencies are weak or ambiguous
- candidate targets are low-confidence
- conflict zones are broad rather than file-specific

## Acceptance criteria

This part is complete when:
- the concept of a plan item is explicit
- dependency relationships are explicit
- conflict zones are explicit
- later-step consumers would not need to reinvent these concepts

