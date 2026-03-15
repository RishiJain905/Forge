# Git Context Rules

## Purpose
Define how git metadata is used as enrichment without becoming a hard dependency.

## Why this matters
Git can improve repo grounding, but Step 1 must still work without it.

## What Codex must build
- Optional git context detection and normalization.
- Graceful fallback when git is absent or broken.

## Required implementation tasks
- Implement repo root detection with git when available.
- Capture current branch and optionally recent file hints when cheap/reliable.
- Fall back to filesystem logic when git is unavailable.

## Required code surfaces
- Git context provider.
- Git fallback handler.
- Git context section mapper.

## Inputs
- Repo path.
- Local git availability.

## Outputs
- Git metadata in `repo_context.git_context` and/or `source_inputs`.

## Edge cases
- Repo is a plain folder, not a git repo.
- Git exists but command fails.
- Detached HEAD or unusual branch state.

## Acceptance criteria
- Intake succeeds without git when repo files are otherwise accessible.
- Git signals enrich context when available.

## Guardrails
- Do not hard-fail just because git is missing.
- Keep git usage cheap and supportive.
