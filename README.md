# Forge

**Forge** is a reliability-first CLI for agentic software development.

It is designed to improve the quality, structure, and safety of AI-assisted coding by wrapping coding agents in a disciplined engineering workflow instead of relying on raw prompt-to-code generation.

Forge does **not** try to replace coding agents like Codex.  
It exists to make them **more effective, more predictable, and more engineering-aware**.

---

# Core Mission

Modern AI coding is powerful, but it has a recurring weakness:

- people increasingly trust code they did not deeply review
- planning is often shallow or skipped
- context windows bloat over time
- parallel work overlaps and creates integration pain
- risky coordination logic is rarely checked early
- testing is too often treated as an afterthought

Forge exists to address that.

Its mission is to provide a **structured development harness** around AI coding agents so that software work moves through a defined, high-signal process:

1. understand the task properly  
2. ground it in the real repo  
3. normalize and refine the work  
4. identify risky logic early  
5. split work safely  
6. execute with bounded context  
7. validate and integrate with engineering discipline  

Forge is built for developers who want better outcomes from AI coding without overengineering the workflow or pretending that agents are magically correct.

---

# Vision

Forge aims to become a **thin but powerful engineering layer** on top of coding agents.

The long-term vision is an end-to-end open-source CLI that helps developers and teams:

- turn messy tasks or spec files into structured implementation work
- preserve clean context handoffs between phases and agents
- reduce wasted context and token usage
- add reliability checks before coding begins
- make multi-agent or multi-stream development safer
- enforce stronger validation and testing at the end of execution

Forge should feel like a practical developer tool, not an academic experiment and not an overbuilt autonomous platform.

The guiding vision is:

> **better engineering process for AI coding, not more hype around AI coding**

---

# Product Philosophy

Forge is built around a few core beliefs.

## 1. Better process beats bigger prompting

The goal is not to “out-prompt” the model.

The goal is to improve outcomes through:
- better intake
- better planning
- better context handoff
- better verification
- better execution boundaries
- better integration and testing

## 2. Fresh context is better than bloated context

Long-running agent sessions degrade over time.

Forge prefers:
- phase-based execution
- structured artifacts
- summarized handoffs
- fresh sessions per major step

This is inspired by systems that keep context windows efficient by passing compressed, structured state instead of giant transcripts.

## 3. Artifacts are better than hidden memory

Forge is local-first and artifact-first.

Instead of relying on invisible conversation state, each step writes durable outputs that can be:
- inspected by humans
- passed to new agents
- resumed later
- debugged when something goes wrong

## 4. Reliability matters more than speed theater

Forge is not trying to look impressive by being hyper-autonomous.

It should be:
- understandable
- inspectable
- resumable
- debuggable
- safe to use in real engineering workflows

## 5. Verification should happen before implementation when possible

Some failures should be caught before code is written.

Forge aims to introduce selective pre-implementation verification for:
- risky coordination logic
- retries
- ownership
- handoffs
- parallel overlap
- ordering constraints

This is where future TLA+ / TLC integration fits.

## 6. Testing is a first-class requirement

The end of the workflow should not be “the model wrote code.”

The end of the workflow should be:
- the work is integrated
- obligations are satisfied
- validation exists
- tests reflect the intended behavior

---

# What Forge Is

Forge is:

- an open-source CLI
- a structured execution workflow for AI coding
- a reliability-first orchestration layer
- a project that helps developers use coding agents better
- a learning vehicle for building stronger agent harnesses

Forge is **not**:

- a replacement model
- a magic autonomous coding company
- a promise of bug-free code
- a giant memory platform in V1
- a SaaS dashboard in V1

---

# Target User

Forge is built for:

- developers
- software engineers
- technically curious builders
- people using coding agents like Codex
- people who want more discipline in agentic development

The primary user is someone who already sees value in AI coding, but wants:
- more structure
- more confidence
- less wasted output
- cleaner execution

---

# The Problem Forge Solves

AI coding agents are often strong at local code generation but weaker at engineering workflow discipline.

Common failure modes include:

