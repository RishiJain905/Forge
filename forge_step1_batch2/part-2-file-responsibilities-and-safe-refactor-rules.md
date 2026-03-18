# Part 2 — File-by-File Responsibilities and Safe Refactor Rules

## Purpose

This document maps Step 1 responsibilities onto real Intake files in the current codebase and defines what each file should own.

This part exists so implementation work is grounded in actual repo structure instead of imagined files.

---

## Why this matters

Without explicit file ownership, coding agents tend to:
- duplicate logic
- invent extra files
- over-split modules
- refactor too aggressively
- place logic in unstable locations

This document prevents that.

---

## General file ownership rules

### Rule 1
Every important Step 1 behavior should have one obvious home.

### Rule 2
Thin wrappers are allowed only if they improve clarity. If a file is basically a pass-through with no real ownership, it may be merged safely.

### Rule 3
If an existing file already cleanly owns a responsibility, keep it.

### Rule 4
Do not create new files unless the current structure cannot cleanly support the responsibility.

### Rule 5
When in doubt, stabilize existing files rather than expanding the file tree.

---

## Intake file map

The following file names are based on the current repository structure and should be treated as real working surfaces for Step 1.

### `src/intake/runner.ts`
**Role:** main Step 1 orchestrator

#### What it must own
- the end-to-end Intake sequence
- orchestration order
- calling domain services in the correct order
- collecting intermediate outputs
- status/readiness resolution trigger
- artifact/report assembly trigger
- persistence trigger
- final return shape

#### What it must not own
- deep parsing logic
- repo scanning logic
- candidate file matching internals
- direct markdown formatting details
- low-level filesystem helpers

#### Notes
This should be the clearest file in the Intake system. Reading it should show the whole Step 1 flow.

---

### `src/intake/input.ts`
**Role:** raw input resolution and mode normalization

#### What it must own
- resolving spec mode vs prompt mode
- top-level loading of prompt/spec/constraints/notes
- input path normalization
- focus path normalization
- repo path resolution
- top-level input validation support

#### What it may own
- helpers for loading file contents needed by Intake

#### What it must not own
- task extraction logic
- repo scan logic
- artifact writing

---

### `src/intake/task-parser.ts`
**Role:** task parsing and normalization

#### What it must own
- markdown structure parsing where relevant
- prompt mode normalization into internal task shape
- extraction of:
  - title
  - summary
  - goal
  - scope
  - explicit requirements
  - acceptance criteria
  - constraints
  - mentioned paths/modules/tests
  - risky phrases
  - open questions
- parse-level warnings
- inferred implementation necessities, as long as they stay strictly engineering-oriented

#### What it must not own
- repo-dependent candidate targeting
- git inspection
- persistence
- final status resolution

---

### `src/intake/repo-context.ts`
**Role:** repository scanning and context detection

#### What it must own
- language detection
- framework signal detection
- package manager detection
- key directories
- candidate entry points
- test framework detection
- test location detection
- CI signal detection
- git context collection if available
- repo layout summary generation

#### What it must not own
- task parsing
- final candidate target matching
- artifact writing

---

### `src/intake/candidate-targets.ts`
**Role:** candidate file/module mapping

#### What it must own
- mapping task signals + repo context into likely affected files/modules
- focus-aware prioritization
- strict-focus enforcement for target selection
- shared-risk file detection
- match reasons and confidence notes

#### What it must not own
- generic repo scanning
- final confidence scoring
- ambiguity severity assignment
- report formatting

---

### `src/intake/confidence.ts`
**Role:** confidence scoring and possibly readiness helpers

#### What it must own
- confidence scoring logic
- confidence drivers
- overall confidence resolution
- confidence notes generation

#### What it may own
- readiness support only if it remains clean and tightly related

#### Safe merge rule
If readiness logic is currently fragmented elsewhere and the file stays clear, it is acceptable to combine confidence + readiness into one module.

---

### `src/intake/report.ts`
**Role:** human-readable report generation

#### What it must own
- generation of `.forge/reports/intake-report.md`
- report section ordering
- developer-readable formatting
- explicit surfacing of assumptions, ambiguities, confidence, and readiness

