# Part 4 — Test Strategy and Acceptance Gates

## Purpose

This document defines how Step 1 should be tested and what must be true before Batch 2 is considered complete in practice.

The goal is not only to have tests.
The goal is to ensure the Step 1 architecture is actually trustworthy.

---

## Why this matters

Without a test strategy, a coding agent may:
- implement the architecture partially
- satisfy a few happy paths
- leave warning/failure behavior weak
- allow refactors to drift silently
- create confidence without real coverage

This document prevents that.

---

## Test philosophy for Step 1

Step 1 should be tested at three levels:

1. unit/service-level tests
2. contract-level tests
3. end-to-end Intake flow tests

This balance keeps the architecture stable without requiring overbuilt test infrastructure.

---

## Test categories

### 1. Input resolution tests
These should verify:
- spec mode works
- prompt mode works
- missing required inputs fail correctly
- bad file paths fail clearly
- focus paths normalize correctly
- strict-focus flags are handled correctly

### 2. Task parsing tests
These should verify:
- markdown with headings parses correctly
- messy markdown still extracts useful structure
- prompt mode normalizes into the internal task shape
- risky phrases are detected
- mentioned paths/tests/modules are captured when present
- inferred requirements stay engineering-scoped
- open questions appear when the task is vague

### 3. Repo context tests
These should verify:
- language/framework signals are detected
- package manager detection works
- test framework detection works when present
- repo layout summary is produced
- git absence does not crash the flow
- no-tests repos become warnings rather than hard failures

### 4. Candidate targeting tests
These should verify:
- relevant file candidates are produced from task + repo context
- focus paths influence prioritization
- strict-focus constrains target output more aggressively
- shared-risk files can be surfaced
- candidate reasons/confidence notes are inspectable

### 5. Risk / ambiguity / verification target tests
These should verify:
- ambiguity types are classified correctly
- severity assignment works
- warnings are distinguished from failures
- initial verification targets are grounded in real signals
- risky coordination phrases lead to expected analysis outputs

### 6. Confidence / readiness tests
These should verify:
- high/medium/low confidence behaves predictably
- final status resolution matches Batch 1 rules
- readiness can block planning when needed
- recommended user actions appear for weak inputs

### 7. Artifact assembly tests
These should verify:
- the top-level intake artifact matches the Batch 1 contract
- required sections are present
- input mode and status fields are correct
- readiness and confidence are embedded properly

### 8. Report generation tests
These should verify:
- report contains the required sections
- ambiguity, warnings, confidence, and readiness are surfaced
- report stays readable and aligned with the artifact

### 9. Persistence tests
These should verify:
- `.forge/` directories are created when needed
- intake artifact is written
- report is written
- failed or warning runs still persist useful outputs when expected

### 10. End-to-end tests
These should verify:
- spec mode full run
- prompt mode full run
- warning-first scenario
- failure scenario with useful output
- focus path scenario
- strict-focus scenario
- no-git scenario if practical

---

## Recommended test file grouping

The exact file names can follow current repo conventions, but the test responsibilities should map to something like:
- input tests
- task parser tests
- repo context tests
- candidate target tests
- analysis tests
- confidence/readiness tests
- artifact/report tests
- persistence tests
- end-to-end intake command tests

If current tests already exist, prefer aligning them with these groups instead of inventing a new taxonomy for no reason.

---

## What must be tested before safe cleanup

Before merging or simplifying existing files, ensure tests cover:
- the behavior owned by those files
- status/warning outcomes
- artifact shape and report output

Rule:
> do not simplify structure if the behavior is not test-protected enough to notice regressions

---

## Acceptance gates by stage

### Gate 1 — Shared contracts stable
Must be true:
- core types exist and are consistent
- no duplicate incompatible definitions remain

### Gate 2 — Input + parsing stable
Must be true:
- both spec and prompt modes work
- invalid inputs fail properly
- normalized task output is usable

### Gate 3 — Repo mapping stable
Must be true:
- repo context output is usable
- candidate targeting is plausible
- focus and strict-focus behavior work

### Gate 4 — Analysis stable
Must be true:
- ambiguities and warnings are explicit
- verification targets are grounded
- confidence/readiness outputs are meaningful

### Gate 5 — Output stable
Must be true:
- artifact contract is honored
- report contract is honored
- persistence is reliable

### Gate 6 — Orchestration stable
Must be true:
- `forge intake` runs end-to-end
- warning/failure behavior matches Batch 1
- outputs are reproducible enough for debugging

---

## Minimum end-to-end scenarios

At minimum, Step 1 should be tested against these scenarios:

### Scenario A — strong spec, healthy repo
Expected:
- success
- high or medium confidence
- plausible candidates
- planning ready

### Scenario B — weak prompt, healthy repo
Expected:
- warning
- lower confidence
- open questions present
- still possibly planning-ready depending on severity

### Scenario C — invalid input
Expected:
- failure
- useful error context
- persisted diagnostic/report output if applicable

### Scenario D — focus path excludes likely candidate
Expected:
- warning or confidence note
- candidate targeting reflects focus behavior
- strict-focus behavior is explainable

### Scenario E — repo with no tests or no git
Expected:
- no crash
- warnings as appropriate
- usable repo context when possible

---

## Batch 2 completion criteria

Batch 2 is practically complete only when:
- the architecture is implemented or implementable without ambiguity
- each major file has clear ownership
- safe cleanup rules are respected
- the sequential build order is followed
- tests exist or are explicitly planned for each major Step 1 responsibility
- the Intake pipeline is strong enough that later Step 1 coding does not require reopening architecture questions

---

## Guardrails

- Do not use tests to justify bad architecture.
- Do not skip failure/warning scenarios.
- Do not rely only on happy-path end-to-end tests.
- Prefer stable, explicit coverage over large noisy test suites.
