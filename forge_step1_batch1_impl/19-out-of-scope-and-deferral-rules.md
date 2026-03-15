# Out of Scope and Deferral Rules

## Purpose
Make sure V1 stays thin and resists overengineering.

## Why this matters
Clear deferrals protect momentum and reduce design drift.

## What Codex must build
- A documented list of non-required features that should not block Step 1 build progress.

## Required implementation tasks
- Keep advanced AST/multi-language semantic analysis out of Step 1.
- Keep issue-tracker ingestion out of Step 1.
- Keep provider-specific execution prompt generation out of Step 1.

## Required code surfaces
- Deferral notes in docs/comments.
- Optional TODO markers only where truly useful.

## Inputs
- Feature ideas or future extensions.

## Outputs
- A constrained Step 1 implementation scope.

## Edge cases
- Temptation to add monorepo graph engines or deep semantic matching.
- Temptation to add automatic code edits during Intake.

## Acceptance criteria
- The codebase stays aligned to the documented V1 scope.

## Guardrails
- Do not let TODOs become hidden scope commitments.
