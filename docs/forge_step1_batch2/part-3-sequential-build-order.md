# Part 3 — Sequential Build Order for Step 1 Internals

## Purpose

This document defines the implementation order for Step 1 internals.

It answers:
- what should be built first
- what should be stabilized before later work begins
- what dependencies exist between internal modules
- what not to touch too early

The goal is to reduce rework and avoid having later files built on top of unstable foundations.

---

## Why this matters

Step 1 has many moving parts:
- CLI input handling
- task parsing
- repo scanning
- candidate targeting
- risk/ambiguity analysis
- confidence scoring
- reporting
- persistence

If these are built in the wrong order, the result is usually:
- duplicated types
- unstable artifacts
- status logic rewritten repeatedly
- report drift
- tests breaking for moving reasons

This build order is meant to prevent that.

---

## Build strategy

Build Step 1 from the center outward:

1. shared contracts
2. input resolution
3. task normalization
4. repo context detection
5. candidate targeting
6. risk + ambiguity + verification target analysis
7. confidence/readiness resolution
8. artifact assembly
9. report generation
10. persistence
11. orchestrator stabilization
12. command integration
13. test hardening

This order minimizes wasted refactors.

---

## Stage 0 — Freeze contracts before coding deeper

### What must be true first
Before major implementation continues, the following should be stable:
- Batch 1 artifact contract
- Batch 2 module map
- top-level type names
- output paths
- status/warning model

### What to do
- verify the existing code matches Batch 1 contracts where possible
- identify any mismatch early
- do not start adding convenience features yet

### Acceptance criteria
- the target artifact shape is stable enough to code against

---

## Stage 1 — Stabilize shared types and schemas

### What to build
Create or stabilize the shared type layer for Step 1.

Required types include:
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

### Why this comes first
All later services depend on these shapes.

### Acceptance criteria
- types are stable
- service outputs can reference them directly
- no duplicate incompatible type definitions remain

---

## Stage 2 — Stabilize input resolution

### What to build
Implement or stabilize input handling in the input layer.

Required behaviors:
- resolve spec mode vs prompt mode
- validate top-level inputs
- load optional files
- normalize focus paths
- resolve repo root
- surface input-level warnings/errors

### Why this comes early
Everything else depends on correct source input.

### Acceptance criteria
- bad input fails early and clearly
- valid input produces one resolved input object
- spec and prompt modes are both supported cleanly

---

## Stage 3 — Stabilize task parsing and normalization

### What to build
Implement the task parsing layer.

Required behaviors:
- parse markdown or prompt text
- normalize into the task spec shape
- extract explicit requirements, constraints, acceptance criteria, risky phrases
- infer engineering necessities conservatively
- produce open questions for ambiguity

### Why this comes before repo scanning output composition
The parsed task is one of the major signals used by later targeting and analysis.

### Acceptance criteria
- normalized task spec output is stable
- prompt mode does not invent product scope
- irregular markdown still produces useful structured output when possible

---

## Stage 4 — Stabilize repo context detection

### What to build
Implement repository scanning and context detection.

Required behaviors:
- detect languages
- detect frameworks
- detect package manager
- detect test framework / test locations
- detect key directories and entry points
- collect git context when available
- summarize repo layout

### Why this comes now
Candidate targeting depends on real repo context.

### Acceptance criteria
- repo context is usable on supported repos
- no-git repos still work
- missing tests or framework signals become warnings, not crashes

---

## Stage 5 — Implement candidate targeting

### What to build
Map parsed task signals + repo context into candidate files/modules.

Required behaviors:
- likely file matching
- module matching
- focus-aware prioritization
- strict-focus behavior
- shared-risk file detection
- candidate confidence notes

### Why this comes after parsing + repo context
Candidate targeting is a synthesis step, not a primitive.

### Acceptance criteria
- plausible candidate files are produced for realistic tasks
- focus behavior works without blinding the system
- reasons for candidate selection are inspectable

---

## Stage 6 — Implement risk, ambiguity, and verification-target analysis

### What to build
Analyze the gathered data to produce:
- risk zones
- ambiguities
- warnings
- initial verification targets

