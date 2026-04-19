# Step 6 Batch 3 — Integrate Polish, Freeze & V1 Completion

## Overview

After `forge integrate` is hardened (Batch 2), Batch 3 polishes the surface, addresses all open questions from Batch 2, adds parallel test execution, and freezes Step 6 for V1.

## What This Batch Does

- Addresses all 5 Open Questions from Batch 2 definitively
- Adds parallel test file generation and execution
- Polishes prompt builder performance
- Polishes CLI output, error messages, and the integration report
- Validates the full integrate surface against the smoke test suite
- Freezes Step 6 for V1 with explicit boundary documentation

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
- `src/integrate/artifact.ts` — Current artifact builder
- `src/integrate/report.ts` — Current report generator
- `docs/S6-B1-Done/validation-contract.md` — Batch 1 validation contract
- `docs/S6-B2-Done/p6-done.md` — Batch 2 final closeout
- `step6_batch2/SPEC.md` — Batch 2 spec (including Open Questions)

## Task Summary

| # | Task | Agent |
|---|------|-------|
| 1 | Open Questions | Address all 5 Batch 2 open questions definitively |
| 2 | Parallel Test Execution | Concurrent test file generation and execution |
| 3 | Prompt Builder Polish | Performance optimization and clarity |
| 4 | CLI Output Polish | Better output, error messages, report polish |
| 5 | Freeze + Smoke | Smoke test, freeze boundary, V1 sign-off |

## Quick Start

1. Read `SPEC.md` for full context
2. Read relevant source files to understand current structure
3. Implement tasks in order (1 → 5)
4. Update tests in `tests/integrate.*.test.ts`
5. Verify against checklist in `SPEC.md`

## Completion

After all tasks done → create `docs/S6-B3-Done/` with p1-done through p5-done closeout docs.
