# Confidence Model and Scoring

## Purpose
Turn confidence from a concept into deterministic or rules-based implementation.

## Why this matters
Confidence affects warnings, readiness, and user trust.

## What Codex must build
- A scored or rules-based confidence resolver.
- Separate component confidence levels and overall confidence.

## Required implementation tasks
- Define observable signals that increase or decrease confidence.
- Implement section-level confidence resolution.
- Roll section-level signals into overall confidence.

## Required code surfaces
- Confidence resolver service.
- Confidence enums/types.
- Signal inputs from parser/scanner/targeting.

## Inputs
- Task parse quality signals.
- Repo mapping signals.
- Candidate target signals.
- Ambiguity counts/severity.

## Outputs
- `confidence` section in artifact.
- Possible warning escalation inputs.

## Edge cases
- Great spec but weak repo grounding.
- Great repo mapping but vague prompt.
- No tests detected in a test-heavy repo.

## Acceptance criteria
- Confidence is derived from explicit signals.
- Overall confidence is reproducible for the same inputs.

## Guardrails
- Do not make confidence purely LLM-generated.
- Do not hide low confidence behind a success label with no note.
