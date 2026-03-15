# Prompt Mode Implementation Rules

## Purpose
Define the stricter build behavior required when the user gives only a plain-language prompt.

## Why this matters
Prompt mode is useful, but easier to get wrong than spec mode.

## What Codex must build
- Prompt normalization into a synthetic task spec shape.
- Aggressive ambiguity/open-question generation when detail is missing.

## Required implementation tasks
- Parse prompt into title/goal/summary placeholders and structured requirement candidates.
- Generate open questions for missing acceptance criteria, unclear scope, and missing constraints.
- Lower confidence appropriately when prompt detail is thin.

## Required code surfaces
- Prompt normalizer.
- Open-question generator.
- Prompt ambiguity rules.

## Inputs
- Plain prompt string.
- Repo context clues.

## Outputs
- Synthetic normalized task fields.
- Prompt-mode ambiguities and confidence.

## Edge cases
- One-sentence vague prompt.
- Prompt asks for a broad product with no repo references.
- Prompt conflicts with current repo shape.

## Acceptance criteria
- Prompt mode produces a usable normalized task object when possible.
- It does not silently invent product requirements.

## Guardrails
- Engineering necessities are okay to infer; new product scope is not.
