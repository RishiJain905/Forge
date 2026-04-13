# Multi-Agent Execution Orchestration

## Problem Statement

Forge produces beautifully structured workstreams in Step 4 but **stops there**. The split artifact contains everything needed to execute work in parallel — workstream definitions, merge order constraints, dependency graphs, blocked states — but there's no built-in mechanism to actually dispatch those workstreams to agents, track their state, enforce constraints, and collect results.

The current pipeline:

```
forge intake → forge plan → forge verify → forge split → [HUMAN OR EXTERNAL SCRIPT PICKS UP split.json]
```

Steps 1-4 are deterministic, reproducible, and testable. Step 5 (execute) doesn't exist yet. Everything downstream of split.json is manual coordination.

This creates a critical gap: **Forge's rigor stops at the moment where coordination matters most.**

## What We Need

A `forge execute` step that:

1. **Reads the split artifact** — workstreams, categories, merge orders, constraints
2. **Maintains workstream state** — queued, running, completed, failed, blocked
3. **Dispatches to agents** — Any model with an API key (Anthropic, OpenAI, Minimax, GLM, etc.) or any ACP-capable CLI agent (Claude Code, Codex)
4. **Enforces merge order as a gate** — downstream workstreams don't start until their prerequisites merge
5. **Handles concurrent execution** — multiple safe_parallel workstreams run simultaneously
6. **Tracks handoffs** — what got passed from one workstream to the next
7. **Produces an execution artifact** — per-workstream results for Step 6 to consume
8. **Handles failure gracefully** — retries, rollbacks, or explicit surfacing before proceeding

## Architecture

### Core Components

```
forge execute
├── orchestrator/          # Workstream queue, state machine, dependency engine
│   ├── queue.ts           # Manages workstream queue with priority/depth ordering
│   ├── state.ts           # Tracks running/complete/failed per workstream
│   ├── dispatcher.ts      # Dispatches to agent processes
│   ├── constraint-engine.ts  # Enforces merge_order and blocking conditions
│   └── handoff.ts         # Manages data passed between workstreams
├── agents/                # Agent adapter layer
│   ├── types.ts           # Unified agent interface
│   ├── api-adapters/      # Direct API adapters (no CLI needed)
│   │   ├── anthropic.ts   # Anthropic API adapter
│   │   ├── openai.ts      # OpenAI API adapter
│   │   ├── minimax.ts     # Minimax API adapter
│   │   ├── google.ts      # Google AI API adapter
│   │   └── openai-compatible.ts  # For local/custom endpoints
│   ├── cli-adapters/      # CLI-based adapters (optional)
│   │   ├── claude-code.ts # Claude Code CLI adapter
│   │   └── codex.ts       # OpenAI Codex CLI adapter
│   └── custom.ts          # Custom agent adapter (user-defined)
├── config/                # Agent configuration management
│   ├── setup.ts           # First-run setup flow
│   ├── store.ts           # Encrypted API key storage
│   └── registry.ts        # Agent registration/discovery
├── execution-artifact.ts  # Writes execution.json artifact
├── report.ts              # Human-readable execution report
└── types.ts               # Step 5 type definitions
```

---

## First-Run Agent Setup

When `forge execute` is run for the first time in a repository, Forge detects that no agent has been configured and prompts the user through an interactive setup flow.

### Setup Flow

```
$ forge execute
Welcome to Forge Execute! Let's set up your agent.

Select a model provider:
  [1] Anthropic (Claude)
  [2] OpenAI (GPT-4o)
  [3] Google (Gemini)
  [4] Minimax
  [5] Zhipu AI (GLM)
  [6] OpenAI-Compatible (local models, custom endpoints)

> 4

Selected: Minimax

Enter your Minimax API key:
> eyJhbGc...

✓ API key received

Config saved to .forge/config.json
Starting execution...
```

### Config File Location

`.forge/config.json` — stored in the repository root, gitignored by default.

### Config Structure

