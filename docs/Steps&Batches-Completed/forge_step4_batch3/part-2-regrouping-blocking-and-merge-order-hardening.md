# Part 2 — Regrouping, Blocking, and Merge-Order Hardening

## Purpose

This part covers the biggest technical work in Batch 3:
- hardening aggressive regrouping semantics
- strengthening blocking semantics
- stabilizing merge-order behavior

This is the operational-safety heavy layer of the finish-and-freeze batch.

## Why this matters

Batch 2 proved the split lane is real.
Batch 3 needs to make the split lane V1-worthwhile and reliable.

Without hardened regrouping and stronger blocking/merge-order semantics:
- workstreams may be hard to audit
- later execution decisions will be under-informed
- blocked and partially blocked work will be harder to operationalize

This part makes the split stage materially stronger.

# Regrouping hardening

## Goal

Keep Batch 2’s more aggressive regrouping, but make it stable and inspectable.

## What Codex must build

Codex must ensure regrouping can:
- improve execution readiness
- improve merge-order clarity
- group items more usefully than the conservative baseline
- still preserve traceability to source plan items and verification findings
- remain explainable in both artifact and report

## Required implementation tasks

1. audit current regrouping logic
2. ensure grouping rationale is explicit and inspectable
3. ensure regrouped workstreams preserve source item references
4. ensure regrouping does not silently erase carried constraints
5. ensure regrouping does not make blocked work harder to understand

## Guardrails for regrouping

Batch 3 may keep regrouping aggressive, but:
- every workstream must remain traceable
- safety and merge-order must outrank convenience
- grouping changes must be explainable
- hidden regrouping side effects are not acceptable

# Blocking hardening

## Goal

Make blocked status operationally useful and semantically stable.

## What Codex must build

Codex must harden distinctions such as:
- blocked item
- blocked stream
- partially blocked stream
- stream can proceed with constraints
- stream cannot proceed until prerequisite or mitigation is satisfied

Blocked status must become a first-class and inspectable concept.

## Required implementation tasks

1. define or stabilize blocked-item versus blocked-stream semantics
2. define partially blocked semantics
3. ensure blocked reasons are structured, not buried in prose
4. ensure blocked status can reference the constraining finding, mitigation, or prerequisite
5. ensure blocked outputs remain useful even when execution cannot proceed

# Merge-order hardening

## Goal

Make merge-order expectations stable and operationally useful.

## What Codex must build

Codex must ensure merge-order data can clearly represent:
- hard merge prerequisites
- protected merge ordering
- serialization requirements
- merge-order cautions that do not fully block execution

## Required implementation tasks

1. audit current merge-order logic
2. stabilize merge-order modeling in code
3. ensure merge-order can reference its source constraint/finding
4. ensure merge-order appears clearly in artifact/report/debug outputs
5. ensure merge-order interacts correctly with blocked or partially blocked streams

## Required code surfaces

Likely files:
- regrouping logic
- workstream construction helpers
- blocking logic
- merge-order logic
- workstream result types
- artifact/report/debug support for split semantics

## Inputs
- Step 3 verify artifact data
- workstreams from Batch 2 foundations
- structural/formal findings
- TLC constraints and mitigations
- carried-forward warnings/confidence/readiness

## Outputs
- hardened workstream grouping
- hardened blocked and partially blocked semantics
- hardened merge-order semantics

## Edge cases
- one stream is mostly valid but contains a blocked sub-scope
- one blocking reason constrains several streams differently
- merge order exists without absolute blocking
- regrouping improves clarity but creates more complex dependency edges
- warning-heavy input creates cautious rather than blocked outputs

## Acceptance criteria

- regrouping remains aggressive but auditable
- blocked semantics are explicit and useful
- merge-order semantics are explicit and useful
- split outputs become more operationally meaningful

## Guardrails

- do not hide blocked conditions inside stream descriptions
- do not widen regrouping so much that traceability weakens
- do not imply free execution where merge or blocking constraints remain

