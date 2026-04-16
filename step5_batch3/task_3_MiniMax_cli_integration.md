# Task 3: CLI Integration

**Agent:** MiniMax
**Step:** 5.3.3

## Goal

Wire the AI execution engine (tasks 1 and 2) into the CLI. Replace the manual `run <id>` flow with an AI-powered execution flow. The state machine still drives the transitions, but now `run <id>` triggers the AI pipeline instead of just setting a state.

## In Scope

- `src/execute/cli.ts` — update `runExecuteCommand` and `processLine`
- When user types `run <id>`: trigger AI execution pipeline (prompt builder → model connector → apply changes → state transition)
- Update `runExecuteCommand` to optionally auto-execute unblocked workstreams (new `--auto` flag)
- Track AI execution state: show model name while running, show changes made on completion
- Update the interactive dashboard to show AI execution progress (model name, file count being modified)
- Handle `forge execute --help` to document the new AI execution behavior and model configuration
- New environment variable: `FORGE_EXECUTE_AUTO` (if set, auto-execute all unblocked workstreams without prompting)
- Update `ExecuteCommandOptions` in `types.ts` to include `auto?: boolean` (task 4 does the types extension, but note the field here)

## Out of Scope

- Building the prompt (task 1)
- Calling the model (task 2)
- Types/schema extension (task 4)
- Multi-agent execution (V2)

## Task List

1. Read `src/execute/cli.ts` fully — understand the current interactive loop
2. Read `src/execute/prompt-builder.ts` (after task 1 is done) — understand `buildWorkstreamPrompt`
3. Read `src/execute/model-connector.ts` (after task 2 is done) — understand `executeWorkstream`
4. Update `src/execute/cli.ts`:
   - Add imports for `buildWorkstreamPrompt` and `executeWorkstream`
   - Modify `processLine` so `run <id>` calls the full AI pipeline:
     ```
     1. Build prompt from split/plan/verify context
     2. Call executeWorkstream(prompt, repoRoot)
     3. On success: transition to completed (state machine)
     4. On failure: transition to failed with error
     ```
   - Add `--auto` flag: when set, find all unblocked workstreams and execute them sequentially
   - Add a new command `aiEXECUTE <id>` as an alias for `run <id>` (for clarity)
   - Update dashboard to show AI execution state: `running (AI: gpt-4o...)`
   - Update summary output on `done <id>` to show what changed (file count, lines)
5. Add a new `FORGE_EXECUTE_AUTO` environment variable:
   - If set (any value), auto-execute without prompting
   - If not set, require explicit `run <id>` per workstream
6. Error handling: if AI execution fails, mark workstream as `failed` with the error message
7. Update help text in CLI to document:
   - New AI execution behavior
   - Required env vars: `FORGE_MODEL_PROVIDER`, `FORGE_MODEL_NAME`
   - Optional env vars: `FORGE_MODEL_API_KEY`, `FORGE_MODEL_BASE_URL`, `FORGE_EXECUTE_AUTO`
8. Write `tests/execute.cli-ai-integration.test.ts`

## Key CLI Changes

### Before (Batch 1/2)
```
> run 1
✓ ws-1 STARTED

> done 1
✓ ws-1 COMPLETED and MERGED
```

### After (Batch 3)
```
> run 1
[AI] Calling gpt-4o for workstream: add-user-auth...
[AI] Modifying: src/auth.ts (+42 lines)
[AI] Creating: src/auth.test.ts (+38 lines)
✓ ws-1 COMPLETED (AI) — 2 files changed, +80 lines

> run 2
[AI] Calling gpt-4o for workstream: api-rate-limiting...
[AI] Modifying: src/api/middleware.ts (+67 lines)
✓ ws-2 COMPLETED (AI) — 1 file changed, +67 lines
```

### Auto Mode
```
$ FORGE_EXECUTE_AUTO=1 forge execute
[AI] Auto-executing 3 unblocked workstreams...
[AI] ws-1: add-user-auth...
✓ ws-1 COMPLETED — 2 files changed
[AI] ws-2: api-rate-limiting (waiting on ws-1)...
[AI] ws-2: api-rate-limiting...
✓ ws-2 COMPLETED — 1 file changed
[AI] ws-3: integration-tests...
✓ ws-3 COMPLETED — 3 files changed
```

## Acceptance Criteria

- [ ] `run <id>` triggers AI execution pipeline (prompt → model → apply → state transition)
- [ ] `aiEXECUTE <id>` works as alias for `run <id>`
- [ ] `--auto` flag executes all unblocked workstreams in merge_order sequence
- [ ] `FORGE_EXECUTE_AUTO=1` env var enables auto-execute mode
- [ ] AI execution failure marks workstream as `failed` with error in artifact
- [ ] Dashboard shows model name while AI is running
- [ ] Dashboard shows change summary (file count, lines) on completion
- [ ] `forge execute --help` documents AI execution and env vars
- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS
