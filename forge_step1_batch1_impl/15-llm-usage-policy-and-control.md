# LLM Usage Policy and Control

## Purpose
Define how optional LLM assistance is allowed without making Intake opaque or expensive.

## Why this matters
You want better reasoning where useful, but not uncontrolled token burn.

## What Codex must build
- A hybrid policy where deterministic logic is primary and LLM help is optional.
- A runtime control path for `--llm-assist` and `--no-llm`.

## Required implementation tasks
- Implement deterministic-first processing.
- Define explicit points where LLM assistance may be invoked later.
- Tag or annotate outputs that came from optional reasoning assistance if needed.

## Required code surfaces
- LLM mode flag resolver.
- Optional reasoning hook interface.
- Grounding/attribution notes in confidence or warnings if useful.

## Inputs
- Resolved LLM mode.
- Messy spec/prompt text.
- Deterministic signals.

## Outputs
- Grounded normalized outputs with optional reasoning enrichment.

## Edge cases
- No LLM backend available but `--llm-assist` passed.
- LLM output conflicts with deterministic repo facts.

## Acceptance criteria
- Intake still works fully in deterministic mode.
- LLM-assisted behavior never becomes the only source of truth.

## Guardrails
- Do not require LLM access for basic Step 1 success.
- Deterministic facts must override speculative LLM claims.
