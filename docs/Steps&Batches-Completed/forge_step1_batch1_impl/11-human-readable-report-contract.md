# Human-Readable Report Contract

## Purpose
Define the report that helps humans debug and trust Intake behavior.

## Why this matters
Users need a readable view of what Intake believed and why.

## What Codex must build
- A report renderer that mirrors the core artifact in developer-friendly prose.
- Stable required headings in the report.

## Required implementation tasks
- Implement markdown report generation with the required sections.
- Include assumptions, warnings, ambiguities, and readiness.
- Keep the report grounded in artifact data, not separate ad hoc logic.

## Required code surfaces
- Markdown report builder.
- Section render helpers.

## Inputs
- Final artifact object.

## Outputs
- `.forge/reports/intake-report.md`.

## Edge cases
- Artifact has low confidence and many warnings.
- No candidate targets but repo context is still useful.
- Prompt mode has many open questions.

## Acceptance criteria
- Report contains all required sections.
- The report matches the artifact state.
- A human can inspect the report and understand why Intake succeeded or warned.

## Guardrails
- Do not let the report overstate certainty.
- Do not include report-only logic that contradicts the JSON artifact.