- vague task intake
- incomplete repo grounding
- hidden ambiguity
- premature implementation
- parallel streams editing the same areas
- weak handoffs between sessions or agents
- context window rot
- poor test coverage
- hard-to-debug failures after implementation

Forge tries to solve this by forcing work through a structured pipeline.

---

# V1 Scope

Forge V1 is intentionally narrow.

The goal of V1 is to prove that a structured 6-step workflow improves AI-assisted software work without becoming too heavy.

## V1 Workflow

Forge V1 is built around six commands:

1. `forge intake`
2. `forge plan`
3. `forge verify`
4. `forge split`
5. `forge execute`
6. `forge integrate`

These commands are intended to work in order, but each should also write durable artifacts so the workflow can be resumed or inspected between steps.

---

# V1 Workflow Overview

## 1. Intake
Purpose:
Convert a markdown spec or direct prompt into a normalized task grounded in the real repository, then produce the durable handoff for `forge plan`.

Outputs include:
- normalized task spec
- repo context
- candidate files/modules
- ambiguity list
- initial risk zones
- initial verification targets
- confidence signals
- next-step readiness and failure state

Example CLI usage:

```bash
forge intake --repo /path/to/repo --spec task.md
forge intake --repo /path/to/repo --prompt "Update src/app.ts" --json-only
forge intake --repo /path/to/repo --prompt "Update src/app.ts" --report-only
```

Step 1 defaults to writing both `.forge/intake.json` and `.forge/reports/intake-report.md`.
`--json-only` and `--report-only` are mutually exclusive.
`--llm-assist` enriches intake without making optional reasoning authoritative.
`--fail-on-low-confidence` can escalate weak-but-usable runs when requested.
Any intake verification output is pointer-only; Step 1 does not run verification work, create workstreams, or emit execution packets.
This step is the handoff surface for Step 2 planning.

## 2. Plan
Purpose:
Consume the persisted Step 1 intake artifact and turn it into a structured, deterministic-first implementation plan that later steps can trust.

Step 2 should treat `.forge/intake.json` as its primary input surface rather than re-running broad intake logic from raw task text or re-grounding the repo from scratch. It should carry forward task structure, repo context, candidate targets, risk analysis, ambiguities, warnings, initial verification targets, confidence, and readiness context so later steps do not have to guess what Intake already learned.

Outputs include:
- a machine-readable planning artifact
- a human-readable planning report
- structured plan items
- dependency map
- conflict zones
- parallelization candidates
- test obligations
- carried-forward ambiguity and warning context

Step 2 does not verify correctness directly, split work into execution streams, generate execution packets, or modify code.

## 3. Verify
Purpose:
Check risky coordination and workflow logic before coding begins.

V1 verification is selective and bounded. It is intended for things like:
- retries
- ownership
- migration ordering
- stream interference
- handoff safety

This step may later support formal or semi-formal checks such as TLA+ / TLC-backed modeling.

## 4. Split
Purpose:
Convert the approved plan into bounded execution streams.

Outputs include:
- workstreams
- ownership boundaries
- allowed/blocked paths
- execution packets
- merge ordering guidance

## 5. Execute
Purpose:
Prepare or drive implementation work in a structured way.

V1 should begin with:
- export mode
- clean execution packets
- optional worktree setup
- bounded context per stream

This step should avoid trying to become a giant autonomous agent platform too early.

## 6. Integrate
Purpose:
Bring the streams back together with discipline.

This includes:
- merge order awareness
- overlap/risk detection
- test obligation checks
- acceptance criteria review
- integration reporting
- TDD-oriented validation requirements

---

# Why This Project Exists

Forge is not only about building a tool for others.

It also exists to:
- learn agent harness design
- improve the builder’s own AI coding workflow
- understand where LLMs help and where engineering process still matters
- explore reliability-first agentic development
- build something resume-worthy and technically meaningful

It is both:
- a practical tool
- a systems-thinking project

---

# Key Design Principles

## Local-first
Forge should work on a local repo using local files.

## Inspectable
Every important step should write artifacts humans can read.

