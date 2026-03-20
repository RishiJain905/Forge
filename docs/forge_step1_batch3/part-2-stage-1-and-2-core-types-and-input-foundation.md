# Part 2 — Stage 1 and 2: Core Types and Input Foundation

## Purpose

This part covers the first two implementation stages for Batch 3:

1. stabilizing core Step 1 types/contracts
2. stabilizing input resolution for spec mode first

These stages form the foundation for every later stage.

---

## Why this matters

If types are unstable or inputs are weakly normalized:
- downstream services will duplicate assumptions
- artifact sections will drift
- tests will become fragile
- spec mode will not have a reliable base

These stages should be completed before deeper behavior is built out.

---

# Stage 1 — Stabilize core types and contracts

## Goal

Ensure the codebase has one stable set of Step 1 contracts that map cleanly to Batch 1.

## What Codex must build

Codex must ensure the following shapes are real and coherent in code:

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

These may live in one or more existing type/schema files, but the ownership must be clear.

## Required implementation tasks

1. Audit existing Step 1 type definitions in the repo.
2. Remove duplicate or incompatible shape definitions.
3. Align field names with the Batch 1 contract wherever possible.
4. Keep the top-level `IntakeArtifact` shape stable enough for downstream stages.
5. Ensure the orchestrator and builders can rely on these shapes directly.

## Required code surfaces

Likely files:
- existing Intake schema/type files
- any artifact schema files
- any shared Step 1 type files

## Inputs
- Batch 1 artifact contract
- current repo Intake types

## Outputs
- stable, reusable Step 1 types
- fewer duplicated definitions
- one obvious type source of truth

## Edge cases
- partial existing type coverage
- type names already used inconsistently
- optional debug fields versus required fields

## Acceptance criteria
- no major Step 1 service needs to invent its own incompatible shape
- artifact/report builders can consume stable structures
- types are specific enough to support tests

## Guardrails
- do not overbuild a giant type system
- do not abstract types into future-step needs
- focus on Step 1 only

---

# Stage 2 — Stabilize input resolution

## Goal

Make spec-mode input resolution reliable and deterministic.

## What Codex must build

Codex must ensure the input layer can:
- resolve spec mode vs prompt mode
- validate top-level command inputs
- load spec contents
- load optional constraints/notes if provided
- normalize repo path and focus paths
- produce a resolved input object suitable for the rest of the pipeline

Spec mode is the top priority.

## Required implementation tasks

1. Audit the current `input.ts` behavior.
2. Ensure spec mode path handling is reliable.
3. Validate required input cases:
   - spec provided and valid
   - prompt provided and valid
   - neither provided
   - invalid file path
4. Normalize optional inputs:
   - constraints
   - notes
   - focus paths
   - strict focus
5. Produce one resolved input bundle for the orchestrator to use.
6. Preserve clear warnings/errors for input-level failure.

## Required code surfaces

Likely files:
- `src/intake/input.ts`
- any shared CLI/input validators
- command integration surfaces if input parsing needs slight alignment

## Inputs
- CLI args
- repo path
- optional files

## Outputs
- `ResolvedIntakeInput`
- input-level warning/error data
- loaded raw source contents

## Edge cases
- missing spec file
- empty spec file
- invalid repo path
- focus path outside repo
- both prompt and spec present
- config present but incomplete

## Acceptance criteria
- spec mode works reliably
- bad inputs fail clearly
- valid inputs produce one clean resolved object
- downstream services can rely on input normalization rather than redoing it

## Guardrails
- do not push task parsing into input resolution
- do not hide validation errors
- do not optimize prompt mode at the expense of spec mode in this batch
