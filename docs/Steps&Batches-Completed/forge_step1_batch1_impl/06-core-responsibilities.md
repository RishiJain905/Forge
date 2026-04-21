# Core Responsibilities

## Purpose
Turn the four conceptual Step 1 jobs into implementation responsibilities.

## Why this matters
This is the heart of what Step 1 actually needs to do in code.

## What Codex must build
- A processing flow that handles task parsing, repo inspection, inferred requirements, and ambiguity/confidence generation.
- An internal result shape for each responsibility so they can be composed cleanly.

## Required implementation tasks
- Implement task request parsing outputs.
- Implement repo inspection outputs.
- Implement inferred requirement generation.
- Implement ambiguity and confidence generation.
- Combine them into the final artifact assembly flow.

## Required code surfaces
- Task parser result type.
- Repo scan result type.
- Inference result type.
- Ambiguity analysis result type.
- Artifact assembler.

## Inputs
- Validated inputs.
- Repo state.
- Optional LLM assist state.

## Outputs
- Structured sub-results ready for the final artifact.

## Edge cases
- Spec is rich but repo is sparse.
- Repo is rich but prompt is vague.
- Inference wants to add product behavior instead of engineering necessities.

## Acceptance criteria
- All four responsibility outputs exist in the final assembly path.
- No responsibility is silently skipped without warning.

## Guardrails
- Do not bury multiple responsibilities inside one giant function if avoidable.
- Do not let inferred requirements invent new product scope.
