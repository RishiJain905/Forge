# Task 3: Execute CLI Command

## Goal

Create `src/execute/cli.ts` with the interactive `forge execute` CLI that tracks workstream execution states.

## Details

### CLI Flow

```
$ forge execute
Welcome to Forge Execute (V1)

Reading split.json from .forge/split.json...
Found 4 workstreams.

=== Workstream Status ===
[1] ws-auth         queued    │ merge after: []
[2] ws-api          queued    │ merge after: [ws-auth]
[3] ws-frontend     queued    │ merge after: [ws-auth]
[4] ws-integration  queued    │ merge after: [ws-api, ws-frontend]

Commands: run <id> | done <id> | fail <id> [reason] | status | exit

> run 1
Workstream ws-auth is now RUNNING

> done 1
✓ ws-auth COMPLETED and MERGED
ws-api is now unblocked
ws-frontend is now unblocked

> run 2
Workstream ws-api is now RUNNING

> exit
Writing execute.json...
Done. execute.json written to .forge/execute.json
```

### Interactive Dashboard

Display after every state change:

```
=== Workstream Status ===
[id] workstream_id    state       blocked by / merge order
[1]  ws-auth           completed   ✓ merged
[2]  ws-api            running     ✓ ready
[3]  ws-frontend       queued      ✓ ready
[4]  ws-integration    blocked     waiting on: [ws-api, ws-frontend]

Commands: run <id> | done <id> | fail <id> [reason] | status | exit
>
```

### Commands

- `run <id>` — Mark workstream as running. If blocked by merge_order, warn but allow.
- `done <id>` — Mark as completed. Enforces merge_order: if prerequisites not met, prints violations and does NOT change state.
- `fail <id> [reason]` — Mark as failed with optional reason string.
- `status` — Reprint the dashboard.
- `exit` — Write execute.json and exit.

### Error Cases

- Invalid workstream id → "Unknown workstream: <id>"
- Invalid transition → "Cannot transition from <current> to <requested>"
- merge_order violation on `done` → "Cannot complete: merge_order not satisfied. Waiting on: <list>"
- No split.json found → "No split.json found. Run 'forge split' first."

### On Exit

Call `writeExecuteArtifact()` to write `.forge/execute.json`.

## Acceptance

- CLI displays workstreams with their merge_order constraints
- State transitions are validated against the state machine
- merge_order violations on `done` are blocked with clear error messages
- Dashboard updates after each command
- `execute.json` is written on exit
