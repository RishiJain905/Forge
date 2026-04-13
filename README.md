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

This is where Step 3's selective V1 TLA+/TLC lane fits.

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

V1 verification is selective and bounded. It uses a deterministic structural lane plus a formal TLA+/TLC-backed lane for risky coordination and workflow logic such as:
- retries
- ownership
- migration ordering
- stream interference
- handoff safety
- stale-write and duplicate-execution risk
- unsafe serialization or ordering assumptions

## 4. Split
Purpose:
Convert verified planning output into safe execution-ready workstreams without drifting into actual implementation.

Outputs include:
- workstreams
- stream categories
- ownership boundaries
- merge ordering guidance
- blocked-work visibility
- machine-readable and human-readable split outputs

Batch 1 keeps Split deterministic-first and conservative about regrouping. Execution-packet generation remains deferred to later Step 4 and Step 5 work.

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

Step 3 V1 includes formal entry points for:
- state-machine modeling
- TLA+ generation
- TLC-based checking

Later versions may support:
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

Step 2: Plan is implemented through Batch 3 Part 5.

Batch 3 Part 5 freezes the Step 3 handoff contract by proving the existing `plan.json`, `plan-report.md`, and `planning_readiness` surfaces are the durable inputs into `forge verify` without adding any Step 3 runtime behavior or a new top-level plan artifact section.

Step 2 remains frozen for V1 except for future bug fixes.

`forge plan` now consumes the persisted Step 1 handoff through a Step 2-native normalized planning-input boundary instead of treating the raw intake artifact as the planner's working model. It preserves Step 1 provenance such as input mode, source inputs, runtime options, failure/status context, and planning uncertainty while keeping non-actionable but schema-valid handoffs blocked honestly. The packaged CLI path is proven end to end through ready, warning-heavy, blocked, and missing-input coverage, and the planner builds explicit plan-item foundations with structured source traces before deriving the public plan items, so requirement-source provenance, candidate-target linkage, and conservative low-confidence/fallback planning can carry forward without reopening the public `plan.json` top-level contract.

Step 2 also now emits stronger dependency, conflict-zone, test-obligation, and parallelization modeling, keeps carried-forward concern mapping visible on ready and blocked runs, and can optionally write internal planning debug artifacts behind `FORGE_PLAN_DEBUG=1` without changing the public `plan.json` top-level contract. Batch 3 Part 1 adds a bounded internal planning-assist seam that can tighten wording without changing deterministic structure and removes stale “later Step 2” report/boundary language. Batch 3 Part 2 hardens warning, blocking, partial-failure, and planning-assist diagnostics across the artifact, report, and debug outputs. Batch 3 Part 3 turns `planning_readiness` into a Step 2-owned later-step handoff object, adds `planning-readiness.json` to the optional debug outputs, and hardens ready, warning-heavy, blocked, and persisted-failure reporting so later steps do not have to reinterpret planning quality from scratch.

Batch 3 Part 5 makes that handoff explicit for `forge verify` by naming the verification gate directly in readiness/report wording, adding a dedicated Step 3 handoff-contract suite, and freezing Step 2 as the planning foundation that Step 3 should consume instead of re-planning from prose.

Step 3: Verify now has Batch 1 Part 1 through Part 5, Batch 2 Part 1 through Part 5, and Batch 3 Part 1 through Part 4 implemented.

Part 1 adds `src/verify` foundation modules that consume the persisted Step 2 `plan.json` handoff, normalize verify-input usability, preserve Step 2 uncertainty/readiness context, and freeze the structural lane, formal lane, and TLA+/TLC entry contract for V1.

Part 2 adds the first public `forge verify` CLI path, persists `.forge/verify.json` plus `.forge/reports/verify-report.md`, and freezes the top-level verification artifact/report contract.

Part 3 adds explicit verification target and case construction so Step 3 can deterministically derive structural-only and dual-lane verification work from persisted Step 2 plan signals instead of leaving target selection implicit.

Part 4 makes the formal lane real in V1 by turning formal-case selection into explicit entry criteria, deterministic state-model generation, generated `.tla` / `.cfg` artifacts under the verify output root, TLC execution via `FORGE_TLC_JAR_PATH` when configured, and populated formal findings, traces, errors, and caution notes in the verification artifact/report.

Part 5 makes the structural lane executable in V1, resolves `verification_readiness` from actual structural plus formal outcomes instead of Step 2 input state alone, blocks later steps on structural or formal failures, keeps TLC `not_run` warning-grade, and locks the shipped behavior with a dedicated Batch 1 Part 5 acceptance-gates suite.

