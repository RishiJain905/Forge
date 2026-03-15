# CLI Surface and Flag Behavior

## Purpose
Lock the user-facing command shape and exact flag behavior.

## Why this matters
If the CLI is inconsistent, the tool becomes hard to script and hard to trust.

## What Codex must build
- A stable CLI definition for all Intake flags.
- Flag conflict handling and defaults.
- Output mode behavior (`--json-only`, `--report-only`, etc.).

## Required implementation tasks
- Register all Step 1 flags in the CLI layer.
- Implement default output behavior.
- Implement mutually relevant flag policy for `--llm-assist` vs `--no-llm`.
- Implement optional escalation behavior for `--fail-on-low-confidence`.

## Required code surfaces
- CLI parser configuration.
- Flag normalization layer.
- Output mode resolver.
- LLM mode resolver.

## Inputs
- Raw CLI arguments.

## Outputs
- Resolved command options passed to the Step 1 runner.

## Edge cases
- `--json-only` and `--report-only` passed together.
- `--llm-assist` and `--no-llm` passed together.
- Custom output dir plus repo-relative focus paths.

## Acceptance criteria
- Primary examples in docs run as described.
- Flags resolve deterministically.
- Conflicting flags are rejected or resolved by explicit policy.

## Guardrails
- Do not let hidden defaults surprise the user.
- Keep CLI names developer-readable and script-friendly.
