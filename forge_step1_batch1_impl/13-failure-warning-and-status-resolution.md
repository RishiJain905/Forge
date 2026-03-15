# Failure, Warning, and Status Resolution

## Purpose
Define how the final command status is chosen.

## Why this matters
Status drives trust, automation, and whether the user should continue.

## What Codex must build
- A status resolver for `success`, `warning`, and `failed`.
- Clear policy for when warnings remain non-blocking vs when they escalate.

## Required implementation tasks
- Implement final status resolution after validation, parsing, scanning, and confidence steps.
- Support `--fail-on-low-confidence` as an optional escalation path.
- Ensure failed runs still try to emit useful output.

## Required code surfaces
- Status resolver.
- Warning/blocking issue evaluator.
- Failure artifact fallback writer.

## Inputs
- Validation errors.
- Confidence level.
- Blocking issues.
- Artifact completeness.

## Outputs
- Resolved `status` field.
- Possibly partial artifact/report.

## Edge cases
- Low confidence but structurally usable output.
- Blocking input validation failure.
- Artifact assembly partially succeeded.

## Acceptance criteria
- Status resolution follows documented policy.
- Failed runs still explain what happened when possible.

## Guardrails
- Do not use exceptions as the only status mechanism.
- Prefer resolved outcomes plus useful persistence.