Batch 2 Part 1 is a narrow alignment pass over that already real Step 3 runtime. It hardens the explicit Batch 2 mission, ordered implementation priorities, and do-not-touch guardrails in the Step 3 boundary contract so later Batch 2 work stays inside real verify behavior and does not drift into Step 4+ flow, interactive shell behavior, memory backends, execution-packet generation, code editing, unrelated repo cleanup, fuzzy verification reasoning, or fake TLA+/TLC participation.

Batch 2 Part 2 preserves unmatched verification-target traceability and makes the structural lane enforce deterministic category-aware verification rules instead of placeholder support checks.

Batch 2 Part 3 narrows the real formal subset to supported risky workflow categories, adds richer `unsafe_conditions` state-model output, and makes generated TLA+ modules category-specific.

Batch 2 Part 4 keeps the frozen public `forge verify` CLI and top-level `verify.json` / `verify-report.md` contract stable while upgrading nested output quality: top-level findings and constraints are now machine-readable structured records, the report groups findings/constraints by lane, and optional internal verify debug artifacts can be emitted behind `FORGE_VERIFY_DEBUG=1`. Those debug files remain secondary to `verify.json` and `verify-report.md`.

Batch 2 Part 5 closes the runnable milestone and default verification gate without reopening the verify surface. `forge verify` already ran the real Step 3 flow, so Part 5 hardens the shipped milestone by wiring the previously omitted Step 3 Batch 2 suites into `npm.cmd test`, adding a dedicated runnable-milestone regression that proves the packaged CLI can consume persisted Step 2 output, execute structural verification, generate state models and TLA+ specs, run TLC through the external seam for the initial high-value subset, and persist honest on-disk outputs. Batch 2 is now complete for Step 3, with later work reserved for hardening and freeze follow-up rather than first-time milestone wiring.

Batch 3 Part 1 is the finish-and-freeze pass over that already real verify runtime. It makes the Step 3 freeze goal explicit in code, adds explicit finish-line and do-not-touch boundary metadata to the Step 3 boundary contract, adds dedicated Batch 3 Part 1 freeze coverage for grounded, warning-heavy, repeated-run, and debug-output verify runs, and keeps the public `forge verify` CLI plus top-level `verify.json` / `verify-report.md` contracts stable.

Batch 3 Part 2 expands the formal lane from one-case-per-category coverage into deterministic scenario-specific Tier 1 plus Tier 2 formal cases, adds stable nested `scenario_kind` metadata throughout the formal artifact surfaces, hardens TLC status handling with explicit `inconclusive` support, and keeps weak-input caution visible without changing the top-level `verify.json` or `verify-report.md` contract.

Batch 3 Part 3 hardens the shipped verify outputs without reopening the public surface. `verify.json` now keeps carried-forward Step 2 planning diagnostics/readiness under `source_plan`, `verify-report.md` now answers the `forge split` gate directly with recommended actions and constraining concerns while keeping Step 2 versus Step 3 state labeled honestly, and `FORGE_VERIFY_DEBUG=1` now emits `verification-readiness.json` alongside the existing internal debug outputs so Step 4 does not need to reinterpret verification quality from scratch.

Batch 3 Part 4 is the final polish-and-freeze pass for the shipped Step 3 runtime. It keeps the public `forge verify` CLI and the frozen top-level `verify.json` / `verify-report.md` contracts stable while tightening report/status clarity for ready, warning-heavy, blocked, fallback-output, and debug-enabled runs, extending freeze-era coverage for Tier 2 TLC outcomes, and marking the Step 3 runtime frozen for V1 except future bug fixes.

Batch 3 Part 5 closes Step 3 by proving the existing `verify.json`, `verify-report.md`, and `verification_readiness` surfaces are the durable Step 4 inputs for `forge split`, adding a dedicated Step 4 handoff-contract regression suite, and keeping the Step 3 runtime surface unchanged.

Step 3 Batch 3 is complete, and Step 3 is now frozen for V1 except for future bug fixes. Step 4 should consume the persisted Step 3 outputs instead of re-verifying broad planning logic from scratch.

Step 4 Batch 1 is complete. `forge split` now consumes the persisted Step 3 `verify.json` handoff plus the referenced Step 2 `plan.json`, emits real workstreams/categories/merge-order/blocking output, persists `split.json` and `split-report.md`, and keeps optional debug mirrors behind `FORGE_SPLIT_DEBUG=1` without reopening the frozen top-level split contract.

