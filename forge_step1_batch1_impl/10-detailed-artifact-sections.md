# Detailed Artifact Sections

## Purpose
Define what each top-level section contains and what code must populate it.

## Why this matters
Most Step 2 quality depends on these inner sections being useful and consistent.

## What Codex must build
- Typed shapes for `source_inputs`, `task_spec`, `repo_context`, `candidate_targets`, `risk_analysis`, `ambiguities`, `warnings`, `initial_verification_targets`, `confidence`, and `next_step_readiness`.
- Population logic for each section.

## Required implementation tasks
- Create interfaces/types for each artifact section.
- Map parser/scanner/inference outputs into those sections.
- Normalize lists and field names consistently.
- Ensure every section exists even if empty/defaulted.

## Required code surfaces
- Section-specific types/interfaces.
- Mappers/assemblers for each section.

## Inputs
- Sub-results from validators, parser, scanner, and resolvers.

## Outputs
- Fully populated inner artifact sections.

## Edge cases
- No candidate files found.
- No tests detected.
- Spec mentions modules that do not exist.
- Repo scan finds context but not a strong target match.

## Acceptance criteria
- Each documented section is present.
- Fields are normalized and typed.
- Empty states are represented safely rather than omitted unpredictably.

## Guardrails
- Do not make consumers guess whether a section exists.
- Prefer empty arrays/objects over missing sections unless there is a strong reason otherwise.
