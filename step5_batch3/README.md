# Step 5 Batch 3 — AI-Powered Execute

## Overview

Step 5 Batch 3 adds AI execution capability to Forge Execute. Each workstream is now implemented by an AI model that reads the workstream context and writes actual code changes to disk.

## Status

| Task | Agent | Status |
|------|-------|--------|
| Task 1: AI Prompt Builder | GLM | Pending |
| Task 2: AI Model Connector | GLM | Pending |
| Task 3: CLI Integration | MiniMax | Pending |
| Task 4: Types/Schema/Artifact Extension | MiniMax | Pending |

## Prerequisites

Read before starting any task:
- `src/execute/cli.ts`
- `src/execute/state-machine.ts`
- `src/execute/types.ts`
- `src/execute/schema.ts`
- `src/execute/artifact.ts`
- `src/split/types.ts`
- `src/plan/types.ts`
- `src/verify/types.ts`
- `step5_batch2/SPEC.md`
- `docs/Forge_step5_Batch1/Forge_step5_Batch1/p*-done.md`

## Key Design Decisions

1. **State machine unchanged** — The state machine already handles queued→running→completed/failed. The CLI is updated to trigger AI inside `running`.
2. **One AI at a time** — No concurrent AI execution in V1. Merge order enforced.
3. **User provides model** — `FORGE_MODEL_PROVIDER` + `FORGE_MODEL_NAME` env vars.
4. **Isolation** — AI only sees target files (likelyAffectedPaths), not other workstream outputs.
5. **Reproducibility** — `ai_prompt_hash` stored per workstream for audit.

## Progress

See `progress.md` for detailed per-task progress.
