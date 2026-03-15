# Command Goal and Success

## Purpose
Translate the high-level Step 1 goal into concrete success behavior.

## Why this matters
Codex needs a build target that is operational, not just conceptual.

## What Codex must build
- A success model for Intake that defines what a usable result looks like.
- A readiness signal for Step 2 (`forge plan`).
- A clear distinction between success, warning, and failed output.

## Required implementation tasks
- Implement a success evaluator that checks task normalization, repo grounding, and candidate target plausibility.
- Add readiness calculation logic to the final artifact.
- Define blocking issues vs non-blocking warnings.

## Required code surfaces
- Success evaluator function/service.
- Readiness object type.
- Blocking issue structure.
- Summary status resolver.

## Inputs
- Normalized task fields.
- Repo context findings.
- Candidate target findings.
- Warnings and ambiguities.

## Outputs
- `next_step_readiness` section.
- Resolved command status.
- Optional recommended user actions.

## Edge cases
- Task parse is decent but no tests are found.
- Repo mapping is partial but likely usable.
- Spec is understandable but acceptance criteria are missing.

## Acceptance criteria
- Readiness is explicit, not implied.
- Blocking issues are separately listed from warnings.
- Status selection is deterministic and reproducible.

## Guardrails
- Do not base readiness only on vibes or LLM prose.
- Do not mark `ready=true` when core outputs are missing.