```json
{
  "schemaVersion": "1.0",
  "forgeVersion": "1.x.x",
  "activeModelIndex": 0,
  "models": [
    {
      "model": "glm-5.1",
      "id": "custom:GLM-5.1-[z.ai]-0",
      "index": 0,
      "baseUrl": "https://api.z.ai/api/anthropic",
      "apiKey": "API-KEY-HERE",
      "maxOutputTokens": 131072,
      "provider": "anthropic"
    },
    {
      "model": "MiniMax-Text-01",
      "id": "custom:Minimax-Text-01-[minimax.io]-1",
      "index": 1,
      "baseUrl": "https://api.minimax.chat/v1",
      "apiKey": "API-KEY-HERE",
      "maxOutputTokens": 8192,
      "provider": "openai"
    }
  ]
}
```

**Note:** Each model entry contains the `baseUrl` and `apiKey` directly. Forge reads from this list at runtime — no environment variable references needed. The `activeModelIndex` points to which model is currently selected for execution. Users can add multiple models to the `models` array and switch between them via CLI flags or the `--setup` flow.

### Model Entry Fields

| Field | Description |
|-------|-------------|
| `model` | Display name of the model (e.g., "glm-5.1", "MiniMax-Text-01") |
| `id` | Unique identifier in format `custom:<model>-[<provider>]-<index>` |
| `index` | Numeric index within the models array |
| `baseUrl` | API endpoint URL — supports Anthropic-compatible endpoints, OpenAI-compatible endpoints |
| `apiKey` | API key for authentication |
| `maxOutputTokens` | Maximum tokens in model's response |
| `provider` | Provider type — "anthropic" or "openai" (determines which adapter to use) |

### Supported Providers and Models

| Provider | Provider Type | Default Model | Notes |
|----------|--------------|---------------|-------|
| Anthropic | `anthropic` | `claude-opus-4-6` | Uses Messages API |
| OpenAI | `openai` | `gpt-4o` | Uses Chat Completions API |
| Minimax | `openai` | `MiniMax-Text-01` | Via MiniMax API (OpenAI-compatible) |
| Google | `anthropic` | `gemini-2.0-flash` | Via Google AI API |
| GLM (Zhipu) | `anthropic` | `glm-4` | Via Zhipu AI API (Anthropic-compatible) |
| OpenAI-Compatible | `openai` | — | Custom endpoint URL required |

### Setup Detection

```typescript
// src/execute/config/setup.ts
export async function requireAgentConfig(repoRoot: string): Promise<AgentConfig> {
  const configPath = path.join(repoRoot, ".forge", "config.json");
  
  if (await fileExists(configPath)) {
    const config = await readJson(configPath);
    if (config.models?.length > 0) {
      return loadAgentConfig(config);
    }
  }
  
  // No config found — run interactive setup
  return interactiveSetup(repoRoot);
}
```

### Changing the Agent

To change the configured agent later:

```bash
# Re-run setup to add/remove models
forge execute --setup

# Use a specific model by index
forge execute --model-index 1

# Use a specific model by ID
forge execute --model-id custom:Minimax-Text-01-[minimax.io]-1
```

---

## API Adapter Layer

The API adapter layer lets Forge dispatch workstreams directly to model providers via their HTTP APIs — no CLI tools required.

### Adapter Interface

```typescript
// src/execute/agents/types.ts
export interface AgentAdapter {
  name: string;
  supports: readonly string[];  // ["anthropic", "openai", "minimax", ...]

  // Dispatch an agent to execute a workstream
  dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult>;

  // Check if a dispatch is still running
  pollStatus(dispatchId: string): Promise<AgentStatus>;

  // Signal the agent to stop (if needed)
  cancel(dispatchId: string): Promise<void>;
}

export interface DispatchResult {
  dispatchId: string;
  agentType: string;
  state: "running" | "completed" | "failed";
  result?: WorkstreamExecutionResult;
  error?: string;
}

export interface AgentStatus {
  state: "running" | "completed" | "failed";
  result?: WorkstreamExecutionResult;
  error?: string;
}

export interface WorkstreamExecutionResult {
  status: "success" | "partial" | "failed";
  artifacts: WorkstreamArtifact[];
  summary: string;
  handoffs: Handoff[];
}

export interface WorkstreamExecutionContext {
  workstreamId: string;
  planItemIds: string[];
  taskSpec: NormalizedTaskSpec;
  repoRoot: string;
  outputRoot: string;
  
  // Files that this workstream should receive from upstream workstreams
  handoffs: HandoffSpec[];
  
  // Constraints that must be honored before merge
  constraints: string[];
  
  // Merge order — which workstream IDs must complete before this one merges
  mergeOrderAfter: string[];
  
  // Paths that this workstream should NOT touch (from conflict zones)
  forbiddenPaths: string[];
  
  // Paths that this workstream shares with others (requires coordination)
  sharedPaths: SharedPathSpec[];
}

export interface HandoffSpec {
  fromWorkstreamId: string;
  toWorkstreamId: string;
  artifacts: string[];  // file paths that must be handed off
  validation?: {
    schemaPath: string;
    validateFn: string;  // e.g., "validateIntakeArtifact"
  };
}

export interface SharedPathSpec {
  path: string;
  strategy: "first_writer_wins" | "merge_required" | "read_only" | "serialized";
  riskLevel: "low" | "medium" | "high";
}
```