Required behaviors:
- classify ambiguity types
- assign ambiguity severity
- detect migration/test/API/parallelization risks
- detect verification-worthy patterns like retry logic or ownership

### Why here
This stage depends on both task and repo mapping being present.

### Acceptance criteria
- ambiguities are explicit
- warnings are differentiated from hard failures
- verification targets are grounded, not random

---

## Stage 7 — Implement confidence and readiness resolution

### What to build
Score confidence and determine whether planning can proceed.

Required behaviors:
- resolve confidence categories
- resolve final status (`success`, `warning`, `failed`)
- populate `next_step_readiness`
- provide blocking issues and recommended user actions

### Why here
Confidence should reflect all earlier stages, not just parsing.

### Acceptance criteria
- confidence is based on observable signals
- readiness is meaningful
- failure/warning logic matches Batch 1

---

## Stage 8 — Implement artifact assembly

### What to build
Assemble the final machine-readable artifact from the outputs of earlier services.

Required behaviors:
- build the top-level intake artifact shape
- include all required sections
- attach metadata like status, input mode, timestamp, and readiness

### Why here
Artifact assembly should happen only after the content-producing services are stable.

### Acceptance criteria
- `.forge/intake.json` content is complete and contract-compliant before persistence

---

## Stage 9 — Implement report generation

### What to build
Generate the human-readable report from the artifact or equivalent final sections.

Required behaviors:
- include the required report sections
- preserve clarity for human debugging
- surface assumptions, ambiguity, confidence, and planning readiness

### Why after artifact assembly
The report should reflect the final resolved state, not partial intermediate state.

### Acceptance criteria
- report is easy for a developer to inspect
- report matches machine-readable state closely enough to debug with confidence

---

## Stage 10 — Implement persistence

### What to build
Write output files to disk.

Required behaviors:
- create `.forge/` directories as needed
- write intake artifact
- write report
- write optional debug outputs
- preserve stable paths

### Why late
Persistence should be one of the last concerns after content generation is stable.

### Acceptance criteria
- outputs are written reliably
- file paths are stable
- failed runs still persist useful information when possible

---

## Stage 11 — Stabilize the orchestrator

### What to build
Finalize `runner.ts` so it clearly sequences the complete pipeline.

Required behaviors:
- call each service in order
- collect structured outputs
- handle failure and warning flow
- trigger artifact/report assembly
- trigger persistence
- return final result

### Why near the end
The orchestrator should coordinate stable services rather than mask incomplete ones.

### Acceptance criteria
- reading the orchestrator reveals the whole Step 1 sequence clearly
- the orchestrator stays thin enough to read but rich enough to coordinate the full step

---

## Stage 12 — Integrate with the command layer

### What to build
Wire the Intake orchestrator into the actual CLI command.

Required behaviors:
- connect commander parsing to input resolution
- expose the locked CLI flags
- return sensible exit behavior
- surface summary info to terminal output if desired without replacing artifacts

### Acceptance criteria
- `forge intake` runs end-to-end from the command line
- CLI behavior matches Batch 1

---

## Stage 13 — Harden with tests

### What to build
Add or stabilize test coverage around each major service and the full flow.

### Why last
Tests should harden stable behavior, not chase a shifting architecture.

### Acceptance criteria
- service-level behavior is covered
- key end-to-end flow is covered
- warning/failure scenarios are covered
- strict-focus and prompt mode behavior are covered

---

## Order dependencies summary

```text
types
→ input
→ task parsing
→ repo context
→ candidate targeting
→ risk/ambiguity/verification analysis
→ confidence/readiness
→ artifact assembly
→ report generation
→ persistence
→ orchestrator
→ CLI wiring
→ tests
```

This order should be treated as the default build path unless a specific implementation fact proves otherwise.

---

## Guardrails

- Do not overbuild later stages while earlier contracts are unstable.
- Do not let report formatting drive artifact shape.
- Do not let persistence shape service outputs.
- Do not bury orchestration logic in random helpers.
- Prefer one stable pass over repeated churn.
