# Step 6 Batch 1 — Integrate: Core Types, Schema, and Artifact

## Overview

Step 6 is the final step of the Forge pipeline. After `forge execute` AI-implements all workstreams, `forge integrate` verifies the whole system works together by generating and running integration tests.

## What This Batch Does

Establishes the complete foundation for `forge integrate`:
1. Core type definitions
2. Zod schemas for validation
3. AI-powered integration test prompt builder + test executor
4. CLI wiring (`forge integrate` command)

## Batch Status

See `progress.md` for current status.

## Spec

See `SPEC.md` for full specification.

## Task Specs

- `task_1_TYPES.md` — Core TypeScript types
- `task_2_SCHEMA.md` — Zod schemas
- `task_3_PROMPT_BUILDER.md` — AI prompt builder + test runner
- `task_4_CLI_WIRING.md` — CLI integration

## Verification

All tasks verified against the checklist in `SPEC.md`.