---

## API Adapter Implementations

### Anthropic-Compatible Adapter

```typescript
// src/execute/agents/api-adapters/anthropic.ts
export const anthropicAdapter: AgentAdapter = {
  name: "Anthropic-Compatible",
  supports: ["anthropic"],

  async dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult> {
    const { workstreamId, context, agentConfig } = params;
    const modelEntry = getModelEntry(agentConfig);

    const prompt = buildExecutionPrompt(workstreamId, context);
    const promptPath = `${context.outputRoot}/workstreams/${workstreamId}/prompt.md`;
    await writeFile(promptPath, prompt);

    const systemPrompt = `You are a code execution agent for Forge.
Your job: execute the workstream described in the attached prompt file.
When complete, write your results to ${context.outputRoot}/workstreams/${workstreamId}/result.json
Use the forbiddenPaths and sharedPaths from the prompt to coordinate with other workstreams.`;

    try {
      const response = await fetch(`${modelEntry.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": modelEntry.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelEntry.model,
          max_tokens: modelEntry.maxOutputTokens ?? 8192,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Execute this workstream:\n\n${readFile(promptPath, "utf-8")}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      return {
        dispatchId: `anthropic-${workstreamId}-${Date.now()}`,
        agentType: "anthropic",
        state: "completed",
        result: parseAgentResponse(result, context),
      };
    } catch (error) {
      return {
        dispatchId: `anthropic-${workstreamId}-${Date.now()}`,
        agentType: "anthropic",
        state: "failed",
        error: error.message,
      };
    }
  },

  async pollStatus(dispatchId: string): Promise<AgentStatus> {
    // API calls are synchronous — always completed or failed
    return { state: "unknown" };
  },

  async cancel(dispatchId: string): Promise<void> {
    // Cannot cancel a completed API call
  },
};
```

### OpenAI-Compatible Adapter

```typescript
// src/execute/agents/api-adapters/openai.ts
export const openaiAdapter: AgentAdapter = {
  name: "OpenAI-Compatible",
  supports: ["openai"],

  async dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult> {
    const { workstreamId, context, agentConfig } = params;
    const modelEntry = getModelEntry(agentConfig);

    const prompt = buildExecutionPrompt(workstreamId, context);
    const promptPath = `${context.outputRoot}/workstreams/${workstreamId}/prompt.md`;
    await writeFile(promptPath, prompt);

    const systemPrompt = `You are a code execution agent for Forge.
Execute the workstream described in the attached prompt file.
When complete, write your results to ${context.outputRoot}/workstreams/${workstreamId}/result.json
Use forbiddenPaths and sharedPaths to coordinate with other workstreams.`;

    try {
      const response = await fetch(`${modelEntry.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${modelEntry.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelEntry.model,
          max_tokens: modelEntry.maxOutputTokens ?? 8192,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Execute this workstream:\n\n${readFile(promptPath, "utf-8")}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      return {
        dispatchId: `openai-${workstreamId}-${Date.now()}`,
        agentType: "openai",
        state: "completed",
        result: parseAgentResponse(result, context),
      };
    } catch (error) {
      return {
        dispatchId: `openai-${workstreamId}-${Date.now()}`,
        agentType: "openai",
        state: "failed",
        error: error.message,
      };
    }
  },

  async pollStatus(dispatchId: string): Promise<AgentStatus> {
    return { state: "unknown" };
  },

  async cancel(dispatchId: string): Promise<void> {
    // Cannot cancel
  },
};
```

---

## Workstream State Machine

```
                ┌─────────────────────────────────────┐
                │                                     │
                ▼                                     │
  QUEUED ──────► RUNNING ──────► COMPLETED            │
                │   │             │                   │
                │   │             ▼                   │
                │   │           MERGED ───────────────┼──► (Step 6)
                │   │                                 │
                │   │             ▼                   │
                │   └─────► FAILED ──► RETRYABLE      │
                │                        │             │
                │                        ▼             │
                │                      RETRY ─────────┘
                │                        │
                │                        ▼
                └─────► BLOCKED ─────────┘
                         (waiting on merge_order)
```

---

## Constraint Engine

The constraint engine is the gatekeeper that prevents invalid parallel execution:

```typescript
// src/execute/orchestrator/constraint-engine.ts
export class ConstraintEngine {
  private completedWorkstreams: Set<string> = new Set();
  private mergedWorkstreams: Set<string> = new Set();

  canDispatch(workstream: SplitWorkstream): DispatchDecision {
    // Check 1: Is this workstream blocked by upstream failure?
    if (this.isBlockedByFailure(workstream)) {
      return {
        allowed: false,
        reason: `Blocked by failed workstream: ${this.getBlockingWorkstream(workstream)}`,
        blockingType: "upstream_failure",
      };
    }

    // Check 2: Have all merge_order prerequisites completed?
    const pendingPrerequisites = workstream.mergeOrderAfter.filter(
      (id) => !this.mergedWorkstreams.has(id)
    );
    if (pendingPrerequisites.length > 0) {
      return {
        allowed: false,
        reason: `Waiting for merge of: ${pendingPrerequisites.join(", ")}`,
        blockingType: "merge_order",
        pendingPrerequisites,
      };
    }

    // Check 3: Is this workstream blocked by a failed verification case?
    if (workstream.blockedReason) {
      return {
        allowed: false,
        reason: `Blocked by verification failure: ${workstream.blockedReason}`,
        blockingType: "verification_blocked",
      };
    }

    return { allowed: true };
  }

  markMerged(workstreamId: string): void {
    this.mergedWorkstreams.add(workstreamId);
  }

  getReadyWorkstreams(
    workstreams: SplitWorkstream[],
    category: "safe_parallel" | "serial" | "protected_merge"
  ): SplitWorkstream[] {
    return workstreams.filter((ws) => {
      if (ws.category !== category) return false;
      return this.canDispatch(ws).allowed;
    });
  }
}
```

---

## Agent Dispatcher

```typescript
// src/execute/orchestrator/dispatcher.ts
export class AgentDispatcher {
  private activeDispatches: Map<string, DispatchResult> = new Map();
  private agentAdapters: Map<string, AgentAdapter> = new Map();

  constructor(
    private config: ExecuteConfig,
    private constraintEngine: ConstraintEngine
  ) {
    this.registerDefaultAdapters();
  }

  async dispatch(
    workstream: SplitWorkstream,
    context: WorkstreamExecutionContext,
    agentConfig: AgentConfig
  ): Promise<DispatchResult> {
    const adapter = this.agentAdapters.get(agentConfig.type);
    if (!adapter) {
      throw new Error(`No adapter for agent type: ${agentConfig.type}`);
    }

    const prompt = this.buildExecutionPrompt(workstream, context);

    const dispatchResult = await adapter.dispatch({
      workstreamId: workstream.id,
      context,
      agentConfig,
    });

    this.activeDispatches.set(workstream.id, dispatchResult);
    return dispatchResult;
  }

  private buildExecutionPrompt(
    workstream: SplitWorkstream,
    context: WorkstreamExecutionContext
  ): string {
    const planItems = context.planItemIds
      .map((id) => context.taskSpec.plan_items?.find((pi) => pi.id === id))
      .filter(Boolean);

    return `You are executing workstream "${workstream.id}" from Forge.

GOAL:
${context.taskSpec.goal}

PLAN ITEMS FOR THIS WORKSTREAM:
${planItems.map((pi) => `
## ${pi.title}
${pi.description}
- Category: ${pi.category}
- Risk: ${pi.riskLevel}
- Parallelization: ${pi.parallelization.signal}
`).join("\n---\n")}

CONSTRAINTS (must honor these):
${context.constraints.map((c) => `- ${c}`).join("\n")}

FORBIDDEN PATHS (do not touch these — managed by other workstreams):
${context.forbiddenPaths.map((p) => `- ${p}`).join("\n")}

SHARED PATHS (coordinate with other workstreams):
${context.sharedPaths.map((sp) => 
  `- ${sp.path}: ${sp.strategy} (risk: ${sp.riskLevel})`
).join("\n")}

MERGE ORDER: After the following workstreams have merged, you may merge:
${context.mergeOrderAfter.join(", ") || "(none — this is a root workstream)"}

OUTPUT: When complete, write your results to:
${context.outputRoot}/workstreams/${workstream.id}/result.json

The result.json must contain:
- status: "success" | "partial" | "failed"
- artifacts: file paths you created or modified
- summary: what was accomplished
- handoffs: artifacts to pass to dependent workstreams
`;
  }

  async pollAll(): Promise<Map<string, AgentStatus>> {
    const statuses = new Map<string, AgentStatus>();
    for (const [workstreamId, dispatch] of this.activeDispatches) {
      const adapter = this.agentAdapters.get(dispatch.agentType);
      if (adapter) {
        const status = await adapter.pollStatus(dispatch.dispatchId);
        statuses.set(workstreamId, status);
      }
    }
    return statuses;
  }
}
```

---

## Handoff Management

When one workstream completes and another depends on its outputs, the handoff system ensures clean transfer:

```typescript
// src/execute/orchestrator/handoff.ts
export class HandoffManager {
  private completedArtifacts: Map<string, WorkstreamArtifact[]> = new Map();

  registerCompletion(
    workstreamId: string,
    artifacts: WorkstreamArtifact[]
  ): void {
    this.completedArtifacts.set(workstreamId, artifacts);
  }

  getHandoffsFor(workstreamId: string, requiredFrom: string[]): Handoff[] {
    const handoffs: Handoff[] = [];
    
    for (const fromId of requiredFrom) {
      const artifacts = this.completedArtifacts.get(fromId);
      if (!artifacts) {
        throw new Error(
          `Workstream ${workstreamId} requires handoffs from ${fromId} ` +
          `but ${fromId} has not completed`
        );
      }
      handoffs.push({
        fromWorkstreamId: fromId,
        artifacts,
      });
    }
    
    return handoffs;
  }

  validateHandoffSchema(handoff: Handoff, validation?: HandoffSpec["validation"]): void {
    if (!validation) return;

    for (const artifact of handoff.artifacts) {
      const validated = validation.validateFn(artifact.content);
      if (!validated.valid) {
        throw new HandoffValidationError(
          `Artifact ${artifact.path} from ${handoff.fromWorkstreamId} ` +
          `failed validation: ${validated.errors.join(", ")}`
        );
      }
    }
  }
}
```

---

## Orchestrator Loop

```typescript
// src/execute/orchestrator/orchestrator.ts
export class Orchestrator {
  constructor(
    private dispatcher: AgentDispatcher,
    private constraintEngine: ConstraintEngine,
    private handoffManager: HandoffManager,
    private config: OrchestratorConfig
  ) {}

  async run(splitArtifact: SplitArtifact): Promise<ExecuteArtifact> {
    const workstreams = [...splitArtifact.workstreams];
    const results = new Map<string, WorkstreamResult>();
    const startTime = Date.now();

    // Phase 1: Identify root workstreams (no merge_order_after)
    const readyWorkstreams = workstreams.filter(
      (ws) => ws.mergeOrderAfter.length === 0
    );

    // Phase 2: Dispatch root workstreams in parallel
    await this.dispatchAll(
      readyWorkstreams.filter((ws) => ws.category === "safe_parallel"),
      "initial"
    );

    // Phase 3: Event loop — poll, resolve constraints, dispatch next wave
    while (results.size < workstreams.length) {
      const statuses = await this.dispatcher.pollAll();
      
      // Process completed workstreams
      for (const [workstreamId, status] of statuses) {
        if (status.state === "completed") {
          this.constraintEngine.markMerged(workstreamId);
          this.handoffManager.registerCompletion(workstreamId, status.artifacts);
          results.set(workstreamId, status);
          
          // Find newly unblocked workstreams
          const unblocked = this.findUnblockedWorkstreams(workstreams, results);
          await this.dispatchAll(unblocked, "unblocked");
        } else if (status.state === "failed") {
          results.set(workstreamId, status);
          // Check if failure is blocking downstream workstreams
          const affected = this.findAffectedByFailure(workstreams, workstreamId);
          for (const ws of affected) {
            results.set(ws.id, {
              state: "blocked",
              reason: `Blocked by failed workstream: ${workstreamId}`,
            });
          }
        }
      }

      if (this.allWorkstreamsDecided(results, workstreams)) {
        break;
      }

      await sleep(this.config.pollIntervalMs);
    }

    return this.buildExecuteArtifact(workstreams, results, startTime);
  }

  private async dispatchAll(
    workstreams: SplitWorkstream[],
    trigger: "initial" | "unblocked"
  ): Promise<void> {
    for (const ws of workstreams) {
      const decision = this.constraintEngine.canDispatch(ws);
      if (!decision.allowed) {
        continue; // Will be retried when constraint resolves
      }

      const context = this.buildContext(ws, trigger);
      const agentConfig = this.resolveAgentConfig(ws);

      await this.dispatcher.dispatch(ws, context, agentConfig);
    }
  }
}
```

---

## Execution Artifact

```typescript
// src/execute/execution-artifact.ts
export interface ExecuteArtifact {
  schemaVersion: string;
  command: "forge execute";
  stage: "step5";
  status: "complete" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  
  workstreamResults: Record<string, WorkstreamResult>;
  
  mergeOrderExecuted: string[];  // IDs in merge order
  blockedWorkstreams: BlockedWorkstream[];
  
  totalDispatchCount: number;
  totalSuccessCount: number;
  totalFailureCount: number;
  
  executionTimeline: ExecutionTimelineEntry[];
  
  failureSummary?: string;
}

export interface WorkstreamResult {
  workstreamId: string;
  status: "success" | "partial" | "failed" | "blocked";
  agentType: string;
  dispatchId: string;
  startedAt: string;
  finishedAt?: string;
  
  artifacts: WorkstreamArtifact[];
  summary: string;
  handoffs: Handoff[];
  
  // If failed
  failureReason?: string;
  retryable?: boolean;
  retryCount?: number;
}

export interface ExecutionTimelineEntry {
  timestamp: string;
  workstreamId: string;
  event: "dispatched" | "completed" | "failed" | "merged" | "blocked";
  details?: string;
}
```

---

## CLI Integration

```bash
# Basic execution (prompts for agent setup on first run)
forge execute

# With specific model index
forge execute --model-index 1

# With specific model ID
forge execute --model-id custom:Minimax-Text-01-[minimax.io]-1

# With max concurrency limit
forge execute --max-parallel 4

# With retry policy
forge execute --max-retries 3 --retry-backoff 10000

# Dry run — show what would execute without running
forge execute --dry-run

# Resume from a previous execution
forge execute --resume .forge/execute-2026-04-13.json

# Re-run agent setup
forge execute --setup
```

---

## Failure Handling

### Retry Logic

```typescript
// src/execute/orchestrator/retry.ts
export class RetryPolicy {
  constructor(
    private maxRetries: number = 2,
    private backoffMs: number = 5000
  ) {}

  async withRetry<T>(
    fn: () => Promise<T>,
    workstreamId: string
  ): Promise<T | RetryExhausted> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.maxRetries) {
          const backoff = this.backoffMs * Math.pow(2, attempt);
          await sleep(backoff);
        }
      }
    }
    
    return {
      state: "retry_exhausted",
      workstreamId,
      attempts: this.maxRetries + 1,
      lastError: lastError.message,
    };
  }
}
```

### Rollback on Critical Failure

```typescript
// If a critical workstream fails (e.g., core schema change)
// and dependent workstreams have already merged, initiate rollback
async initiateRollback(
  failedWorkstreamId: string,
  executionArtifact: ExecuteArtifact
): Promise<void> {
  const dependents = findDependentWorkstreams(failedWorkstreamId);
  const mergedDependents = dependents.filter(
    (d) => executionArtifact.workstreamResults[d.id]?.state === "merged"
  );

  if (mergedDependents.length > 0) {
    // Write a rollback artifact
    await writeFile(`.forge/rollback-${Date.now()}.json`, {
      triggeredBy: failedWorkstreamId,
      requiresRollback: mergedDependents.map((d) => d.id),
      artifactsToRestore: collectArtifactsToRestore(mergedDependents),
    });
    
    throw new CriticalFailureError(
      `Workstream ${failedWorkstreamId} failed critically. ` +
      `${mergedDependents.length} dependent workstreams must be rolled back.`
    );
  }
}
```

---

## Implementation Checklist

### Core Foundation
- [ ] Define Step 5 types in `src/execute/types.ts`
- [ ] Implement `ConstraintEngine` in `src/execute/orchestrator/constraint-engine.ts`
- [ ] Implement `AgentDispatcher` in `src/execute/orchestrator/dispatcher.ts`
- [ ] Implement `HandoffManager` in `src/execute/orchestrator/handoff.ts`
- [ ] Implement `Orchestrator` event loop in `src/execute/orchestrator/orchestrator.ts`

### API Adapters
- [ ] Implement `AnthropicAdapter` in `src/execute/agents/api-adapters/anthropic.ts`
- [ ] Implement `OpenAIAdapter` in `src/execute/agents/api-adapters/openai.ts`

### Agent Config & Setup
- [ ] Implement first-run setup flow in `src/execute/config/setup.ts`
- [ ] Implement model registry with `baseUrl` and `apiKey` in `src/execute/config/store.ts`
- [ ] Implement agent registry/discovery in `src/execute/config/registry.ts`
- [ ] Add `.forge/config.json` to `.gitignore`

### CLI Adapters (Optional)
- [ ] Implement `ClaudeCodeAdapter` in `src/execute/agents/cli-adapters/claude-code.ts`
- [ ] Implement `CodexAdapter` in `src/execute/agents/cli-adapters/codex.ts`

### Failure Handling
- [ ] Implement retry policy in `src/execute/orchestrator/retry.ts`
- [ ] Implement rollback detection in `src/execute/orchestrator/rollback.ts`

### Artifacts & Reporting
- [ ] Implement execution artifact writer in `src/execute/execution-artifact.ts`
- [ ] Implement execution report generator in `src/execute/report.ts`

### CLI Integration
- [ ] Wire into `src/cli.ts` and `src/index.ts`
- [ ] Add `--dry-run` mode
- [ ] Add `--max-parallel` concurrency limiting
- [ ] Add `--resume` for resuming failed executions
- [ ] Add `--setup` for re-running agent configuration
- [ ] Add `--model-index` and `--model-id` for model selection

### Testing
- [ ] Write tests for constraint engine
- [ ] Write tests for orchestrator loop
- [ ] Write integration tests with mock agent adapters
- [ ] Write tests for API adapters

### Documentation
- [ ] Document Step 5 in `docs/forge_step5.md`

---

## Why This Matters

Without orchestration, Forge is a sophisticated planning system that still requires a human to be the orchestrator. The human has to:

- Track which workstreams are running
- Assign agents to workstreams
- Monitor for completion
- Enforce merge order in their head
- Handle failures reactively

The orchestrator removes that cognitive load. It turns Forge from a planning tool into an **executable development system** — one where you can trust that:

1. Workstreams that can parallelize **do** parallelize
2. Merge order is **enforced**, not hoped for
3. Failures are **caught and surfaced** before they cascade
4. Results are **captured** in a structured artifact for Step 6

By supporting API-based agents directly, Forge becomes immediately usable by anyone with an API key — no CLI tools to install, no agent-specific tooling to manage. The multi-model config with `baseUrl` and `apiKey` per entry means you're never locked into one provider or endpoint.

This is where Forge stops being a documentation system and becomes a real execution engine.
