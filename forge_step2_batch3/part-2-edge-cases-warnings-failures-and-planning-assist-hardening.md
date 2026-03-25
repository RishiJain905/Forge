# Part 2 — Edge Cases, Warnings, Failures, and Planning-Assist Hardening

## Purpose

This part hardens Step 2 where planning tools often become unreliable:
- edge cases
- warning/failure handling
- carried-forward uncertainty behavior
- bounded planning-assist behavior

This is the operational stability layer of Batch 3.

## Why this matters

A planning stage can look good on the happy path and still fail in practice if:
- warnings are vague
- failures hide partial progress
- Step 1 ambiguity gets washed away
- the planning-assist path becomes too fuzzy
- weak inputs produce false confidence

This part ensures Step 2 becomes trustworthy rather than merely functional.

# Edge-case hardening

## Goal

Close the most important remaining operational gaps in Step 2.

## What Codex must build

Codex must harden Step 2 behavior for cases such as:
- missing or malformed Step 1 artifacts
- warning-heavy but still usable Step 1 output
- low-confidence candidate targets
- broad or ambiguous plan decomposition
- dependencies that are likely but not perfectly certain
- broad conflict zones
- carried-forward readiness issues
- partial-failure scenarios where useful planning output can still be emitted

## Required implementation tasks

1. audit current warning/failure paths across the planning pipeline
2. ensure partial-success scenarios resolve predictably
3. ensure failure still emits useful information whenever possible
4. ensure readiness and blocking issues are visible in planning output
5. ensure weak-but-usable cases resolve to warnings instead of crashes

# Warning and failure model hardening

## Goal

Make the Step 2 status model feel consistent and explainable.

## What Codex must build

Codex must ensure the planning stage can clearly distinguish:
- success
- success with warnings
- failure

Warnings and failures must be:
- visible in the planning artifact
- visible in the planning report
- consistent with carried-forward Step 1 concerns
- available for debugging

## Required implementation tasks

1. unify scattered warning generation where helpful
2. ensure planning ambiguities do not silently become success
3. ensure failure cases do not hide what the planner already learned
4. make sure messages are developer-readable and specific

# Narrow planning-assist hardening

## Goal

Keep the planning-assist path narrow, bounded, and trustworthy.

## What planning-assist should do in Batch 3

Planning-assist may help with:
- improving plan-item wording
- tightening dependency explanations
- clarifying likely conflict-zone reasoning
- improving human-readable report clarity
- surfacing ambiguity more clearly

It should not:
- replace deterministic plan-item construction
- replace dependency logic
- become the only source of planning quality
- invent plan items without grounding
- become a mini autonomous planner

## Required implementation tasks

1. audit the current planning-assist path if present
2. ensure deterministic planning still runs regardless
3. layer assistive improvements on top of deterministic outputs
4. clearly preserve the deterministic planning skeleton
5. ensure planning still works when assist is off or unavailable

## Required code surfaces

Likely files:
- Step 2 planning-assist helper/module
- plan-item/report builder coordination
- readiness/confidence/report surfaces if assistive wording is reflected

## Inputs
- deterministic plan output
- Step 1 structured inputs

## Outputs
- improved wording/clarity where useful
- unchanged core plan contract

## Edge cases
- assist unavailable
- assist output weak or unhelpful
- assist output conflicts with deterministic plan
- warning-heavy planning inputs where assist helps only partially

## Acceptance criteria

- warnings/failures are clearer and more stable
- the planning-assist path is bounded and real
- deterministic Step 2 still works independently
- assist does not become a hidden dependency

## Guardrails

- do not let planning-assist sprawl into a mini-agent
- do not make LLM assistance required for planning correctness
- do not use it to compensate for weak deterministic foundations

