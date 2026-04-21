# Part 2 — Stage 1 and 2: Intake Consumption and Plan-Item Foundation

## Purpose

This part covers the first two implementation stages for Step 2 Batch 2:

1. consuming and validating Step 1 outputs
2. constructing the internal plan-item foundation

These stages form the base for all later planning behavior.

## Why this matters

If Step 2 does not consume Intake cleanly:
- planning will duplicate Intake logic
- carried-forward ambiguity will drift
- artifact assumptions will break

If plan items are weak:
- dependencies become guessy
- conflict analysis becomes vague
- later split/verify stages will have weak structure

These stages must be stable before deeper Step 2 behavior is added.

# Stage 1 — Intake consumption layer

## Goal

Read Step 1 outputs cleanly and normalize them into Step 2-ready inputs.

## What Codex must build

Codex must ensure Step 2 can:
- locate and read `.forge/intake.json`
- validate that it is usable as planning input
- extract the Step 1 sections needed for planning
- surface clear errors if Intake output is missing or structurally unusable
- preserve important carried-forward context instead of flattening it away

## Required implementation tasks

1. audit any existing Step 2 input reading logic
2. define the Step 2 intake-consumption boundary clearly
3. validate presence and usability of required Step 1 sections
4. preserve source metadata and readiness/warning context
5. avoid re-parsing raw spec text when the structured Intake artifact already exists

## Required code surfaces

Likely files:
- Step 2 input/consumption layer
- Step 2 shared contracts
- any helper for reading `.forge/intake.json`

## Inputs
- `.forge/intake.json`

## Outputs
- normalized Step 2 planning input object
- validation errors/warnings if Step 1 output is missing or weak

## Edge cases
- Intake artifact missing
- Intake artifact exists but is incomplete
- Intake artifact has warnings but is still usable
- Intake artifact says readiness is weak or blocked
- candidate targets are low-confidence

## Acceptance criteria
- Step 2 does not need to reconstruct Intake from scratch
- Step 1 output is consumed in a stable way
- weak-but-usable Intake output remains usable with honest warnings

## Guardrails
- do not let Step 2 become Intake 2.0
- do not discard useful Step 1 uncertainty

# Stage 2 — Plan-item foundation

## Goal

Construct structured plan items from Step 1 planning inputs.

## What Codex must build

Codex must make Step 2 able to produce plan items that capture:
- what needs to be changed
- why the work exists
- which requirements or signals it came from
- likely affected paths/modules
- dependencies (initially attached or attachable)
- risk/test/parallelization metadata placeholders or real values where available

## Required implementation tasks

1. audit any existing plan-item code
2. define the internal plan-item shape in code
3. map Step 1 requirements/candidates into plan items deterministically
4. ensure one requirement may map to one or multiple plan items when needed
5. preserve source traceability from Step 1 into each plan item
6. avoid vague bullet-list planning

## Required code surfaces

Likely files:
- Step 2 shared plan types
- plan-item construction logic
- plan-item helpers

## Inputs
- normalized Step 2 planning input
- task spec
- candidate targets
- repo context
- risk/verification hints from Step 1

## Outputs
- structured plan items

## Edge cases
- very broad requirement creates multiple work units
- low-confidence candidate targets still require planning
- weak scope causes a plan item with stronger ambiguity tagging
- one plan item affects multiple modules

## Acceptance criteria
- plan items are structured and inspectable
- plan items remain traceable to Intake
- plan items are useful enough for later dependency/conflict work

## Guardrails
- do not make plan items so abstract they are useless
- do not let them become execution packets yet

