# Part 1 — Intake Internal Architecture and Module Map

## Purpose

This document defines the internal architecture for Step 1: Intake.

It answers:
- what the main orchestration flow should be
- what responsibilities belong inside Intake
- how the internal services should be grouped
- what data flow should look like between those services
- where safe simplification is allowed

This is not an abstract ideal architecture. It is a practical V1 structure intended to work with the existing Forge codebase and avoid unnecessary churn.

---

## Why this matters

Batch 1 defined what Intake must do.
This part defines how Intake should be organized so that:
- the command stays readable
- responsibilities stay separated enough to debug
- the module count stays reasonable
- Codex does not invent weird architecture mid-build
- tests can map to real units of behavior

A strong architecture here reduces confusion in:
- implementation
- maintenance
- debugging
- later agent handoffs

---

## High-level architectural rule

Intake should use:
- one clear orchestrator
- a small set of focused domain services
- shared types/contracts
- artifact/report persistence
- status + readiness resolution
- optional debug outputs
- testable deterministic internals

This means Intake should not be:
- a giant monolith file
- a maze of tiny wrappers
- an over-abstracted plugin framework

---

## Recommended Intake architecture

### Layer 1 — Command entry
Responsible for:
- parsing CLI input
- validating top-level command arguments
- invoking the Intake orchestrator
- returning process status

This layer should stay thin.

### Layer 2 — Intake orchestrator
Responsible for:
- executing the full Intake pipeline in order
- coordinating all sub-services
- collecting intermediate outputs
- resolving final status/readiness
- triggering persistence/reporting

This is the heart of Step 1.

### Layer 3 — Intake domain services
These are the focused internals that do the real work.

Recommended service groups:
1. input resolution
2. task parsing and normalization
3. repo scanning and context detection
4. candidate targeting
5. risk and ambiguity analysis
6. verification target detection
7. confidence scoring
8. artifact/report assembly
9. persistence

### Layer 4 — Shared contracts and utilities
Responsible for:
- shared types
- schemas
- enums
- constants
- path helpers
- low-level utility functions

This layer should stay boring and stable.

---

## Core orchestration flow

The Step 1 orchestrator should run in this order:

1. resolve runtime input
2. validate input contract
3. load spec/prompt/notes/constraints
4. normalize task request
5. scan repo and detect context
6. derive candidate targets
7. analyze risks
8. detect ambiguities/warnings
9. infer implementation necessities
10. propose initial verification targets
11. score confidence
12. resolve final status + planning readiness
13. build machine-readable artifact
14. build human-readable report
15. persist outputs to `.forge/`
16. return structured result

This order should remain stable unless a strong implementation reason forces change.

---

## Orchestrator design rule

The orchestrator should be the only place that knows the full sequence.

Submodules should not call each other in arbitrary ways.

Preferred pattern:
- orchestrator calls service
- service returns structured output
- orchestrator passes structured output to next step

Avoid:
- circular service dependencies
- services writing directly to disk without orchestration control
- hidden status mutation across modules

---

## Recommended service map

### 1. Input resolution service
Responsibilities:
- resolve repo root
- resolve CLI mode (spec vs prompt)
- load optional files
- normalize raw runtime inputs

Outputs:
- resolved input object
- input validation issues
- raw source payloads

### 2. Task parsing and normalization service
Responsibilities:
- parse markdown specs
- normalize prompt mode into task shape
- extract explicit requirements
- extract constraints
- extract acceptance criteria
- detect risky phrases
- detect mentioned paths/modules/tests
- generate open questions
- infer implementation necessities without inventing product scope

Outputs:
- normalized task spec
- parse warnings
- task-level ambiguities

### 3. Repo scanning and context service
Responsibilities:
- inspect repository structure
- detect languages
- detect frameworks
- detect package manager
- detect key directories
- detect candidate entry points
- detect test frameworks and test locations
- inspect git context when available
- summarize repo layout

Outputs:
- repo context object
- repo scan warnings

