# Part 2 — Tier 2 Formal-Case Expansion and TLC Hardening

## Purpose

This part covers the biggest technical work in Batch 3:
- implementing the Tier 2 formal cases
- broadening formal coverage carefully where justified
- hardening TLC output semantics and trace handling

This is the formal-methods heavy layer of the finish-and-freeze batch.

## Why this matters

Batch 2 proved the formal lane is real.
Batch 3 needs to make the formal lane V1-worthwhile.

Without Tier 2 expansion and stronger TLC semantics:
- Forge’s formal story will feel too narrow
- later split decisions will be under-informed
- verification results will be harder to trust and operationalize

This part makes the formal lane meaningfully stronger.

# Tier 2 formal-case expansion

## Goal

Implement the required next-wave formal cases as real state-model/TLA+/TLC coverage.

## Required Tier 2 cases

Batch 3 must add real support for:
- multi-agent handoff chains
- queue / claim-release lifecycle
- merge-order safety across shared artifacts
- parallel overlap with shared resource mutation
- failure-recovery state loops

## What Codex must build

Codex must ensure each Tier 2 case can:
- be selected as a formal verification case
- be modeled as a state-oriented system
- generate a real TLA+ spec
- run through TLC
- produce meaningful formal findings and constraints

## Required implementation tasks

### Multi-agent handoff chains
1. model chained responsibility transfer
2. capture invalid handoff or dropped ownership states
3. check ordering and exclusivity assumptions

### Queue / claim-release lifecycle
1. model queued, claimed, released, retried, and terminal states
2. capture double-claim or lost-claim failures
3. check idempotent lifecycle assumptions where relevant

### Merge-order safety across shared artifacts
1. model shared-artifact mutation order
2. detect unsafe merge sequences or missing serialization
3. capture invalid interleavings that violate safety assumptions

### Parallel overlap with shared resource mutation
1. model concurrent mutation against shared resources
2. detect stale state or conflicting updates
3. capture required guards/versioning/serialization assumptions

### Failure-recovery state loops
1. model failure, rollback/retry, reassignment, and recovery paths
2. detect loops that can get stuck or duplicate work
3. capture recovery invariants and forbidden states

## Broadening rule

Batch 3 may broaden a little beyond Tier 2 where clearly justified, but only if:
- the new case is high-value
- it maps well to state-space reasoning
- it does not weaken Tier 2 implementation quality

Tier 2 completion takes priority over breadth for breadth’s sake.

# TLC hardening

## Goal

Make TLC outputs operationally useful and semantically stable.

## What Codex must build

Codex must harden handling of statuses such as:
- spec generated but TLC not run
- TLC passed
- TLC failed
- TLC errored
- TLC partially usable or inconclusive where applicable

Codex must also harden:
- trace capture
- error capture
- how failed formal checks constrain later steps
- how weak inputs affect the confidence of formal results

## Required implementation tasks

1. define or stabilize the TLC result model in code
2. ensure traces/errors are representable in the artifact/report/debug outputs
3. distinguish true model failure from tooling failure
4. define how failed TLC results constrain later steps
5. define how inconclusive or partial formal outcomes should be reported honestly

## Required code surfaces

Likely files:
- state-model builder
- TLA+ generation module
- TLC runner/adapter
- TLC result types
- formal findings/result helpers
- artifact/report/debug section support for formal results

## Inputs
- Tier 1 and Tier 2 formal verification cases
- Step 2 planning context
- carried-forward confidence/warnings
- existing formal-lane foundations from Batch 2

## Outputs
- expanded formal coverage
- hardened TLC semantics
- stronger formal findings/traces/constraints

## Edge cases
- one Tier 2 case maps to multiple related state models
- TLC fails because the model is invalid versus because the property is violated
- a formal case is useful but inconclusive due to weak inputs
- broad conflict zones create a cautious rather than clean formal outcome

## Acceptance criteria

- Tier 2 formal cases are materially implemented
- TLC semantics are stable and explicit
- traces/errors are usable
- formal findings are stronger and more operationally meaningful
- formal coverage is broader without losing quality

## Guardrails

- do not fake Tier 2 support
- do not hide TLC failure/error states
- do not broaden so much that the main Tier 2 cases become shallow

