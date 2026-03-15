# Batch 1 Exit Condition

## Purpose
Define what must be true before moving from Batch 1 to Batch 2.

## Why this matters
Without an exit condition, implementation can move on with unstable foundations.

## What Codex must build
- A clear completion gate for Batch 1 behavior/contract implementation.

## Required implementation tasks
- Verify command contract stability.
- Verify artifact contract stability.
- Verify warning/failure/confidence logic exists.
- Verify prompt/spec input handling exists.
- Verify report/artifact output exists.

## Required code surfaces
- Batch completion checklist.
- Optional internal notes or verification script.

## Inputs
- Implemented Step 1 behavior.

## Outputs
- Decision on whether Batch 2 may begin.

## Edge cases
- Some sections exist only in docs but not code.
- One output path works but another is stubbed.

## Acceptance criteria
- Batch 2 starts only after Batch 1 contract behavior is real, not aspirational.

## Guardrails
- Do not move on because the architecture sounds complete; move on because the behavior is implemented.
