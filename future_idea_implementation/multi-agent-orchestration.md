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
3. **Dispatches to agents** — Claude Code, Codex, or any ACP-capable agent
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
│   ├── claude-code.ts     # Claude Code CLI adapter
│   ├── codex.ts           # OpenAI Codex CLI adapter
│   └── custom.ts          # Custom agent adapter
├── execution-artifact.ts  # Writes execution.json artifact
├── report.ts              # Human-readable execution report
└── types.ts               # Step 5 type definitions
```

### Workstream State Machine

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

### Dispatcher Interface

```typescript
// src/execute/agents/types.ts
export interface AgentAdapter {
  name: string;
  supports: readonly string[];  // ["claude-code", "codex", "opencode", ...]

  // Dispatch an agent to execute a workstream
  dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult>;

  // Check if an agent is still running
  pollStatus(dispatchId: string): Promise<AgentStatus>;

  // Signal the agent to stop (if needed)
  cancel(dispatchId: string): Promise<void>;
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

### Constraint Engine

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

### Agent Dispatcher

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

    // Build the agent prompt — this is critical
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

### Handoff Management

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

### Orchestrator Loop

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

### Execution Artifact

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

## Agent Adapter Examples

### Claude Code Adapter

```typescript
// src/execute/agents/claude-code.ts
export const claudeCodeAdapter: AgentAdapter = {
  name: "Claude Code",
  supports: ["claude-code"],

  async dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult> {
    const { workstreamId, context, agentConfig } = params;
    
    const promptPath = `${context.outputRoot}/workstreams/${workstreamId}/prompt.md`;
    await writeFile(promptPath, buildExecutionPrompt(workstream, context));

    const args = [
      "--acp",
      "--stdio",
      `--model ${agentConfig.model ?? "claude-opus-4"}`,
      `--project ${context.repoRoot}`,
      promptPath,
    ];

    const child = spawn("claude", args, {
      cwd: context.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      dispatchId: `claude-${workstreamId}-${Date.now()}`,
      agentType: "claude-code",
      pid: child.pid,
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      state: "running",
    };
  },

  async pollStatus(dispatchId: string): Promise<AgentStatus> {
    // Check if the child process is still running
    const pid = this.activeDispatches.get(dispatchId)?.pid;
    if (!pid) return { state: "unknown" };

    try {
      process.kill(pid, 0); // Signal 0 = check if process exists
      return { state: "running" };
    } catch {
      // Process has exited — read exit code
      const exitCode = this.getExitCode(pid);
      return exitCode === 0
        ? { state: "completed" }
        : { state: "failed", exitCode };
    }
  },

  async cancel(dispatchId: string): Promise<void> {
    const dispatch = this.activeDispatches.get(dispatchId);
    if (dispatch?.pid) {
      process.kill(dispatch.pid, "SIGTERM");
    }
  },
};
```

### OpenAI Codex Adapter

```typescript
// src/execute/agents/codex.ts
export const codexAdapter: AgentAdapter = {
  name: "OpenAI Codex",
  supports: ["codex"],

  async dispatch(params: {
    workstreamId: string;
    context: WorkstreamExecutionContext;
    agentConfig: AgentConfig;
  }): Promise<DispatchResult> {
    const { workstreamId, context, agentConfig } = params;
    
    const promptPath = `${context.outputRoot}/workstreams/${workstreamId}/prompt.md`;
    await writeFile(promptPath, buildExecutionPrompt(workstream, context));

    const args = [
      "model", agentConfig.model ?? "gpt-5",
      "task", promptPath,
      "--project", context.repoRoot,
    ];

    const child = spawn("codex", args, {
      cwd: context.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      dispatchId: `codex-${workstreamId}-${Date.now()}`,
      agentType: "codex",
      pid: child.pid,
      // ... similar to Claude Code adapter
    };
  },
};
```

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

## CLI Integration

```bash
# Basic execution
forge execute

# With specific agent
forge execute --agent claude-code --model claude-sonnet-4

# With max concurrency limit
forge execute --max-parallel 4

# With retry policy
forge execute --max-retries 3 --retry-backoff 10000

# Dry run — show what would execute without running
forge execute --dry-run

# Resume from a previous execution
forge execute --resume .forge/execute-2026-04-13.json
```

## Implementation Checklist

- [ ] Define Step 5 types in `src/execute/types.ts`
- [ ] Implement `ConstraintEngine` in `src/execute/orchestrator/constraint-engine.ts`
- [ ] Implement `AgentDispatcher` in `src/execute/orchestrator/dispatcher.ts`
- [ ] Implement `HandoffManager` in `src/execute/orchestrator/handoff.ts`
- [ ] Implement `Orchestrator` event loop in `src/execute/orchestrator/orchestrator.ts`
- [ ] Implement `ClaudeCodeAdapter` in `src/execute/agents/claude-code.ts`
- [ ] Implement `CodexAdapter` in `src/execute/agents/codex.ts`
- [ ] Implement retry policy in `src/execute/orchestrator/retry.ts`
- [ ] Implement rollback detection in `src/execute/orchestrator/rollback.ts`
- [ ] Implement execution artifact writer in `src/execute/execution-artifact.ts`
- [ ] Implement execution report generator in `src/execute/report.ts`
- [ ] Wire into `src/cli.ts` and `src/index.ts`
- [ ] Add `--dry-run` mode
- [ ] Add `--max-parallel` concurrency limiting
- [ ] Add `--resume` for resuming failed executions
- [ ] Write tests for constraint engine
- [ ] Write tests for orchestrator loop
- [ ] Write integration tests with mock agent adapters
- [ ] Document Step 5 in docs/forge_step5.md

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

This is where Forge stops being a documentation system and becomes a real execution engine.
