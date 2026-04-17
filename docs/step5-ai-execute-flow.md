# Forge Step 5 — AI-Powered Execute Flow

> This document describes the V1 AI-powered execution flow for Forge Step 5 (`forge execute`).
> Generated from the Step 5 Batch 3 specification.

---

## Overview

Step 5 is the execution engine of the Forge pipeline. After `forge split` partitions the work into workstreams, Step 5 executes each one using an AI model. The state machine enforces merge order — ensuring workstreams run in the correct sequence — while an AI model does the actual code implementation.

---

## High-Level Flow

```mermaid
flowchart TB
    subgraph INIT["1. INITIALIZE"]
        A1([forge execute CLI])
        A2{Read split.json}
        A3{Validate Artifact}
        A4[Create Execute State<br/>queued + merge_order map]
        A1 --> A2 --> A3 --> A4
    end

    subgraph SELECT["2. SELECT WORKSTREAM"]
        B1{Find Unblocked<br/>Workstreams}
        B2{Any<br/>Unblocked?}
        B3[Select Next<br/>workstream]
        B4(["All Terminal<br/>State Reached"])
        B1 --> B2
        B2 -->|YES| B3
        B3 -->|state → running| B1
        B2 -->|NO| B4
    end

    subgraph AI_EXEC["3. AI EXECUTION PHASE"]
        direction LR
        C1[/"3a. BUILD PROMPT<br/>workstream desc + file contents<br/>plan context + verify constraints<br/>merge order + carried concerns"/]
        C2[/"3b. CALL AI MODEL<br/>user-provided cloud model<br/>gpt-5.4 / claude-Opus-4.7 / GLM-5.1<br/>returns code changes"/]
        C3[/"3c. APPLY CHANGES<br/>write files to disk<br/>track: path, hash, lines"/]
        C4[/"3d. VERIFY<br/>typecheck / lint<br/>optional per-workstream"/]
        C1 --> C2 --> C3 --> C4
    end

    subgraph TRANSITION["4. STATE TRANSITION"]
        D1{Merge Order<br/>Prereqs Met?}
        D2[COMPLETED<br/>+ merged]
        D3[QUEUED<br/>re-queue]
        D4[FAILED<br/>AI error or<br/>verify failure]
        D1 -->|YES + success| D2
        D1 -->|NO| D3
        C4 -->|error| D4
    end

    subgraph WRITE["5. WRITE ARTIFACT"]
        E1[execute.json<br/>workstreams + transitions<br/>changes_made + ai_model_used<br/>ai_prompt_hash]
        E2[execute-report.md<br/>human-readable summary]
    end

    INIT --> SELECT
    SELECT --> AI_EXEC
    AI_EXEC --> TRANSITION
    TRANSITION -->|loop back| SELECT
    TRANSITION -->|all terminal| WRITE

    style INIT fill:#1a1a2e,stroke:#4cc9f0,color:#ffffff
    style SELECT fill:#1a1a2e,stroke:#4cc9f0,color:#ffffff
    style AI_EXEC fill:#16213e,stroke:#7b2cbf,color:#ffffff
    style TRANSITION fill:#1a1a2e,stroke:#e63946,color:#ffffff
    style WRITE fill:#0f3460,stroke:#06d6a0,color:#ffffff
```

---

## State Machine

The state machine drives all workstream transitions. It is **unchanged from Batch 1/2** — the AI execution happens inside the `running` state.

```mermaid
stateDiagram-v2
    [*] --> Queued

    Queued --> Running : prereqs satisfied
    Queued --> Blocked : prereqs NOT met
    Blocked --> Running : prereqs satisfied

    Running --> Completed : success + merge_order satisfied
    Running --> Failed : AI error / verification failure

    Completed --> [*] : merged into repo
    Failed --> Running : retry

    note right of Running
        AI executes inside running state:
        1. Build prompt (workstream context)
        2. Call cloud AI model
        3. Apply changes to disk
        4. Verify (optional)
    end note

    note right of Queued
        Waiting on merge_order
        prerequisites from
        split.json
    end note
```

### State Definitions

| State | Meaning |
|-------|---------|
| `queued` | Waiting for merge_order prerequisites to complete |
| `running` | AI is actively implementing this workstream |
| `completed` | AI succeeded, merge_order satisfied, merged into repo |
| `failed` | AI execution failed or verification failed |
| `blocked` | Permanently blocked by upstream (merge_order cannot be satisfied) |

---

## AI Execution Details

### What Feeds the AI Prompt

