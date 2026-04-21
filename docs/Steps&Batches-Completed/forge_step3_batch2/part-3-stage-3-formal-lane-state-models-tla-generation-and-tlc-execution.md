# Part 3 — Stage 3: Formal Lane, State Models, TLA+ Generation, and TLC Execution

## Purpose

This part covers the formal lane implementation for Step 3 Batch 2.

This is where Forge begins delivering on its core differentiator in code:
- state-model construction
- real TLA+ generation
- real TLC execution
- formal findings captured into verification results

## Why this matters

If this part is weak or fake:
- Forge loses its most interesting technical edge
- Step 3 becomes generic reasoning about plans
- later verification work will be much harder to trust

This stage must be selective, but it must be real.

## Formal lane goal

For the first high-value subset of cases, Step 3 must:
1. build a state-oriented model
2. generate a real TLA+ spec
3. run TLC
4. capture the result meaningfully

This is required in V1.

## Initial high-value formal subset

Batch 2 should implement real TLA+/TLC for cases such as:
- retry / reassign flow
- ownership transition
- duplicate execution risk
- stale write / version validity
- ordering constraint / serialization case

These are the first subset because they:
- map well to state models
- reflect real risky coordination logic
- materially strengthen Forge’s verification story

## What Codex must build

Codex must build Step 3 so that the formal lane can:
- classify a case as formal-worthy
- construct a usable state model
- generate a TLA+ spec representation from that model
- execute TLC against that spec
- capture pass/fail/error/trace information
- attach those results to the verification artifact/report

## Required implementation tasks

### State-model construction
1. define the internal state-model concept in code
2. map formal cases into entities, states, transitions, invariants, and unsafe conditions
3. ensure state models are inspectable and traceable to the original case

### TLA+ generation
1. define how TLA+ specs are generated from state models
2. ensure the output is real spec text or a real spec representation
3. preserve linkage between verification case and generated spec

### TLC execution
1. define or implement the TLC execution path/adapter
2. run TLC for the selected initial high-value subset
3. capture statuses such as:
   - spec generated, TLC not run
   - TLC passed
   - TLC failed
   - TLC errored
4. capture useful output such as traces/errors when available

### Formal findings/result modeling
1. define the formal findings shape in code
2. distinguish formal findings from structural findings
3. preserve traces and mitigation/constraint notes where appropriate

## Required code surfaces

Likely files:
- state-model builder
- TLA+ generation module
- TLC runner/adapter
- formal-result types
- verification findings helpers
- report/artifact section support for formal results

## Inputs
- formal-lane verification cases
- Step 2 planning context
- structural risk information if relevant

## Outputs
- state models
- generated TLA+ specs or spec references
- TLC results/status
- formal findings/constraints/traces

## Edge cases
- a case qualifies for formal modeling but the model is incomplete
- TLA+ generation succeeds but TLC errors
- TLC runs and finds a failing path
- TLC passes but the case still carries caution because the planning input was weak
- multiple formal cases refer to the same risky planning area
- some high-value categories are supported before others

## Acceptance criteria
- real state models exist
- real TLA+ specs are generated
- real TLC execution exists for the first high-value subset
- formal findings are represented distinctly and meaningfully
- this is enough to make Step 3 materially real, not placeholder-based

## Guardrails
- do not pretend every case needs formal modeling
- do not fake TLC participation
- do not hide TLC failure or error states
- do not overexpand formal coverage before the first subset is stable

