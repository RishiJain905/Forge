# Part 1 — Step 2 Goal and Boundaries

## Purpose

This file defines the mission and boundaries of **Step 2: Plan**.

Step 2 must convert Step 1 Intake outputs into a real implementation plan without drifting into verification, execution, or splitting.

## Why this matters

Without a tight boundary, planning systems tend to become confused and bloated.

Common failure modes:
- the planner starts doing verification work
- the planner starts inventing execution packets too early
- the planner pretends ambiguity is resolved when it is not
- the planner becomes a generic LLM brainstorming step instead of a disciplined system stage

This file exists to prevent those failures.

## Core Step 2 mission

The mission of Step 2 is:

> **Transform Step 1 Intake output into a structured implementation plan that later steps can trust.**

This includes:
- decomposing the task into plan items
- mapping dependencies
- identifying conflict zones
- carrying forward unresolved ambiguity
- assigning test obligations
- tagging parallelization readiness
- producing a machine-readable plan artifact
- producing a human-readable planning report

## What Step 2 must do

Step 2 must:
- consume Step 1 outputs instead of redoing Intake
- preserve ambiguity and warnings where they still matter
- define plan items with enough structure for later steps
- define dependency relationships
- identify shared-risk areas
- start shaping work for later splitting and verification
- remain deterministic-first

## What Step 2 must not do

Step 2 must not:
- verify correctness directly
- split into workstreams yet
- generate execution prompts/packets
- modify code
- hide unresolved problems from Step 1
- act like a freeform brainstorming agent

## Deterministic-first rule

Planning should be primarily based on:
- Step 1 artifact sections
- repo context
- candidate targets
- deterministic decomposition rules
- explicit dependency logic
- conservative conflict detection

A later assistive reasoning layer may exist, but the planning skeleton must not depend on it.

## Required implementation tasks

1. define Step 2’s role clearly in code and docs
2. ensure Step 2 consumes Step 1 artifacts as input
3. define what counts as a plan item
4. define what must be preserved from Intake
5. prevent Step 2 from drifting into later-step logic

## Required code surfaces

Likely future surfaces:
- Step 2 command entry
- plan orchestrator/runner
- plan item models
- dependency/conflict analysis helpers
- report builder
- persistence

## Acceptance criteria

This part is complete when:
- Step 2’s mission is explicit
- boundaries are explicit
- deterministic-first expectations are explicit
- later-step drift is clearly prohibited