```mermaid
flowchart LR
    subgraph INPUTS["AI Prompt Inputs"]
        W["Workstream Description<br/>title + description + category"]
        F["Target Files<br/>likelyAffectedPaths contents"]
        P["Plan Context<br/>requirement → file mapping"]
        V["Verify Constraints<br/>conflict zones + safety rules"]
        M["Merge Order<br/>what must complete first"]
        C["Carried Concerns<br/>from plan + verify"]
    end

    subgraph PROMPT["Constructed Prompt"]
        direction TB
        P1["System Role<br/>skilled software engineer"]
        P2["Workstream Section<br/>title, description, category"]
        P3["Prerequisites Section<br/>merge_order prereqs with descriptions"]
        P4["Constraints Section<br/>conflict zones, findings, carried concerns"]
        P5["Target Files Section<br/>current file contents (read-only)"]
        P6["Task + Output Format<br/>make changes, return JSON"]
    end

    subgraph OUTPUT["AI Output"]
        O1["JSON: changes array"]
        O2["file, action, content"]
        O3["Applied to disk"]
    end

    INPUTS --> PROMPT
    PROMPT --> OUTPUT

    style INPUTS fill:#1a1a2e,stroke:#4cc9f0,color:#ffffff
    style PROMPT fill:#16213e,stroke:#7b2cbf,color:#ffffff
    style OUTPUT fill:#0f3460,stroke:#06d6a0,color:#ffffff
```

### Per-Workstream Prompt Structure

```
# SYSTEM ROLE
You are a skilled software engineer implementing changes to a codebase.

# WORKSTREAM DESCRIPTION
Title: {title}
Description: {description}
Category: {category}

# MERGE ORDER PREREQUISITES
Before this workstream runs, the following must be completed:
- {prereq_1_title}: {prereq_1_description}
- {prereq_2_title}: {prereq_2_description}

# IMPLEMENTATION CONSTRAINTS (from Verify step)
CRITICAL:
- {constraint_1}
- {constraint_2}

# CARRIED-FORWARD CONCERNS
- {concern_1}

# TARGET FILES (read-only — current contents)
FILE: {path_1}
---
{current_contents}
---

# YOUR TASK
Make the necessary changes to the target files above.

# OUTPUT FORMAT
Return a JSON array of changes:
```json
[
  {"file": "path", "action": "create|modify|delete", "content": "..."}
]
```
```

---

## Merge Order Enforcement

Merge order is the backbone of safe sequential execution. A workstream cannot transition to `completed` until ALL of its prerequisites are in the `merged set` (i.e., they have already transitioned to `completed`).

```mermaid
flowchart LR
    A["Workstream A"] -->|"must complete first"| B["Workstream B"]
    B -->|"must complete first"| C["Workstream C"]

    style A fill:#0f3460,stroke:#06d6a0,color:#ffffff
    style B fill:#0f3460,stroke:#06d6a0,color:#ffffff
    style C fill:#0f3460,stroke:#06d6a0,color:#ffffff

    note right of A
        state: completed
        in merged set: YES
    end note

    note right of B
        state: completed
        in merged set: YES
    end note

    note right of C
        state: running
        waits for B in merged set
    end note
```

### Merge Order Rules

1. A workstream in `queued` can only transition to `running` when ALL its `mergeOrderRequirements` are in the `merged set`
2. A workstream in `running` can only transition to `completed` when ALL its `mergeOrderRequirements` are in the `merged set`
3. The `merged set` only grows — a workstream once `completed` never leaves it
4. `failed` workstreams are NOT in the merged set and block their dependents

---

## Model Provider Configuration

Users provide their own AI model. Forge reads configuration from environment variables:

```mermaid
flowchart TB
    E["Environment Variables"] --> C

    subgraph C["Model Config"]
        P["FORGE_MODEL_PROVIDER<br/>openai | anthropic | google<br/>ollama | glm"]
        N["FORGE_MODEL_NAME<br/>gpt-4o | claude-4 | gemini-2.5"]
        K["FORGE_MODEL_API_KEY<br/>optional (ollama needs none)"]
        B["FORGE_MODEL_BASE_URL<br/>optional, for proxies"]
    end

    subgraph PROVIDERS["Supported Providers"]
        O["OpenAI<br/>GPT-4o, GPT-4.5"]
        A["Anthropic<br/>Claude 4, Claude 3.7"]
        G["Google<br/>Gemini 2.5"]
        L["Ollama (local)<br/>qwen3.5, mistral, etc."]
        Z["Zhipu AI (GLM)<br/>GLM-4, GLM-4V"]
    end

    C --> PROVIDERS

    style E fill:#1a1a2e,stroke:#4cc9f0,color:#ffffff
    style C fill:#16213e,stroke:#7b2cbf,color:#ffffff
    style PROVIDERS fill:#0f3460,stroke:#06d6a0,color:#ffffff
```

---

## execute.json Artifact

The final artifact records everything: workstream states, AI model calls, and file changes.

