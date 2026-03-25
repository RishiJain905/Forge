# Part 5 — Carry-Forward Rules, Readiness, and First Build Order

## Purpose

This file defines:
- how Step 2 uncertainty must carry into Step 3
- how verification readiness/status should work
- the first implementation order for Step 3

This keeps Step 3 honest and buildable.

## Why this matters

Without carry-forward honesty:
- Step 3 may look more certain than the plan deserves
- formal verification cases may be treated as stronger than their inputs justify
- later steps may misread verification results

Without a build order:
- formal tooling may be started before targets/cases exist
- output artifacts may be built before result semantics are stable
- TLC integration may be attempted before state models are defined

This file prevents that.

## Carry-forward rules from Step 2

Step 3 must preserve and react to:
- planning ambiguities
- warnings
- low-confidence plan areas
- broad conflict zones
- cautious parallelization categories
- planning readiness/status

These should influence:
- which targets are selected
- whether structural-only checks are used
- whether formal modeling is justified
- whether findings are reported as constrained, partial, or high-confidence

Step 3 must not silently erase prior uncertainty.

## Verification readiness/status

Step 3 should communicate:
- whether verification can proceed
- whether only structural checks were possible
- whether formal cases were modeled
- whether TLC ran
- whether blocking issues remain
- whether later steps can proceed and under what constraints

This does not need to become a giant rules engine, but it must be real and useful.

## Recommended first build order

### Stage 0 — Freeze Step 3 contract
Before deep coding:
- freeze Batch 1 Step 3 behavior
- freeze required outputs
- freeze the two-lane architecture
- freeze the formal-lane/TLA+/TLC entry points

### Stage 1 — Stabilize Step 3 types/contracts
Create or stabilize the shared types for:
- verification artifact
- verification targets
- verification cases
- lane assignments
- structural findings
- formal findings
- state models
- TLA+ spec references/results
- TLC status/results
- verification readiness/status

### Stage 2 — Plan consumption layer
Implement the logic that reads and validates Step 2 artifact input cleanly.

### Stage 3 — Verification target/case construction
Implement deterministic selection and construction of targets/cases.

### Stage 4 — Structural verification lane
Implement structural checks and findings.

### Stage 5 — Formal lane foundations
Implement state-model construction, TLA+ generation, and TLC result representation/entry.

### Stage 6 — Artifact and report assembly
Build `.forge/verify.json` and `.forge/reports/verify-report.md`.

### Stage 7 — Persistence and command wiring
Persist outputs and wire `forge verify` to the Step 3 path.

### Stage 8 — Tests
Harden tests around the implemented verification flow.

## Acceptance gates

### Gate 1 — Contract gate
Must be true:
- Step 3 input/output contract is stable
- two-lane architecture is stable
- formal-lane participation in V1 is stable

### Gate 2 — Target/case gate
Must be true:
- verification targets/cases are structured
- lane assignment is explicit

### Gate 3 — Formal-entry gate
Must be true:
- state-model concept is explicit
- TLA+ generation concept is explicit
- TLC result model is explicit

### Gate 4 — Output gate
Must be true:
- `verify.json` is coherent
- `verify-report.md` is coherent
- structural and formal results are clearly separated

### Gate 5 — Runnable gate
Must be true:
- `forge verify` can run from Step 2 output in a meaningful way once implemented
- outputs are written to `.forge/`
- the implemented path is test-protected enough to continue

## What Codex must build

Codex must implement Step 3 in the staged order above and avoid skipping foundational stages.

Do not:
- start with TLC integration before case models exist
- start with report polish before result semantics are stable
- implement later splitting/execution behavior
- hide weak verification confidence behind prose

## Acceptance criteria

This part is complete when:
- carry-forward rules are explicit
- readiness/status intent is explicit
- the first build order is explicit
- acceptance gates are explicit
- implementation can proceed in order without reopening Batch 1 questions