### 4. Candidate targeting service
Responsibilities:
- map task signals to likely files/modules
- prioritize focus paths when provided
- apply strict-focus rules if requested
- identify shared-risk files
- attach reasons/confidence notes to candidate matches

Outputs:
- candidate targets section
- candidate targeting warnings

### 5. Risk and ambiguity analysis service
Responsibilities:
- detect coordination risk signals
- detect migration, test, API compatibility, and overlap risks
- classify ambiguity types
- assign ambiguity severity
- generate warnings where confidence is weak but output is still usable

Outputs:
- risk analysis section
- ambiguity list
- warning list

### 6. Verification target detection service
Responsibilities:
- propose initial targets for later `forge verify`
- map signals into categories like retry logic, ownership, migration order, parallel overlap, stale write, queue state, or API contract

Outputs:
- initial verification target list

### 7. Confidence and readiness service
Responsibilities:
- score confidence
- resolve overall status
- determine whether `forge plan` can proceed
- produce blocking issues and recommended user actions when needed

Outputs:
- confidence section
- next-step readiness section
- final Intake status

### 8. Artifact/report assembly service
Responsibilities:
- build `.forge/intake.json`
- build `.forge/reports/intake-report.md`
- optionally build debug artifacts

Outputs:
- machine-readable artifact
- human-readable report
- optional debug data blobs

### 9. Persistence service
Responsibilities:
- ensure output directories exist
- write artifacts
- write debug files
- preserve stable file paths

Outputs:
- persisted files on disk
- persistence result metadata

---

## Recommended shared types and contracts

The following stable contracts should exist in shared or intake-specific type files:
- `ResolvedIntakeInput`
- `NormalizedTaskSpec`
- `RepoContext`
- `CandidateTargets`
- `RiskAnalysis`
- `Ambiguity`
- `WarningItem`
- `VerificationTarget`
- `ConfidenceSummary`
- `NextStepReadiness`
- `IntakeArtifact`
- `IntakeRunResult`

These should map tightly to the Batch 1 artifact contract.

---

## Data flow contract

Preferred data flow:

```text
CLI args
→ input resolution
→ task normalization
→ repo context detection
→ candidate targeting
→ risk/ambiguity analysis
→ verification target detection
→ confidence/readiness resolution
→ artifact/report assembly
→ persistence
→ command result
```

The flow should be visible from reading the orchestrator file.

---

## Safe simplification rules

If the current codebase has very thin files or duplicated behavior, the following simplifications are allowed.

### Allowed
- merge closely related tiny files into one clearer service file
- collapse redundant status/confidence helpers into one confidence/readiness module
- merge artifact section builders if they are overly fragmented and always edited together
- consolidate duplicate input validation into one obvious validation path

### Not allowed
- moving repo scanning into task parsing
- mixing persistence logic into parsing logic
- hiding final status resolution inside scattered helper files
- mixing CLI concerns into domain services
- collapsing all services into one god file

---

## Required architecture outcomes

Codex or the implementing engineer must ensure:
- one orchestrator owns the end-to-end Intake sequence
- domain services have clear roles
- artifact building is separated from persistence
- confidence/readiness logic has a clear home
- candidate targeting is not mixed into raw repo scanning
- task normalization is not mixed into final report generation

---

## Edge cases to account for

Architecture must support these cases without design hacks:
- spec mode with rich markdown
- prompt mode with minimal detail
- no git available
- focus paths present
- strict focus enabled
- low-confidence repo mapping
- partial success with warnings
- full failure with useful report output
- optional LLM assistance turned on or off

---

## Acceptance criteria

This part is complete when:
- the Intake pipeline has one obvious orchestration entrypoint
- service boundaries are defined well enough to implement against
- no core responsibility is unowned
- no single file is expected to do everything
- no over-abstracted layers are introduced just for style
- the architecture clearly supports the Batch 1 artifact contract

---

## Guardrails

- Keep V1 practical.
- Prefer predictable service boundaries over clever abstractions.
- Do not introduce framework-like plugin systems.
- Do not redesign Step 1 behavior here.
- Keep the architecture shaped around the actual work Intake must perform.
