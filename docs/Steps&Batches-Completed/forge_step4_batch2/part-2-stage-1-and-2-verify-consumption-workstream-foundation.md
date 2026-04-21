# Part 2 — Stage 1 and 2: Verify Consumption and Workstream Foundation

## Purpose

This part covers the first two implementation stages for Step 4 Batch 2:

1. consuming and validating Step 3 outputs
2. constructing the internal workstream foundation

These stages form the base for all later split behavior.

## Why this matters

If Step 4 does not consume verification output cleanly:
- split will duplicate verification logic
- carried-forward safety constraints will drift
- workstream decisions will be built on weak assumptions

If workstreams are weak:
- merge order becomes vague
- blocked work becomes fuzzy
- later execution work will have weak structure

These stages must be stable before deeper Step 4 behavior is added.

# Stage 1 — Verify consumption layer

## Goal

Read Step 3 outputs cleanly and normalize them into Step 4-ready inputs.

## What Codex must build

Codex must ensure Step 4 can:
- locate and read `.forge/verify.json`
- validate that it is usable as split input
- extract the Step 3 sections needed for splitting
- surface clear errors if verification output is missing or structurally unusable
- preserve important carried-forward context rather than flattening it away

## Required implementation tasks

1. audit any existing Step 4 input reading logic
2. define the Step 4 verify-consumption boundary clearly
3. validate presence and usability of required Step 3 sections
4. preserve source metadata and readiness/warning context
5. avoid reconstructing verification semantics from prose when the structured verify artifact already exists

## Required code surfaces

Likely files:
- Step 4 input/consumption layer
- Step 4 shared contracts
- helper for reading `.forge/verify.json`

## Inputs
- `.forge/verify.json`

## Outputs
- normalized Step 4 split input object
- validation errors/warnings if Step 3 output is missing or weak

## Edge cases
- verify artifact missing
- verify artifact exists but is incomplete
- verify artifact has warnings but is still usable
- verify artifact says readiness is weak or blocked
- findings are broad rather than precise
- some streams may already be implicitly blocked by verification outcomes

## Acceptance criteria
- Step 4 does not need to reconstruct verification from scratch
- Step 3 output is consumed in a stable way
- weak-but-usable verification output remains usable with honest warnings

## Guardrails
- do not let Step 4 become Verify 2.0
- do not discard useful Step 3 uncertainty

# Stage 2 — Workstream foundation

## Goal

Construct structured workstreams from verified plan items and constraints.

## What Codex must build

Codex must make Step 4 able to produce workstreams that capture:
- what grouped work belongs together
- why the grouping exists
- which source plan and verification items it came from
- likely affected paths/modules
- stream dependencies
- stream category
- merge-order and blocking metadata placeholders or real values where available

## Required implementation tasks

1. audit any existing workstream code
2. define the internal workstream shape in code
3. map verified plan items into workstreams deterministically
4. allow more aggressive regrouping where it clearly improves safety, merge order, or stream clarity
5. preserve source traceability from Step 2 and Step 3 into each workstream
6. avoid vague bucket-based grouping

## Required code surfaces

Likely files:
- Step 4 shared workstream types
- workstream construction logic
- grouping helpers

## Inputs
- normalized Step 4 split input
- verified plan items
- structural/formal findings
- constraints/mitigations
- dependencies/conflict zones
- likely touched paths/modules

## Outputs
- structured workstreams

## Edge cases
- one plan item cannot be safely grouped with any other
- one workstream groups multiple related items but remains safe and auditable
- a blocked item still needs a structured workstream shell
- one workstream affects multiple modules

## Acceptance criteria
- workstreams are structured and inspectable
- workstreams remain traceable to prior artifacts
- regrouping improves execution readiness without weakening auditability

## Guardrails
- do not make workstreams so abstract they are useless
- do not let regrouping destroy source traceability

