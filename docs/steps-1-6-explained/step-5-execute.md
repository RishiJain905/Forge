# Step 5: Execute

## Overview

The **Execute** step is the implementation engine of the Forge CLI workflow. It consumes the split plan produced in Step 4 and drives each workstream through a structured lifecycle: preparing bounded context, invoking the AI pipeline, applying generated changes, and tracking state. Execute respects merge ordering so that dependent workstreams are completed before dependents are unblocked, supports both interactive and fully automated modes, and produces a persistent execution report and state file for handoff to Step 6 (Integrate).

## What Execute Does

- **Reads** `.forge/split.json` — the workstream plan and merge order produced by Step 4.
- **Tracks** every workstream through a discrete state machine (`queued` → `blocked` → `in_progress` → `completed` / `failed` / `cancelled`).
- **Respects merge ordering** — workstreams with unresolved dependencies remain `blocked` until all predecessors are `completed`.
- **Builds bounded context** for each in-progress workstream so the AI pipeline receives only the relevant files and instructions.
- **Runs the AI pipeline** per workstream: prompt builder → model connector → apply → state transition.
- **Supports `--auto`** to auto-execute all currently unblocked workstreams in merge order without prompting.
- **Supports `FORGE_EXECUTE_AUTO=1`** environment variable as an alternative to the `--auto` flag.
- **Supports `--resume`** to continue execution from an existing `.forge/execute.json` state file, skipping already-completed workstreams.
- **Outputs**:
  - `.forge/execute.json` — live execution state (updated after every transition).
  - `.forge/execute-report.md` — human-readable markdown report summarizing all workstream outcomes.
- **Hands off** to Step 6 (Integrate) once every workstream is terminal (`completed`, `failed`, or `cancelled`).

## Flowchart

```mermaid
flowchart TD
    A[Start Execute] --> B{--resume?}
    B -- Yes --> C[Load existing .forge/execute.json]
    B -- No --> D[Load .forge/split.json]
    C --> E[Filter completed workstreams]
    D --> F[Initialize execute.json with queued states]
    E --> G[Determine next unblocked workstream by merge order]
    F --> G
    G --> H{Unblocked workstream?}
    H -- Yes --> I[Build bounded context]
    H -- No --> J{All terminal?}
    J -- Yes --> K[Generate .forge/execute-report.md]
    J -- No --> L[Mark blocked workstreams]
    L --> M[Wait / Prompt user]
    M --> G
    I --> N[AI Pipeline: prompt → model → apply]
    N --> O{Apply succeeded?}
    O -- Yes --> P[Update state: completed]
    O -- No --> Q[Update state: failed]
    P --> R[Write execute.json]
    Q --> R
    R --> S{--auto or FORGE_EXECUTE_AUTO=1?}
    S -- Yes --> G
    S -- No --> T[Prompt: continue next?]
    T --> G
    K --> U[Handoff to Step 6: Integrate]
```

## Workstream State Machine

```mermaid
stateDiagram-v2
    [*] --> queued: Initialize from split.json

    queued --> blocked: Dependencies not yet completed
    queued --> in_progress: No uncompleted dependencies, execution starts

    blocked --> in_progress: All predecessor workstreams completed
    blocked --> cancelled: User cancels in interactive session

    in_progress --> completed: AI pipeline succeeds, changes applied
    in_progress --> failed: AI pipeline errors or apply rejected
    in_progress --> cancelled: User interrupts

    completed --> [*]: Terminal state
    failed --> [*]: Terminal state
    cancelled --> [*]: Terminal state

    failed --> queued: Interactive / tooling resets workstream to queued
    cancelled --> queued: Interactive / tooling resets workstream to queued
```

## AI Integration Pipeline

```mermaid
flowchart LR
    A[Workstream State: in_progress] --> B[Bounded Context Builder]
    B --> C[Prompt Builder]
    C --> D[Model Connector]
    D --> E[Raw Model Output]
    E --> F[Apply Engine]
    F --> G{Apply OK?}
    G -- Yes --> H[State: completed]
    G -- No --> I[State: failed]
    H --> J[Write execute.json]
    I --> J
    J --> K[Emit execution event]
```

## Parallel Execution in Merge Order

```mermaid
flowchart TD
    subgraph "Merge Order Group 1"
        A1[Workstream A: queued] --> A2[Workstream A: in_progress]
        A2 --> A3[Workstream A: completed]
        B1[Workstream B: queued] --> B2[Workstream B: in_progress]
        B2 --> B3[Workstream B: completed]
    end

    subgraph "Merge Order Group 2"
        C1[Workstream C: blocked] --> C2{Group 1 all completed?}
        C2 -- Yes --> C3[Workstream C: in_progress]
        C3 --> C4[Workstream C: completed]
        D1[Workstream D: blocked] --> D2{Group 1 all completed?}
        D2 -- Yes --> D3[Workstream D: in_progress]
        D3 --> D4[Workstream D: completed]
    end

    subgraph "Merge Order Group 3"
        E1[Workstream E: blocked] --> E2{Group 2 all completed?}
        E2 -- Yes --> E3[Workstream E: in_progress]
        E3 --> E4[Workstream E: completed]
    end

    A3 --> C2
    B3 --> C2
    C4 --> E2
    D4 --> E2
```

> **Note:** Within each merge-order group, eligible workstreams can execute concurrently. Dependent groups wait until **all** workstreams in the preceding group reach a terminal state before any downstream workstream is unblocked.

## Handoff to Step 6

After all workstreams are terminal, Execute finalizes its outputs and signals readiness for Step 6 (Integrate):

1. **Final state validation** — verifies no workstream remains in `queued`, `blocked`, or `in_progress`.
2. **Report generation** — writes `.forge/execute-report.md` summarizing:
   - Total workstreams
   - Completed count
   - Failed count
   - Cancelled count
   - Per-workstream summary with file changes and error logs
3. **State file freeze** — `.forge/execute.json` is written with a `ready_for_integrate: true` flag.
4. **Integrate reads** `.forge/execute.json` and `.forge/execute-report.md` alongside other artifacts for the integration gate.

## CLI Examples

### Basic execution (interactive)
```bash
forge execute
```
Prompts for each unblocked workstream in merge order.

### Auto-execute all unblocked workstreams
```bash
forge execute --auto
```
Equivalent to:
```bash
FORGE_EXECUTE_AUTO=1 forge execute
```

### Resume from previous execution state
```bash
forge execute --resume
```
Skips already-completed workstreams and continues from where execution left off.

### Start fresh (discard prior execute state)
```bash
forge execute --force
```
Re-initializes execution from `split.json` even when `.forge/execute.json` already exists.

State transitions such as retrying a failed workstream or cancelling one are handled in the **interactive execute session** (not via `--retry` / `--cancel` CLI flags). Use `forge execute --help` for the current flag list.

