# Step 6 Batch 1 — Integrate: Core Types, Schema, and Artifact

## Overview

Step 6 is the final step of the Forge pipeline. After `forge execute` AI-implements all workstreams, `forge integrate` verifies the whole system works together by generating and running integration tests.

## What This Batch Does

Establishes the complete foundation for `forge integrate` — all implemented in one mission (GLM).

## Spec Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Architecture, goals, what this batch is/isn't, file structure, verification checklist |
| `OVERVIEW.md` | **Complete implementation guide** — all types, schemas, functions, files, code, implementation order, constraints |
| `progress.md` | Current task status and commit history |

## Quick Start

1. Read `SPEC.md` for architecture context
2. Read `OVERVIEW.md` for complete implementation details
3. Implement `src/integrate/` following the implementation order in OVERVIEW.md
4. Update `src/cli.ts` to register the `integrate` command
5. Write TDD tests in `tests/integrate.types-schema.test.ts`
6. Verify against the checklist in OVERVIEW.md

## Completion

After all tasks done → create `docs/S6-B1-Done/` with p1-done through p4-done closeout docs.