Step 4 Batch 2 Part 1 is a narrow alignment pass over that already real split runtime. It hardens the explicit Batch 2 mission, ordered implementation priorities, and do-not-touch guardrails in the Step 4 boundary contract so later Batch 2 work stays inside the real split path instead of drifting into Step 5 execution behavior, code-edit packet generation, code modification, verification bypass, or broad Step 4 redesign.

Step 4 Batch 2 Part 2 makes the Stage 1 and Stage 2 split foundation materially real without reopening the public split surface. Step 4 now normalizes persisted Step 3 verify output plus the referenced Step 2 plan artifact into indexed per-plan-item evidence bundles, validates that the verify-to-plan handoff stays aligned, and builds structured workstreams from that normalized evidence instead of repeatedly re-deriving context from raw arrays.

Part 2 also introduces bounded real regrouping where it improves execution readiness without weakening auditability: direct source/test pairs can group only on explicit hard dependencies plus a shared dominant surface, same-surface siblings can group only when they share concrete conflict or verification context and have no unsafe outside dependencies, and blocked or migration-order work remains explicit. The public `forge split` CLI, top-level `split.json` keys, and split-report heading order remain unchanged.

Step 4 Batch 2 Part 3 makes Stage 3 and Stage 4 materially real without reopening the public split surface. Split now resolves final stream categories after grouping from real Step 2 and Step 3 evidence instead of only echoing Step 2 parallelization signals: warning-grade carry-forward caution can downgrade work to `protected_merge`, blocked upstream dependencies can block downstream standalone streams, and grouped streams can now expose partially blocked plan items without hiding the rest of the stream.

Part 3 also hardens merge-order and blocking behavior so dependency ordering remains explicit even when a downstream stream stays `safe_parallel`, blocked work stays first-class in `blocked_items`, and the carried-forward stream-constraint detail now preserves base versus final category, category reasons, merge-order reasons, blocking reasons, warning notes, mitigation summaries, blocked-upstream linkage, and blocked-plan-item linkage while keeping the top-level `split.json` contract and split-report heading order stable.

Step 4 Batch 2 Part 4 hardens the shipped split outputs without reopening the public surface. `split_readiness` now exposes explicit execution scope plus blocked-workstream, partially-blocked-item, and merge-order-rule counts so later steps do not have to reverse-engineer execution readiness from raw arrays, `split-report.md` renders those derived readiness fields directly while keeping the frozen heading order, and the optional `FORGE_SPLIT_DEBUG=1` mirrors stay aligned with the primary artifact on ready, warning-heavy, blocked, and fallback-output-failed runs.

Step 4 Batch 2 Part 5 closes the runnable milestone and default verification gate without reopening the split surface. `forge split` already ran the real Step 4 flow, so Part 5 hardens the shipped milestone by wiring a dedicated runnable-milestone regression into `npm.cmd test`, proving the packaged CLI can consume persisted Step 3 output plus the referenced Step 2 plan, build real workstreams/categories/merge-order output, persist honest `split.json` and `split-report.md` files, and keep CLI output minimal. Step 4 Batch 2 is now complete, with later Step 4 work reserved for hardening and freeze follow-up rather than first-time CLI wiring.

Step 4 Batch 3 Part 1 is the finish-and-freeze framing pass over that already real split runtime. It makes the Step 4 freeze goal explicit in code, adds explicit finish-line and do-not-touch boundary metadata to the Step 4 boundary contract, reframes conservative regrouping as hardening the already-shipped aggressive regrouping behavior rather than reinventing it, adds dedicated Batch 3 Part 1 freeze coverage for grounded, warning-heavy, repeated-run, and debug-output split runs, and keeps the public `forge split` CLI plus top-level `split.json` / `split-report.md` contracts stable.

Step 4 Batch 3 Part 2 hardens the real regrouping, blocking, and merge-order semantics without reopening the frozen top-level split contract. `forge split` now preserves structured regrouping rationale and member-level traceability inside `stream_constraint_details`, exposes first-class structured blocking status that distinguishes blocked versus partially blocked grouped work while keeping constraining findings/constraints/concerns inspectable, and carries explicit nested merge-order status plus source-linked rule kinds through the artifact, report, and debug outputs. The default test gate now includes a dedicated Batch 3 Part 2 regression alongside stronger workstream-model and report coverage.

Step 4 Batch 3 Part 3 hardens the actual Step 4 outputs so later stages can consume them without reinterpreting split quality from scratch. `split.json` now carries an explicit later-step gate plus material execution limits inside `split_readiness`, debug output now includes a dedicated `split-readiness.json` mirror alongside the existing split debug files, and `split-report.md` renders the later-step gate, material execution limits, and debug readiness path while keeping the frozen top-level artifact shape and report heading order stable.

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
