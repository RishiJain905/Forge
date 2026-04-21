# Step 5 Batch 3 — AI-Powered Execute

## Goal

Add AI execution capability to Step 5. Each workstream is now implemented by an AI model that reads the workstream context and writes actual code changes to disk. The state machine continues to enforce merge order, but the `running` state now means "AI is actively implementing this workstream."

---

## Context Files (Read First)

Before any implementation, read ALL of these:

- `src/execute/cli.ts` — current execute CLI (interactive dashboard, will be extended)
- `src/execute/state-machine.ts` — current state machine (drives everything, unchanged)
- `src/execute/types.ts` — current type definitions (extended for AI fields)
- `src/execute/schema.ts` — current schema (extended for AI fields)
- `src/execute/artifact.ts` — current artifact writer (unchanged, artifact shape changes)
- `src/split/types.ts` — SplitWorkstream type (source of truth for workstream data)
- `src/split/schema.ts` — split artifact schema
- `src/plan/types.ts` — plan item types (requirement → file mapping)
- `src/verify/types.ts` — verify findings/constraints (safety constraints for AI)
- `step5_batch2/SPEC.md` — Batch 2 spec (existing execute surface)
- `docs/Forge_step5_Batch1/Forge_step5_Batch1/p1-done.md` through `p6-done.md` — Batch 1 completion summaries

---

## What This Batch Is

- AI model integration: call a cloud model to implement each workstream
- AI prompt builder: construct a rich prompt per workstream using split/plan/verify context
- Apply changes: write AI-generated code to disk, track what changed
- CLI integration: the interactive dashboard now triggers AI execution, not manual `run <id>`
- Model configuration: user provides their own API key/endpoint (env var or config)
- execute.json extended: tracks changes_made, ai_model_used, ai_prompt_hash per workstream

## What This Batch Is NOT

- Multi-agent orchestration (V2 future_idea_implementation/multi-agent-orchestration.md)
- Concurrent workstream execution by AI (V2 — one AI at a time, merge_order enforced)
- AI-generated integration tests (that is Step 6)
- Agent adapter plugin system (V2)

---

## Architecture

### High-Level Flow

```
forge execute
  → Read split.json
  → Create ExecuteState (all queued)
  → LOOP:
      → Select next unblocked workstream (merge_order enforced)
      → state: queued → running
      → BUILD PROMPT (workstream context + file contents + plan + verify constraints)
      → CALL AI MODEL (user-provided cloud model)
      → APPLY CHANGES (write to disk)
      → VERIFY (optional typecheck/lint)
      → state: running → completed (merge_order satisfied) OR failed
  → WRITE execute.json (with changes_made, ai_model_used, ai_prompt_hash)

The interactive dashboard is replaced/supplemented: `run <id>` triggers AI execution.
A new `aiEXECUTE <id>` command (or auto-run unblocked) does the AI call.
```

### What the AI Prompt Receives Per Workstream

Each workstream prompt is constructed from:

1. **Workstream description** — `title` + `description` from split.json
2. **Target files** — current contents of all `likelyAffectedPaths` files read from disk
3. **Plan item context** — requirement text, category, risk level, parallelization signal from plan.json
4. **Verify constraints** — conflict zones, safety rules, carried-forward concerns from verify.json
5. **Merge order position** — what must complete before this workstream runs
6. **Carried-forward constraints** — stream_constraint_details from split.json

The AI does NOT receive:
- Other completed workstream outputs (isolation)
- Full codebase (only target files listed in likelyAffectedPaths)

### Model Provider Configuration

Users provide their model via environment variable:
- `FORGE_MODEL_PROVIDER` — `openai` | `anthropic` | `google` | `ollama` | `glm`
- `FORGE_MODEL_NAME` — model name (e.g., `gpt-4o`, `claude-3-5-sonnet-4`, `gemini-2.5-flash`)
- `FORGE_MODEL_API_KEY` — API key (or use `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- `FORGE_MODEL_BASE_URL` — optional base URL for proxy/self-hosted

The model connector supports:
- OpenAI-compatible API (most providers)
- Anthropic (Claude)
- Google AI (Gemini)
- Ollama (local)
- Zhipu AI (GLM) — matches the user's existing setup

### State Machine Changes

The state machine (state-machine.ts) is UNCHANGED. It already handles queued→running→completed/failed transitions with merge_order enforcement. The CLI is updated to:
1. Auto-trigger AI execution when a workstream enters `running` state
2. Record AI model + prompt hash in the workstream metadata
3. Record changes_made when the AI call succeeds

---

## Task Breakdown

| # | Task | Description | Agent |
|---|------|-------------|-------|
| 1 | AI Prompt Builder | Construct rich per-workstream prompts using split/plan/verify context | GLM |
| 2 | AI Model Connector | API call abstraction, streaming, retry, apply-to-disk | GLM |
| 3 | CLI Integration | Wire AI execution into the CLI; `run <id>` triggers AI | MiniMax |
| 4 | Types/Schema/Artifact Extension | Extend types.ts, schema.ts, artifact.ts for AI fields | MiniMax |

---

## File Structure

```
step5_batch3/
├── SPEC.md                           # This file
├── README.md                         # Batch 3 index
├── progress.md                       # Progress tracking
├── task_1_GLM_ai_prompt_builder.md
├── task_2_GLM_ai_model_connector.md
├── task_3_MiniMax_cli_integration.md
└── task_4_MiniMax_types_schema_artifact.md

src/execute/
├── cli.ts              UPDATE — add AI execution flow, replace manual run
├── prompt-builder.ts   NEW — construct AI prompt per workstream
├── model-connector.ts  NEW — call AI model, apply changes to disk
├── types.ts            UPDATE — add AI fields to ExecuteWorkstream
├── schema.ts           UPDATE — add AI fields to schemas
└── artifact.ts         UPDATE — buildExecuteArtifact includes AI fields

tests/
├── execute.ai-prompt-builder.test.ts      NEW
├── execute.model-connector.test.ts        NEW
├── execute.cli-ai-integration.test.ts    NEW
└── execute.types-schema-ai.test.ts       NEW
```

---

## Verification

All tasks must pass before Step 5 Batch 3 is considered complete:

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions)
- [ ] `npm run smoke` — PASS
- [ ] `forge execute` with AI model produces code changes on disk
- [ ] `execute.json` contains `changes_made[]`, `ai_model_used`, `ai_prompt_hash` per workstream
- [ ] Merge order is enforced — AI workstream only completes after prerequisites complete
- [ ] AI errors produce `failed` state with error message in artifact
- [ ] Model provider configuration is read from environment variables
- [ ] If no `FORGE_MODEL_PROVIDER` set, `forge execute` fails with clear error before starting AI calls