```mermaid
flowchart TB
    subgraph ARTIFACT["execute.json"]
        M["schemaVersion + forgeVersion"]
        S["splitSource (path to split.json)"]
        W["workstreams[]<br/>id, title, state<br/>ai_model_used<br/>ai_prompt_hash<br/>changes_made[]"]
        G["mergeOrderGates[]<br/>prerequisites<br/>prerequisitesMet"]
        T["transitions[]<br/>full audit log"]
        SM["summary<br/>total, queued, running<br/>completed, failed<br/>aiExecutedCount<br/>totalChangesMade"]
        CF["aiConfig<br/>provider, modelName<br/>baseUrl"]
    end

    subgraph CHANGES_MADE["changes_made[] per workstream"]
        F["file: absolute path"]
        A["action: create | modify | delete"]
        DH["diffHash: SHA-256 of diff"]
        LA["linesAdded"]
        LR["linesRemoved"]
        BH["beforeHash: SHA-256 before"]
        AH["afterHash: SHA-256 after"]
    end

    W --> CHANGES_MADE

    style ARTIFACT fill:#1a1a2e,stroke:#4cc9f0,color:#ffffff
    style CHANGES_MADE fill:#16213e,stroke:#7b2cbf,color:#ffffff
```

---

## CLI Interaction

### Interactive Mode (default)

```
$ forge execute

=== Workstream Status ===
[1] ws-add-auth         queued    waiting on: []
[2] ws-api-middleware   queued    waiting on: [ws-add-auth]
[3] ws-integration      queued    waiting on: [ws-api-middleware]

Commands: run <id> | done <id> | fail <id> [reason] | status | exit

> run 1
[AI] Calling gpt-4o for: ws-add-auth...
[AI] Modifying: src/auth.ts (+42 lines)
[AI] Creating: src/auth.test.ts (+38 lines)
✓ ws-add-auth COMPLETED — 2 files, +80 lines

> run 2
[AI] Calling gpt-4o for: ws-api-middleware...
[AI] Modifying: src/api/middleware.ts (+67 lines)
✓ ws-api-middleware COMPLETED — 1 file, +67 lines

> run 3
[AI] Calling gpt-4o for: ws-integration...
✓ ws-integration COMPLETED — 3 files, +120 lines
```

### Auto Mode

```
$ FORGE_EXECUTE_AUTO=1 forge execute
[AI] Auto-executing 3 unblocked workstreams...

[AI] ws-add-auth (1/3)...
✓ ws-add-auth COMPLETED — 2 files, +80 lines

[AI] ws-api-middleware (2/3)...
✓ ws-api-middleware COMPLETED — 1 file, +67 lines

[AI] ws-integration (3/3)...
✓ ws-integration COMPLETED — 3 files, +120 lines

All workstreams complete. Artifact written to .forge/execute.json
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FORGE_MODEL_PROVIDER` | **Yes** | `openai`, `anthropic`, `google`, `ollama`, `glm` |
| `FORGE_MODEL_NAME` | **Yes** | Model name (e.g., `gpt-4o`, `claude-3-5-sonnet-4`) |
| `FORGE_MODEL_API_KEY` | No | API key (not needed for Ollama) |
| `FORGE_MODEL_BASE_URL` | No | Proxy or self-hosted endpoint |
| `FORGE_EXECUTE_AUTO` | No | Set to `1` to auto-execute all unblocked workstreams |

---

## Step 5 vs Step 6 Responsibility

```mermaid
flowchart LR
    subgraph S5["Step 5: Execute"]
        W1["Workstream 1"]
        W2["Workstream 2"]
        W3["Workstream N"]
        AI1["AI implements<br/>individual workstreams"]
        CH["Writes code<br/>to disk"]
        AI1 --> CH
    end

    subgraph S6["Step 6: Integrate"]
        ALL["All executed<br/>workstreams"]
        AIT["AI generates +<br/>runs integration tests"]
        VERIFY["Verifies the<br/>whole works"]
    end

    S5 --> S6
    W1 & W2 & W3 --> ALL
    ALL --> AIT --> VERIFY

    style S5 fill:#16213e,stroke:#7b2cbf,color:#ffffff
    style S6 fill:#0f3460,stroke:#06d6a0,color:#ffffff
```

| Step | What it does |
|------|-------------|
| **Step 5** | AI implements each workstream — makes actual code changes per workstream |
| **Step 6** | AI runs integration tests against the whole — verifies everything works together |

---

## V1 Scope vs V2 Future

### V1 (This Implementation)
- Single AI model execution, one workstream at a time
- Merge order strictly enforced (serial execution)
- User provides any OpenAI-compatible model
- No streaming output, no agentic loops, no tool use
- State machine drives all transitions

### V2 (Future Ideas)
- Multi-agent orchestration: parallel AI workstream execution
- Agent adapter plugin system (users provide their own agent adapters)
- Streaming output display during AI execution
- Multi-turn AI dialogue with tool use
- Model management (switch models mid-pipeline)

> See `future_idea_implementation/multi-agent-orchestration.md` for the V2 vision.
