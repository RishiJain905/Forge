# Step 5 Batch 1 — Execute Core (V1 Minimal)

## Goal

Build the minimal V1 `forge execute` step that:
1. Reads `split.json` from Step 4
2. Tracks workstream execution state interactively (human drives, Forge records)
3. Enforces `merge_order` as a hard gate — downstream workstreams cannot complete until prerequisites merge
4. Produces a typed `execute.json` artifact

## Scope

**In scope:**
- `forge execute` CLI command
- Read `split.json` and extract workstream definitions, merge_order, blocked items
- Interactive state machine: queued → running → completed / failed / blocked
- Constraint engine that enforces merge_order before allowing a workstream to complete
- `execute.json` artifact with per-workstream status
- Basic tests

**Out of scope (V2):**
- AI agent dispatch
- API adapter layer
- Model configuration / management
- Concurrent workstream execution
- Automatic retry / rollback

## V1 Design

Forge does NOT run agents. The human developer does the actual work. Forge's job is to:

1. Show the workstream list and their merge_order constraints
2. Accept state transitions from the human (mark running / done / failed)
3. Enforce merge_order — if a downstream workstream tries to complete but its prerequisite hasn't merged, Forge blocks it and tells the human why
4. Record everything in `execute.json`

## Task List

### Task 1: Execute Types and Schema

Create `src/execute/types.ts` and `src/execute/schema.ts`:

- `ExecuteWorkstreamState`: `queued | running | completed | failed | blocked`
- `ExecuteWorkstream`: workstream id, title, state, started_at?, completed_at?, error?, merge_order_violations?
- `MergeOrderGate`: tracks which workstreams have been merged
- `execute.json` schema using Zod (matches artifact boundary pattern from Steps 1-4)
- Export types for use by other modules

### Task 2: Execute State Machine

Create `src/execute/state-machine.ts`:

- `createExecuteState(splitJson)`: initialize all workstreams to `queued`
- `transitionState(workstreamId, newState)`: validate and apply state transition
- Valid transitions: queued → running → completed, queued → blocked, running → failed
- **merge_order enforcement**: when transitioning to `completed`, check if all `mergeOrderAfter` prerequisites have been merged. If not, reject with violations list.
- `getExecutableWorkstreams()`: return workstreams in `queued` or `blocked` that have no pending merge_order prerequisites
- Track `mergedWorkstreams: Set<string>` as workstreams that have successfully completed

### Task 3: Execute CLI Command

Create `src/execute/cli.ts`:

- `forge execute` command
- Reads `.forge/split.json` (from Step 4 output)
- Shows interactive dashboard:
  - All workstreams with their current state
  - Merge order constraints for each
  - Which are blocked and why
- Accepts commands:
  - `run <id>` — mark a workstream as running
  - `done <id>` — mark a workstream as completed (constraint engine checks merge_order)
  - `fail <id> [reason]` — mark a workstream as failed
  - `status` — show current state of all workstreams
  - `exit` — write execute.json and exit
- On exit, produce `execute.json`

### Task 4: Execute Artifact Writer

Create `src/execute/artifact.ts`:

- `writeExecuteArtifact(path, state)`: write the execute.json artifact
- Include all workstream states, merge_order gate status, timestamps
- Follow the artifact writing pattern from Steps 1-4

### Task 5: CLI Wiring

Wire `forge execute` into `src/cli.ts`:

- Add `execute` subcommand to the CLI
- Register `src/execute/cli.ts` as the execute step handler
- Follow the same pattern as `forge intake`, `forge plan`, etc.

### Task 6: Tests

Create `tests/execute.v1-minimal.test.ts`:

- Test state machine transitions
- Test merge_order enforcement (blocked workstream can't complete until prerequisites merge)
- Test CLI flow with mock split.json input
- Test artifact writing

## Acceptance Criteria

- [ ] `forge execute` reads `split.json` and displays workstreams with merge_order constraints
- [ ] Human can mark workstreams as running / completed / failed
- [ ] Completing a workstream is blocked if its `mergeOrderAfter` prerequisites haven't completed
- [ ] `execute.json` is produced with per-workstream state at exit
- [ ] Tests pass: `npm test`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Builds: `npm run build`

## Follow-On

Step 5 Batch 2 will cover: execution report generation, error handling polish, edge case hardening.
