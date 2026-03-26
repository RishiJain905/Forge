# Part 2 — Stage 1 and 2: Plan Consumption, Verification Targets, and Structural Lane

## Purpose

This part covers the first two implementation stages for Step 3 Batch 2:

1. consuming and validating Step 2 outputs
2. constructing verification targets/cases and the structural verification lane

These stages form the base for all later formal verification behavior.

## Why this matters

If Step 3 does not consume planning output cleanly:
- verification will duplicate planning logic
- carried-forward uncertainty will drift
- formal case selection will be built on weak assumptions

If targets/cases are weak:
- structural findings become vague
- TLA+ effort gets wasted on bad inputs
- later verification outputs lose trust

These stages must be stable before deeper formal behavior is added.

# Stage 1 — Plan consumption layer

## Goal

Read Step 2 outputs cleanly and normalize them into Step 3-ready inputs.

## What Codex must build

Codex must ensure Step 3 can:
- locate and read `.forge/plan.json`
- validate that it is usable as verification input
- extract the Step 2 sections needed for verification
- surface clear errors if planning output is missing or structurally unusable
- preserve important carried-forward context instead of flattening it away

## Required implementation tasks

1. audit any existing Step 3 input reading logic
2. define the Step 3 plan-consumption boundary clearly
3. validate presence and usability of required Step 2 sections
4. preserve source metadata and readiness/warning context
5. avoid reconstructing plan semantics from prose when the structured plan artifact already exists

## Required code surfaces

Likely files:
- Step 3 input/consumption layer
- Step 3 shared contracts
- helper for reading `.forge/plan.json`

## Inputs
- `.forge/plan.json`

## Outputs
- normalized Step 3 verification input object
- validation errors/warnings if Step 2 output is missing or weak

## Edge cases
- planning artifact missing
- planning artifact exists but is incomplete
- planning artifact has warnings but is still usable
- planning artifact says readiness is weak or blocked
- plan items are low-confidence
- conflict zones are broad rather than precise

## Acceptance criteria
- Step 3 does not need to reconstruct planning from scratch
- Step 2 output is consumed in a stable way
- weak-but-usable planning output remains usable with honest warnings

## Guardrails
- do not let Step 3 become Plan 2.0
- do not discard useful Step 2 uncertainty

# Stage 2 — Verification target/case construction and structural lane

## Goal

Construct structured verification targets/cases and implement the structural lane.

## What Codex must build

Codex must make Step 3 able to:
- produce verification targets from risky Step 2 planning areas
- produce one or more verification cases from each target
- classify cases into structural lane, formal lane, or both
- run structural checks such as:
  - dependency contradictions
  - missing sequencing
  - unsafe parallelization
  - conflict-zone hazards
  - contradictory merge/serialization assumptions

## Required implementation tasks

1. audit any existing verification target/case code
2. define the internal target and case shapes in code
3. map Step 2 risky areas into verification targets/cases deterministically
4. preserve traceability from Step 2 into each case
5. implement structural rule checks
6. record structural findings in a stable result format

## Required code surfaces

Likely files:
- Step 3 shared verification types
- verification target/case construction logic
- structural-verification module
- findings/result helpers

## Inputs
- normalized Step 3 verification input
- plan items
- dependencies
- conflict zones
- parallelization categories
- carried-forward warnings/confidence

## Outputs
- structured verification targets
- structured verification cases
- structural findings/results

## Edge cases
- one risky area produces both structural and formal cases
- one structural case covers multiple plan items
- warning-heavy plan still deserves structural checks
- structural contradictions appear before formal modeling begins

## Acceptance criteria
- verification targets/cases are structured and inspectable
- structural lane results are meaningful
- later formal work has a strong foundation

## Guardrails
- do not collapse target selection into freeform prose
- do not skip structural checks just because formal checks exist