## Resumable
A later session or agent should be able to continue from saved outputs.

## Bounded
Each command should have a clear contract and boundary.

## Modular
The pipeline should allow future upgrades without rewriting the whole system.

## Lightweight
V1 should stay thin and useful, not become bloated.

## Engineering-first
Forge should reward good software process, not agent theatrics.

---

# Context Strategy

One of Forge’s most important ideas is how it handles context.

## Problem
Long context windows become noisy, expensive, and brittle.

## Forge approach
Each phase should hand off:
- structured summaries
- decisions
- constraints
- candidate targets
- risks
- ownership boundaries
- test obligations

Instead of:
- giant transcripts
- vague memory blobs
- hard-to-trust conversational state

This allows:
- fresh context windows
- better reproducibility
- lower context waste
- easier debugging
- safer multi-agent workflows

---

# Memory Strategy

V1 does **not** require a complex memory platform.

Instead, V1 uses:
- local artifacts
- decision logs
- phase outputs
- stream packets
- integration reports

This gives Forge a practical form of memory without adding premature infrastructure complexity.

Potential V2/V3 directions may include:
- richer project memory
- cross-run memory
- external context backends
- systems inspired by tools like Mem0 or OpenViking

But these are intentionally **not** V1 requirements.

---

# Verification Strategy

Verification is one of Forge’s differentiators.

However, Forge should use verification carefully.

## V1 verification should focus on:
- risky coordination logic
- retry behavior
- ownership and leases
- stale write risk
- migration or sequencing risk
- unsafe parallel execution boundaries

## V1 verification should not try to:
- formally verify all app logic
- become an academic proof engine
- over-model ordinary CRUD work

The goal is practical leverage, not theoretical maximalism.

Long-term, Forge may support:
- state-machine modeling
- TLA+ generation
- TLC-based checking
- failure trace interpretation
- repair suggestions for plan refinement

---

# TDD and Validation Strategy

Forge treats validation as essential, not optional.

The final phase of the workflow should enforce:
- test obligations per stream
- validation tied to acceptance criteria
- stronger confidence before merge/integration

Forge’s view is simple:

> AI output without strong validation is not enough.

V1 integration should reflect this.

---

# Current V1 Build Strategy

The project is being designed in layered planning batches before implementation.

That is intentional.

The goal is to reduce ambiguity before coding begins so build time becomes:
- more creation
- less rethinking
- less architectural drift
- less wasted agent usage

The current planning approach is:

- define command behavior
- define artifact contracts
- define implementation expectations
- define file/module responsibilities
- build in workflow order
- keep every phase inspectable

---

# Recommended V1 Build Order

Forge should be implemented in the same order as the workflow:

1. Intake
2. Plan
3. Verify
4. Split
5. Execute
6. Integrate

Reason:
- each step produces artifacts the next step depends on
- each step exposes flaws in the previous step
- this reduces guessing about future interfaces
- it keeps complexity under control

---

# Current Implementation Status

Step 1: Intake is implemented and complete.

It now serves as the durable handoff into Step 2 planning. The current intake contract includes:
- normalized task spec
- repo context
- candidate targets
- risk analysis
- ambiguities and warnings
- initial verification targets
- confidence
- next-step readiness

Step 2: Plan has started.

Batch 1 Part 1 now defines the Step 2 mission, boundaries, deterministic-first intake-consumption seam, and the minimum internal plan-item contract. CLI wiring plus persisted Step 2 plan/report outputs remain for the later Step 2 Batch 1 parts.

---

# Repository Intent

This repository should evolve into a clean open-source developer project.

## Expected repository goals
- easy to understand
- easy to inspect
- easy to iterate on
- useful for AI-assisted development workflows
- structured enough for future contributors

## High-level future repository areas

These are placeholders and will evolve as V1 is built:

```text
forge/
  src/
    cli/
    commands/
    core/
    intake/
    planning/
    verify/
    split/
    execute/
    integrate/
    shared/
  docs/
    v1/
    specs/
    batches/
  examples/
  tests/
  .forge/
