# Focus Directory and Targeting Rules

## Purpose
Define how focus directories constrain targeting without blinding repo analysis.

## Why this matters
Users want edit safety, but Intake still needs whole-repo awareness.

## What Codex must build
- A full-repo context scan policy.
- A focus-aware candidate targeting policy.
- Strict-focus behavior.

## Required implementation tasks
- Implement full-repo scanning for context signals.
- Implement focus path prioritization for candidate targets.
- Implement `--strict-focus` so candidate targeting becomes more constrained but context scan remains possible.
- Emit warnings when strict focus likely excludes relevant targets.

## Required code surfaces
- Focus policy resolver.
- Candidate target filter/prioritizer.
- Strict-focus warning generator.

## Inputs
- Focus paths.
- Repo scan results.
- Raw candidate targets.

## Outputs
- Focus-adjusted candidate target lists.
- Warnings when relevant files likely fall outside focus.

## Edge cases
- Focus path contains no likely targets.
- Best candidate file is outside strict focus.
- Monorepo with many packages but focus only on one app.

## Acceptance criteria
- The whole repo is still scanned for context by default.
- Focus affects targeting priority, not repo blindness.

## Guardrails
- Do not implement focus as a naive global ignore unless strict behavior explicitly says so.
