# Part 4 — Test Obligations, Parallelization Signals, and Carry-Forward Rules

## Purpose

This file defines three critical Step 2 behaviors:
- how test obligations should be assigned
- how parallelization signals should be represented
- how ambiguities/warnings from Step 1 must be carried forward

These are key because they directly influence later reliability.

## Why this matters

If Step 2 ignores these:
- later TDD/validation becomes detached from planning
- splitting is forced to guess what is safe
- Intake’s warnings disappear and false confidence grows

Step 2 must be honest and forward-looking.

# Test obligations

## Goal

Every plan item should carry some expectation about validation.

At this stage, Step 2 should at least assign categories such as:
- unit
- integration
- regression
- smoke
- migration validation
- contract validation

These do not need full test implementations yet, but they must exist in planning.

## What Codex must build

Codex must ensure Step 2 can assign test obligations based on:
- plan item type
- affected area
- risk level
- shared/public interface implications

# Parallelization signals

## Goal

Step 2 should prepare for later splitting by tagging plan items with more than vague hints.

At minimum, plan items should eventually be tagged along lines like:
- serial only
- safe parallel
- parallel after dependency
- risky/shared
- requires protected merge order

These are not full workstreams yet, but they are stronger than casual hints.

## What Codex must build

Codex must ensure Step 2 can represent planning-time parallelization signals that later steps can refine rather than invent from scratch.

# Carry-forward rules from Step 1

## Goal

Step 2 must not pretend Step 1 was cleaner than it really was.

That means Step 2 must carry forward:
- unresolved ambiguities
- warnings
- low-confidence areas
- candidate-target uncertainty
- readiness or blocking context when still relevant

These should influence the plan instead of being silently discarded.

## What Codex must build

Codex must ensure:
- unresolved Intake ambiguity is visible in the planning artifact/report
- weak mapping confidence is not hidden
- warnings can affect plan-item confidence, dependency caution, or later-step readiness

## Required implementation tasks

1. define test obligation categories for plan items
2. define planning-time parallelization signals
3. define how Step 1 ambiguity/warnings are preserved in Step 2
4. ensure carried-forward concerns remain visible in both artifact and report
5. ensure Step 2 does not silently “resolve” ambiguity without justification

## Inputs

From Step 1:
- ambiguities
- warnings
- confidence
- candidate targets
- risk analysis
- verification targets

From Step 2 internals:
- plan items
- dependency relationships
- conflict zones

## Outputs

- test obligations attached to plan items
- parallelization signals attached to plan items
- carried-forward ambiguity/warning context

## Edge cases

- a low-confidence plan item still needs to exist
- a risky/shared area may still be parallelizable later only after dependencies
- a plan item may need multiple test obligation categories
- warnings may affect only certain plan items, not the whole plan

## Acceptance criteria

This part is complete when:
- test obligations are explicit
- parallelization signals are stronger than vague notes
- carried-forward ambiguity/warning rules are explicit
- planning output remains honest about uncertainty

