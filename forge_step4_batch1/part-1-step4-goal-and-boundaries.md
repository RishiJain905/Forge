# Part 1 — Step 4 Goal and Boundaries

## Purpose

This file defines the mission and boundaries of Step 4: Split.

Step 4 must take verified planning output and convert it into safe execution-ready workstreams without drifting into actual implementation.

## Why this matters

Without a tight boundary, Split can easily become confused and dangerous.

Common failure modes:
- it ignores verification constraints
- it over-optimizes for parallelism
- it starts inventing execution behavior
- it reshapes work too aggressively and breaks traceability
- it hides blocked work instead of surfacing it

This file exists to prevent those failures.

## Core Step 4 mission

The mission of Step 4 is:

> Transform verified planning output into safe execution-ready workstreams that preserve dependency, verification, and merge-order constraints.

This includes:
- grouping verified plan items into workstreams
- assigning stream categories
- preserving serial and protected-merge constraints
- identifying blocked items
- defining merge-order expectations
- producing machine-readable and human-readable split outputs

## What Step 4 must do

Step 4 must:
- consume Step 3 outputs instead of redoing verification
- preserve safety constraints from structural and formal findings
- produce structured workstreams rather than vague groups
- define blocked work explicitly
- remain strict about unsafe parallelization
- remain conservative about regrouping in early V1

## What Step 4 must not do

Step 4 must not:
- execute code
- rewrite planning logic
- ignore TLC-backed failures or mitigations
- hide unresolved risk inside broad stream descriptions
- become a freeform project-manager step

## Deterministic-first rule

Split should be primarily based on:
- verified plan items
- dependency relationships
- conflict zones
- parallelization categories
- structural findings
- formal findings and constraints
- merge-order and safety rules

A later assistive layer may exist for phrasing or small refinements, but the split skeleton must not depend on fuzzy reasoning.

## Conservative regrouping rule

For Batch 1, Split should be conservative:
- preserve Step 2/3 structure where possible
- regroup only where safety and clarity clearly improve
- avoid aggressive recomposition that weakens traceability

Split may become more aggressive in later batches, but not here.

## Required implementation tasks

1. define Step 4’s role clearly in code and docs
2. define what counts as a workstream
3. define how safety constraints shape stream creation
4. define blocked-work behavior
5. prevent Step 4 from drifting into execution logic

## Required code surfaces

Likely future surfaces:
- Step 4 command entry
- split orchestrator/runner
- workstream models
- stream-category logic
- merge-order logic
- blocking logic
- report builder
- persistence

## Acceptance criteria

This part is complete when:
- Step 4’s mission is explicit
- boundaries are explicit
- deterministic-first expectations are explicit
- conservative regrouping is explicit
- later-step drift is clearly prohibited