#### What it must not own
- writing to disk
- parsing or scanning logic
- candidate matching internals

---

### `src/intake/persistence.ts`
**Role:** file writing and output persistence

#### What it must own
- ensuring output directories exist
- writing intake.json
- writing report markdown
- writing optional debug artifacts
- stable path management for Step 1 outputs

#### What it must not own
- artifact content generation rules
- task parsing
- repo scanning

---

## Additional likely files

If these or similar files exist in the repo, use them according to this intent.

### artifact-related files
Examples:
- `artifact.ts`
- `artifact-schema.ts`
- `artifact-sections.ts`

#### Recommended ownership
- schemas/types belong in schema/type files
- artifact section construction may be separate if substantial
- if these files are tiny and always edited together, they may be combined into one clearer artifact builder module

### ambiguity/risk-related files
If separate files exist for ambiguity or risk analysis, keep them separate only if:
- the responsibility is genuinely distinct
- the logic is non-trivial
- tests benefit from isolated ownership

Otherwise, it may be reasonable to combine risk + ambiguity analysis into one analysis module.

### verification-target files
If initial verification target detection is currently buried in another file, consider extracting it only if the logic is growing. For V1, it may remain part of the analysis layer if the code stays readable.

---

## Safe refactor rules by category

### Allowed: merge ultra-thin files
If a file:
- only forwards a function
- has almost no logic
- creates mental overhead
- is always changed with another file

then merging is allowed.

### Allowed: extract duplicated helpers
If path normalization, warning creation, confidence note creation, or simple shared transforms are duplicated, moving them into one shared helper location is allowed.

### Allowed: tighten orchestration ownership
If orchestration is scattered, move it into `runner.ts` as long as behavior is preserved.

### Not allowed: abstract everything into interfaces
V1 does not need a large interface-heavy service architecture.

### Not allowed: create “manager” or “engine” classes unless clearly justified
Prefer direct functional modules over unnecessary class layers.

### Not allowed: move stable logic across domains casually
Keep parsing in parsing, repo scanning in repo scanning, persistence in persistence.

---

## Inputs and outputs by file

### `runner.ts`
Inputs:
- validated CLI/runtime input
- outputs from all subservices

Outputs:
- final Step 1 run result
- trigger to persist artifact/report

### `input.ts`
Inputs:
- CLI flags
- optional files and repo path

Outputs:
- resolved raw input bundle

### `task-parser.ts`
Inputs:
- spec text or prompt text
- constraints
- notes

Outputs:
- normalized task spec
- parse warnings
- task ambiguities/open questions

### `repo-context.ts`
Inputs:
- repo root
- git availability
- focus paths as hints only

Outputs:
- repo context

### `candidate-targets.ts`
Inputs:
- normalized task spec
- repo context
- focus info
- strict-focus mode

Outputs:
- candidate targets section

### `confidence.ts`
Inputs:
- task parse quality
- repo mapping quality
- ambiguity/warning density
- target plausibility

Outputs:
- confidence summary
- readiness support if owned here

### `report.ts`
Inputs:
- final assembled artifact or equivalent sections

Outputs:
- markdown report string

### `persistence.ts`
Inputs:
- artifact
- report
- optional debug artifacts
- output dir

Outputs:
- persisted files

---

## Edge cases to handle through file ownership

- prompt mode with very little detail
- spec mode with irregular headings
- repo without tests
- repo without git
- focus paths that conflict with likely relevant files
- partial success with warnings
- failure that still should emit useful report data

Ownership should make these cases easier to reason about, not harder.

---

## Acceptance criteria

This part is complete when:
- each major existing Intake file has a clear responsibility
- the orchestrator has a clear home
- merge/cleanup rules are explicit and conservative
- no important behavior is floating without ownership
- file responsibilities are specific enough that Codex does not need to invent them

---

## Guardrails

- Do not rename files unless absolutely necessary.
- Do not create abstraction layers just to look clean.
- Prefer stable ownership over theoretical purity.
- If a file already works well and owns a clear concern, keep it.
