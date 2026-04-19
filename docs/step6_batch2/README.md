# Step 6 Batch 2 — Integrate Hardening

## Overview

After `forge integrate` happy path works (Batch 1), Batch 2 makes it resilient to edge cases, bad AI responses, missing artifacts, and CI/CD usage.

## What This Batch Does

Hardens the integrate step with: `--force`/`--auto` flags, robust JSON extraction, error classification with retry, graceful missing artifact handling, freeze criteria, and partial execute.json support.

## Spec Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Architecture, tasks, error codes, verification checklist |
| `progress.md` | Current task status and commit history |

## Context Files (Read First)

- `src/integrate/cli.ts` — Current integrate CLI
- `src/integrate/prompt-builder.ts` — Current prompt builder
- `src/integrate/test-runner.ts` — Current test runner
- `src/integrate/schema.ts` — Current Zod schemas
- `docs/S6-B1-Done/validation-contract.md` — Batch 1 validation contract

## Task Summary

| # | Task | Agent |
|---|------|-------|
| 1 | Flag Hardening (`--force`, `--auto`) | MiniMax |
| 2 | JSON Extraction (robust parsing) | MiniMax |
| 3 | Error Classification + Retry | MiniMax |
| 4 | Missing Artifact Handling | MiniMax |
| 5 | Freeze Criteria | MiniMax |
| 6 | Partial execute.json | MiniMax |

## Quick Start

1. Read `SPEC.md` for full context
2. Read `src/integrate/cli.ts` to understand current structure
3. Implement tasks in order (1 → 6)
4. Update tests in `tests/integrate.cli.test.ts`
5. Verify against checklist in `SPEC.md`

## Completion

After all tasks done → create `docs/S6-B2-Done/` with p1-done through p6-done closeout docs.
