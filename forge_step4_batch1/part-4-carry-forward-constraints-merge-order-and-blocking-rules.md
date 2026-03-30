# Part 4 — Carry-Forward Constraints, Merge-Order, and Blocking Rules

## Purpose

This file defines how Split must preserve prior-step constraints and turn them into:
- merge-order expectations
- blocked work identification
- stream-level safety constraints

These are critical because they determine whether multi-stream execution is actually safe.

## Why this matters

If Step 4 ignores or weakens prior constraints:
- verification value is lost
- unsafe streams get created
- merge conflicts become reliability failures later
- blocked work leaks into execution

Step 4 must be strict and honest.

## Carry-forward rules from prior steps

Step 4 must preserve and react to:
- Step 2 plan dependencies
- Step 2 conflict zones
- Step 2 test obligations
- Step 3 structural findings
- Step 3 formal findings
- TLC constraints and mitigations
- carried-forward ambiguities/warnings/confidence
- Step 3 readiness/status

These should influence:
- whether a work item is split at all
- which stream category it can enter
- whether it must wait on another stream
- whether it must be blocked
- whether merge order must be protected

## Merge-order rules

Split must define merge-order expectations explicitly where needed.

Examples:
- foundational stream must merge before dependent stream
- protected stream must merge only after verification-sensitive stream completes
- shared-artifact streams require constrained merge order
- streams touching central interfaces/types may require serialization

Merge order should be a first-class output, not just implied prose.

## Blocking rules

Split must identify blocked work explicitly.

Blocked items/streams may result from:
- unresolved formal failures
- unsafe serial/parallel contradictions
- missing prerequisite stream
- unresolved mitigation requirements
- low-confidence areas that cannot safely proceed yet

Blocked status should not be hidden.

## What Codex must build

Codex must ensure:
- all relevant prior constraints can be carried into split output
- merge-order expectations are explicit
- blocked work is explicit
- later execution can use these rules without guessing

## Required implementation tasks

1. define how prior-step constraints are represented in Step 4
2. define merge-order modeling in code
3. define blocked-item/blocked-stream modeling in code
4. ensure carried-forward concerns remain visible in both artifact and report
5. ensure Split does not silently resolve prior risk without justification

## Inputs

From prior steps:
- dependencies
- conflict zones
- test obligations
- structural findings
- formal findings
- TLC constraints/mitigations
- readiness and warning context

## Outputs

- workstreams with carried-forward constraints
- merge-order data
- blocked items/streams
- split readiness/context

## Edge cases

- a blocked stream still has useful partial metadata
- merge order is required even when streams are otherwise parallel-safe
- a single mitigation changes a stream from safe-parallel to protected-merge
- warnings affect only certain streams, not the whole split

## Acceptance criteria

This part is complete when:
- carry-forward constraints are explicit
- merge-order rules are explicit
- blocking rules are explicit
- split output remains honest about uncertainty and safety

