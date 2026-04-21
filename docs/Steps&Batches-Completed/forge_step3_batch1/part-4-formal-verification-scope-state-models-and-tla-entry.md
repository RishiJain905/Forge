# Part 4 — Formal Verification Scope, State Models, and TLA+/TLC Entry

## Purpose

This file defines where and how real TLA+/TLC-backed verification begins in Forge V1.

This is the most important differentiator of Step 3 and of Forge more broadly.

## Why this matters

For Forge, TLA+ and TLC are not optional future ideas.
They are part of the product’s core verification identity.

If Batch 1 treats them as vague placeholders:
- Step 3 will drift into generic reasoning about plans
- Forge loses its strongest technical differentiator
- later implementation will not know where formal verification actually begins

This file prevents that.

## V1 formal verification scope

In V1, formal verification should apply to risky coordination/workflow logic and plan logic, especially:
- retries
- handoffs
- ownership transitions
- duplicate execution risk
- stale writes
- ordering constraints
- unsafe serialization assumptions
- risky parallel overlap where state transitions matter

V1 should not try to use TLA+/TLC for:
- ordinary CRUD behavior
- broad UI/business logic with no state-space benefit
- generic app correctness claims that are not tied to risky coordination/workflow behavior

## Formal lane entry rule

A plan area should enter the formal lane when:
- the risk is state-machine-like
- multiple transitions or actors can interleave
- retries/failures/reassignments matter
- ownership or version validity matters
- order of operations is crucial
- a structural check alone is not strong enough

If those properties are absent, the structural lane may be sufficient.

## State-model construction

Before generating TLA+, Step 3 should build a state-oriented representation for the risky case.

A useful state model should capture:
- variables/entities involved
- states or statuses
- allowed transitions
- unsafe states or forbidden outcomes
- invariants or properties to check
- initial conditions where needed

This state model is the bridge between the plan and TLA+ generation.

## TLA+ generation in V1

Step 3 Batch 1 must define real support for:
- turning a formal verification case into a TLA+ spec representation
- storing/generated spec text or spec references
- associating that spec with the verification case and final artifact

The generation path should be explicit and first-class, not hand-wavy.

## TLC execution in V1

Step 3 Batch 1 must also define real TLC participation in V1.

That means:
- TLC is part of the architecture
- formal cases are expected to be runnable through TLC
- the verification artifact has a place for TLC results
- the system distinguishes between:
  - spec generated but TLC not run
  - TLC run and passed
  - TLC run and failed
  - TLC run errored or was invalid

Actual implementation work can deepen in later batches, but the architecture and contract must support real TLC starting in V1.

## What Codex must build

Codex must build Step 3 so that:
- formal verification entry is explicit
- state-model generation is explicit
- TLA+ generation is explicit
- TLC execution is explicit
- formal findings/results/traces have a real home in the outputs

## Required implementation tasks

1. define the formal-lane entry criteria
2. define the internal state-model concept
3. define how TLA+ specs are represented/generated
4. define how TLC execution results are represented
5. define how formal findings/traces/errors are attached to verification cases
6. ensure formal verification remains selective and justified

## Required code surfaces

Likely future surfaces:
- state-model builder
- TLA+ generation module
- TLC runner/adapter
- formal verification result types
- report/artifact section support for formal findings

## Inputs
- formal-lane verification cases
- Step 2 plan context
- structural risk information if relevant

## Outputs
- state models
- generated TLA+ specs or spec references
- TLC execution results/status
- formal findings/constraints/traces

## Edge cases
- a case qualifies for formal modeling but the model is weak/incomplete
- TLA+ spec generation succeeds but TLC fails to run
- TLC runs and finds a failing path
- TLC passes but the case still carries caution due to weak inputs
- multiple formal cases map to the same risky planning area

## Acceptance criteria

This part is complete when:
- V1 formal scope is explicit
- state-model construction is explicit
- TLA+ generation is explicit
- TLC execution is explicitly part of V1
- later implementation would not need to guess where formal verification begins

## Guardrails

- do not pretend formal verification applies to everything
- do not reduce TLA+/TLC to a vague future hook
- do not claim proofs where TLC did not actually validate the case

