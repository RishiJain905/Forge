# Part 3 — Stage 3 and 4: Dependencies, Conflict Zones, and Test Obligations

## Purpose

This part covers the next layer of planning structure:
1. dependency and conflict-zone analysis
2. test-obligation assignment

By this stage, Step 2 should move from “a set of plan items” to “a meaningful implementation plan.”

## Why this matters

Without dependencies:
- order is unclear
- risky sequencing is hidden
- later verification and splitting are weakened

Without conflict zones:
- shared-risk areas disappear until merge pain shows up later

Without test obligations:
- planning is disconnected from validation

This part makes the plan actionable.

# Stage 3 — Dependency and conflict-zone analysis

## Goal

Attach explicit sequencing and overlap information to the plan.

## What Codex must build

Codex must make Step 2 able to:
- attach dependencies to plan items
- distinguish items that can begin independently from those that require prior work
- identify conflict zones/shared-risk areas
- preserve dependency and conflict data in inspectable form

## Required implementation tasks

1. audit any existing dependency/conflict logic
2. define how dependencies are represented in code
3. attach dependencies to plan items deterministically where possible
4. identify conflict zones such as:
   - shared interfaces
   - central types
   - config files
   - package manifests
   - common utilities
   - registries/schemas
5. ensure conflict zones are visible in the artifact/report

## Required code surfaces

Likely files:
- dependency-analysis module
- conflict-zone analysis module
- plan-item model support

## Inputs
- structured plan items
- candidate targets
- repo context
- Step 1 risk signals

## Outputs
- dependency relationships
- conflict zones/shared-risk areas

## Edge cases
- dependency is likely but not perfectly certain
- one conflict zone affects multiple plan items
- low-confidence target mapping creates low-confidence dependency suggestions
- plan items are related by interface order rather than direct file overlap

## Acceptance criteria
- dependencies are explicit enough to inspect
- conflict zones are explicit enough to matter
- the plan is no longer just a flat list

## Guardrails
- do not overformalize into a giant planner language
- do not hide uncertainty when dependency confidence is weaker

# Stage 4 — Test obligations

## Goal

Attach validation expectations directly to plan items.

## What Codex must build

Codex must ensure Step 2 can assign categories such as:
- unit
- integration
- regression
- smoke
- migration validation
- contract validation

These should be based on:
- plan item type
- affected scope
- public/shared interface impact
- risk level

## Required implementation tasks

1. define the test-obligation categories in code
2. assign them to plan items deterministically
3. ensure one plan item may carry multiple obligation categories
4. ensure high-risk/shared plan items tend toward stronger validation expectations
5. preserve test obligations in both artifact and report

## Required code surfaces

Likely files:
- test-obligation logic
- plan-item enrichment logic
- report/artifact section support

## Inputs
- plan items
- dependency/conflict information
- risk level or source signals

## Outputs
- plan items enriched with test obligations
- optional standalone test-obligation section/debug output

## Edge cases
- low-risk item still needs minimal test expectation
- one plan item affects both internal and public interfaces
- migration-like plan item requires more than one validation type

## Acceptance criteria
- test obligations are explicit per plan item
- obligations are strong enough to inform later TDD/validation work
- obligations are not left as vague prose only

## Guardrails
- do not defer all validation thinking to later steps
- do not confuse test obligations with actual test implementation

