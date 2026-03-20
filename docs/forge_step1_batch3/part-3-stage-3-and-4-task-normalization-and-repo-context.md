# Part 3 — Stage 3 and 4: Task Normalization and Repo Context

## Purpose

This part covers:
1. task parsing and normalization
2. repo scanning and context detection

Together, these two stages create the core understanding that later Step 1 analysis depends on.

---

## Why this matters

Spec mode does not become useful just because a file is loaded.
It becomes useful when:
- the task is normalized into structured fields
- the repo is understood well enough to ground the task

If either side is weak, candidate targeting and analysis become guessy.

---

# Stage 3 — Task parsing and normalization

## Goal

Convert spec-mode input into a stable `NormalizedTaskSpec`.

## What Codex must build

Codex must make the task parsing layer reliably extract:
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
- conservative inferred implementation necessities

## Required implementation tasks

1. Audit current task parsing logic.
2. Ensure it handles:
   - structured markdown headings
   - semi-structured markdown
   - messy but still readable markdown
3. Extract explicit fields where present.
4. Generate open questions when important sections are missing or unclear.
5. Detect risky phrases using deterministic matching/rules first.
6. Infer engineering necessities only when they are implementation-scoped.
7. Avoid inventing new product behavior.

## Required code surfaces

Likely files:
- `src/intake/task-parser.ts`
- any supporting parsing helpers
- any heading/risk extraction helpers

## Inputs
- spec text
- optional constraints text
- optional notes text

## Outputs
- `NormalizedTaskSpec`
- parse warnings
- task-level ambiguity/open questions signals

## Edge cases
- markdown with no headings
- repeated sections
- acceptance criteria hidden in prose
- constraints implied but not labeled
- risky phrases used casually rather than strongly

## Acceptance criteria
- spec mode produces a useful normalized task object
- irregular specs still yield structured output where possible
- invented scope is avoided
- ambiguity is surfaced when structure is weak

## Guardrails
- do not tie parsing to repo scanning
- do not bury warnings inside raw strings only
- keep parsing deterministic-first

---

# Stage 4 — Repo context detection

## Goal

Build a usable `RepoContext` for the current repository.

## What Codex must build

Codex must make repo-context detection reliably gather:
- detected languages
- framework signals
- package manager signals
- key directories
- candidate entry points
- test frameworks and test locations
- CI/test command hints if practical
- git context when available
- a repo layout summary

## Required implementation tasks

1. Audit current `repo-context.ts`.
2. Ensure JS/TS repos are handled best, since V1 is TypeScript-first.
3. Support Python repos on a best-effort basis where easy.
4. Make git optional, not required.
5. Ensure missing tests/frameworks become warnings, not failures.
6. Generate a concise repo layout summary for report/debug value.
7. Keep repo scanning read-only.

## Required code surfaces

Likely files:
- `src/intake/repo-context.ts`
- git helpers if separate
- language/framework detection helpers if separate

## Inputs
- repo root
- focus paths as hints
- git availability

## Outputs
- `RepoContext`
- repo scan warnings

## Edge cases
- repo has no git
- monorepo-ish structure
- tests exist in nonstandard paths
- framework signals are weak or mixed
- package manager clues conflict

## Acceptance criteria
- repo context is good enough to ground spec mode
- no-git repos still work
- repo scan output is stable enough for candidate targeting
- warnings are meaningful without blocking useful runs

## Guardrails
- do not make repo scanning depend on candidate targeting
- do not overbuild full semantic repo understanding
- optimize for practical grounding, not perfection
