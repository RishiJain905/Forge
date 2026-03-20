# Part 3 — Edge Cases, Warnings, Failures, Debug Outputs, and Narrow V1 LLM Assist

## Purpose

This part hardens Step 1 where real tools usually fail:
- edge cases
- warning/failure handling
- debug output quality
- optional `--llm-assist` behavior

This is the operational stability batch inside Batch 4.

## Why this matters

A pipeline can look good on the happy path and still feel unreliable if:
- warnings are vague
- failures do not explain themselves
- debug info is missing
- optional assistive features are undefined
- edge cases create confusing behavior

This part ensures Step 1 becomes trustworthy rather than merely functional.

# Edge-case hardening

## Goal

Close the most important remaining operational gaps in Step 1.

## What Codex must build

Codex must harden Step 1 behavior for cases such as:
- missing or malformed inputs
- weak spec/prompt structure
- low-confidence repo mapping
- focus path conflicts
- no tests found
- no git available
- candidate targeting ambiguity
- partial-failure scenarios where useful outputs can still be emitted

## Required implementation tasks

1. audit current warning/failure paths across the pipeline
2. ensure partial-success scenarios resolve predictably
3. ensure failure still emits useful information whenever possible
4. ensure readiness and blocking issues are visible in output
5. ensure weak-but-usable cases resolve to warnings instead of crashes

# Warning and failure model hardening

## Goal

Make the status model feel consistent and explainable.

## What Codex must build

Codex must ensure the command can clearly distinguish:
- success
- success with warnings
- failure

Warnings and failures must be:
- typed or structured where appropriate
- visible in the artifact
- visible in the report
- available for debugging

## Required implementation tasks

1. unify scattered warning generation where helpful
2. ensure ambiguous cases do not silently become success
3. ensure failure cases do not hide what was already learned
4. make sure warning/failure messages are developer-readable

# Debug output hardening

## Goal

Provide optional debug artifacts that help inspect Intake behavior.

## What Codex must build

Codex must ensure optional debug outputs can be emitted for areas like:
- spec/prompt parse results
- repo scan data
- candidate targeting details
- warnings/ambiguity details

Suggested debug files:
- `.forge/debug/spec-parse.json`
- `.forge/debug/repo-scan.json`
- `.forge/debug/candidate-files.json`
- `.forge/debug/warnings.json`

These do not need to be mandatory on every run, but the implementation path should exist and be stable.

## Required implementation tasks

1. define when debug files are emitted
2. ensure debug outputs do not replace core artifacts
3. ensure debug output structure is inspectable and not overly noisy
4. ensure failed or warning runs can still emit useful debug data where appropriate

# Narrow V1 `--llm-assist` implementation

## Goal

Implement a narrow, bounded version of `--llm-assist` that improves Intake quality without becoming a giant dependency.

## What `--llm-assist` should do in V1

When enabled, `--llm-assist` may help with:
- summarizing messy spec text into cleaner normalized phrasing
- compressing prompt mode into a cleaner structured task shape
- highlighting likely ambiguity more clearly
- suggesting conservative engineering necessities in wording, not by inventing scope

It should **not**:
- replace deterministic parsing
- replace repo scanning
- become the only source of confidence
- invent product behavior
- block Step 1 when unavailable

## Required implementation tasks

1. define a narrow assist hook in the Step 1 flow
2. ensure deterministic parsing runs regardless
3. layer LLM-assisted improvements on top of deterministic outputs
4. tag assisted conclusions clearly where needed
5. ensure non-LLM mode remains first-class and stable
6. ensure Step 1 still works when `--llm-assist` is off or unavailable

## Required code surfaces

Likely files:
- input/task parsing coordination
- a small assist helper/module if needed
- confidence/reporting surfaces if assistance needs to be reflected

## Inputs
- spec text or prompt text
- deterministic extraction outputs

## Outputs
- improved task wording and/or ambiguity surfacing
- same final Step 1 artifact contract

## Edge cases
- assist unavailable
- assist returns weak results
- assist conflicts with deterministic extraction
- messy input where assist helps only partially

## Acceptance criteria

- warnings/failures are clearer and more stable
- debug outputs are useful when needed
- `--llm-assist` exists and is bounded
- deterministic Step 1 still works independently
- assist does not become a hidden dependency for normal operation

## Guardrails

- do not let `--llm-assist` sprawl into a mini-agent
- do not make LLM assistance required for correctness
- do not use it to compensate for weak deterministic foundations

