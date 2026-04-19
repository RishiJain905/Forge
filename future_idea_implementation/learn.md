# Forge Learn — Feedback-Driven Pipeline Improvement

> **Stage:** Post-Step 6 (v2 extension)
> **Purpose:** Collect and apply learnings from every `forge execute` + `forge integrate` run to improve future prompt building, model selection, workstream splitting, and overall pipeline quality.

---

## Context

Every Forge run produces valuable data:
- What workstreams succeeded vs. failed
- Which AI models performed better on which task types
- What integration tests caught regressions
- What errors recurred across runs
- How long different task categories took
- Which split strategies led to cleaner integration

Forge Learn captures this data, stores it persistently, and uses it to **make future Forge runs smarter**.

---

## What Forge Learn Does

### 1. Run Telemetry Collection

After every `forge execute` and `forge integrate` run, Forge Learn records telemetry:

```typescript
interface RunTelemetry {
  runId: string;              // Unique run identifier (UUID)
  timestamp: string;         // ISO timestamp
  taskGoal: string;           // What the user asked to build
  taskCategory?: string;       // Inferred category: "api", "ui", "refactor", "test", etc.
  
  // Execute phase
  execute: {
    workstreamCount: number;
    workstreams: Array<{
      id: string;
      title: string;
      state: "completed" | "failed" | "partial";
      durationMs: number;
      modelUsed?: string;
      tokensUsed?: number;
      error?: string;
      changesMade: number;
    }>;
    totalDurationMs: number;
    primaryModel: string;     // Most-used model across workstreams
  };
  
  // Integrate phase
  integrate: {
    testFilesGenerated: number;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    aiModelUsed: string;
  };
  
  // Outcome
  outcome: "success" | "partial" | "failed";
  rollbackPerformed: boolean;
  
  // Context
  repo: string;
  forgeVersion: string;
  nodeVersion: string;
  osPlatform: string;
}
```

### 2. Learn Store

All telemetry is appended to the **Learn Store** — a structured, queryable log:

```
.forge/learn/
├── store/
│   ├── runs.jsonl           # All run telemetry (append-only)
│   ├── index.json           # Quick lookup index by runId/timestamp
│   └── categories/
│       ├── api.jsonl         # Runs tagged as "api" tasks
│       ├── ui.jsonl          # Runs tagged as "ui" tasks
│       ├── refactor.jsonl    # Runs tagged as "refactor" tasks
│       └── ...
├── insights/                 # Generated insights
│   ├── model-performance.json
│   ├── workstream-patterns.json
│   ├── common-errors.json
│   └── improvement-recommendations.json
└── config.yaml             # Learn configuration
```

### 3. Insights Generation

Forge Learn periodically analyzes the store and generates insights:

#### Model Performance Matrix

```json
{
  "model-performance": {
    "openai/gpt-4o": {
      "total_runs": 12,
      "success_rate": 0.83,
      "avg_duration_ms": 45200,
      "avg_changes_per_minute": 8.4,
      "categories": {
        "api": { "success_rate": 0.91, "avg_changes": 12.3 },
        "ui": { "success_rate": 0.75, "avg_changes": 6.1 },
        "refactor": { "success_rate": 0.88, "avg_changes": 15.2 }
      }
    },
    "anthropic/claude-opus-4": {
      "total_runs": 8,
      "success_rate": 0.88,
      "avg_duration_ms": 62100,
      "categories": {
        "api": { "success_rate": 0.85, "avg_changes": 11.1 },
        "ui": { "success_rate": 0.90, "avg_changes": 7.8 }
      }
    }
  }
}
```

#### Workstream Split Patterns

```json
{
  "workstream-patterns": {
    "optimal-size": {
      "avg_workstreams_per_task": 3.2,
      "success_correlation": "tasks with 2-4 workstreams have 23% higher success rate",
      "failure_correlation": "tasks with 6+ workstreams have 40% higher failure rate"
    },
    "parallel-vs-sequential": {
      "parallel_runs": 45,
      "sequential_runs": 12,
      "parallel_success_rate": 0.81,
      "sequential_success_rate": 0.75
    }
  }
}
```

#### Common Errors

```json
{
  "common-errors": [
    {
      "error_pattern": "SyntaxError: unexpected token",
      "occurrences": 14,
      "common_in": ["typescript", "javascript"],
      "likely_cause": "Generated code with syntax errors — model temperature too high",
      "recommendation": "Lower temperature for code generation tasks"
    },
    {
      "error_pattern": "Module not found",
      "occurrences": 9,
      "common_in": ["python", "typescript"],
      "likely_cause": "Missing import or dependency — plan didn't account for new deps",
      "recommendation": "Add dependency-check to verify step"
    }
  ]
}
```

### 4. Feedback-Driven Prompt Improvement

Forge Learn feeds insights back into the pipeline:

#### A. Smarter Model Selection

When starting a new task, Forge Learn can suggest the best model based on historical performance:

```
$ forge execute --prompt "Build a REST API for user management"

[Learn] Based on 8 similar past tasks:
  → openai/gpt-4o: 91% success rate for "api" tasks (avg 12.3 changes)
  → Suggesting: openai/gpt-4o
  → Override with --model <model> if preferred
```

#### B. Improved Prompt Templates

If a certain prompt pattern consistently produces poor outcomes, Forge Learn flags it:

```
[Learn] Warning: Tasks with "Build a complete X" phrasing have 35% lower success
  rate than tasks with specific feature lists.
  Consider being more specific about requirements.
```

#### C. Better Workstream Splitting

Learn data shows what split sizes work best:

```
[Learn] Historical data suggests splitting this into 3 workstreams:
  - Workstream 1: API routes + schema
  - Workstream 2: Business logic + validation
  - Workstream 3: Tests + integration
  This pattern has 88% success rate vs. 62% for single-workstream execution.
```

### 5. Learning Modes

Forge Learn operates in two modes:

#### Passive Mode (Default)

Collects telemetry silently. No prompts, no interruptions. Just records what happened.

```
forge learn --status          # Show summary stats
forge learn --insights        # Print generated insights
forge learn --export         # Export all data as JSON
forge learn --query "outcome=failed"  # Query the store
```

#### Active Mode

Actively uses Learn data to improve the pipeline, providing suggestions and recommendations.

```
forge learn --enable-active   # Turn on active mode
forge learn --disable-active  # Back to passive
```

In Active Mode, Forge will:
- Suggest better models before execution
- Warn about risky prompt patterns
- Recommend workstream splits based on history
- Flag recurring errors before they happen

---

## Architecture

### Directory Structure

```
src/learn/
├── types.ts           # RunTelemetry, Insight, ModelPerformance, WorkstreamPattern
├── schema.ts          # Zod schemas for all learn types
├── collector.ts       # collectRunTelemetry(), afterExecuteHook(), afterIntegrateHook()
├── store.ts           # appendRun(), queryRuns(), getRunsByCategory()
├── insights.ts        # generateInsights(), computeModelPerformance(), detectErrorPatterns()
├── query.ts           # queryStore(), QueryFilter
├── feedback.ts        # getModelSuggestion(), getSplitRecommendation(), getPromptWarning()
├── export.ts          # exportStore(), importStore()
├── cli.ts             # forge learn CLI command
```

### Key Types

```typescript
// src/learn/types.ts

export interface RunTelemetry {
  runId: string;
  timestamp: string;
  taskGoal: string;
  taskCategory?: string;
  execute: ExecuteTelemetry;
  integrate: IntegrateTelemetry;
  outcome: "success" | "partial" | "failed";
  rollbackPerformed: boolean;
  repo: string;
  forgeVersion: string;
  nodeVersion: string;
  osPlatform: string;
}

export interface ExecuteTelemetry {
  workstreamCount: number;
  workstreams: WorkstreamTelemetry[];
  totalDurationMs: number;
  primaryModel: string;
}

export interface WorkstreamTelemetry {
  id: string;
  title: string;
  state: "completed" | "failed" | "partial";
  durationMs: number;
  modelUsed?: string;
  tokensUsed?: number;
  error?: string;
  changesMade: number;
}

export interface IntegrateTelemetry {
  testFilesGenerated: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  aiModelUsed: string;
}

export interface ModelPerformanceInsight {
  model: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  avgChangesPerMinute: number;
  categoryPerformance: Record<string, {
    successRate: number;
    avgChanges: number;
  }>;
}

export interface WorkstreamPatternInsight {
  description: string;
  correlation: string;
  successRate: number;
  sampleSize: number;
}

export interface ErrorPatternInsight {
  errorPattern: string;
  occurrences: number;
  commonIn: string[];
  likelyCause: string;
  recommendation: string;
}

export interface LearnInsights {
  generatedAt: string;
  modelPerformance: ModelPerformanceInsight[];
  workstreamPatterns: WorkstreamPatternInsight[];
  errorPatterns: ErrorPatternInsight[];
  improvementRecommendations: string[];
}

export interface LearnConfig {
  enabled: boolean;
  mode: "passive" | "active";
  storePath: string;
  insightsRefreshInterval: number; // minutes
  privacyMode: boolean; // anonymize repo/task data
}
```

### Telemetry Collection Flow

```typescript
// hooks registered in CLI after execute/integrate complete
async function afterExecuteHook(executeResult: ExecuteCommandResult) {
  const telemetry: RunTelemetry = {
    runId: executeResult.runId,
    timestamp: new Date().toISOString(),
    taskGoal: executeResult.goal,
    execute: {
      workstreamCount: executeResult.workstreams.length,
      workstreams: executeResult.workstreams.map(ws => ({
        id: ws.workstreamId,
        title: ws.title,
        state: ws.state,
        durationMs: ws.durationMs ?? 0,
        modelUsed: ws.aiModelUsed,
        tokensUsed: ws.tokensUsed,
        error: ws.error,
        changesMade: ws.changesMade?.length ?? 0,
      })),
      totalDurationMs: executeResult.durationMs,
      primaryModel: mostUsedModel(executeResult.workstreams),
    },
    integrate: { /* empty initially — filled after integrate */ },
    outcome: determineOutcome(executeResult),
    rollbackPerformed: false,
    repo: executeResult.repoRoot,
    forgeVersion,
    nodeVersion: process.version,
    osPlatform: process.platform,
  };
  
  await appendRunToStore(telemetry);
}

// Similar hook after integrate completes, updating the integrate field
```

### Insights Generation Flow

```typescript
// Periodic (or on-demand via forge learn --refresh)
async function generateAllInsights(): Promise<LearnInsights> {
  const runs = await loadAllRuns();
  
  return {
    generatedAt: new Date().toISOString(),
    modelPerformance: computeModelPerformance(runs),
    workstreamPatterns: computeWorkstreamPatterns(runs),
    errorPatterns: detectErrorPatterns(runs),
    improvementRecommendations: generateRecommendations(runs),
  };
}
```

---

## CLI Surface

```
forge learn init                         # Initialize learn store in current repo
forge learn --status                    # Show summary: total runs, success rate, top models
forge learn --insights                  # Print generated insights
forge learn --refresh                   # Regenerate insights from store
forge learn --query <filter>            # Query runs: outcome=success, category=api
forge learn --export                    # Export all telemetry as JSON
forge learn --import <file>             # Import telemetry from JSON
forge learn --enable-active             # Enable active feedback mode
forge learn --disable-active             # Disable active mode (back to passive)
forge learn --model-suggest             # Show model suggestion for current task
forge learn config --set mode=active    # Update config
forge learn config --set privacy=true  # Anonymize data
```

---

## Configuration

```yaml
# .forge/learn/config.yaml
learn:
  enabled: true
  mode: passive  # passive | active
  store_path: ".forge/learn/store"
  insights_refresh_minutes: 60  # Regenerate insights every hour
  privacy_mode: false  # Anonymize repo names and task goals in exports
  sharing:
    enabled: false  # Share anonymized data to improve Forge globally
    endpoint: "https://learn.forge.dev/ingest"
```

---

## Privacy

Forge Learn stores sensitive data locally by default:

| Data | Stored Where | Privacy |
|------|-------------|---------|
| Task goals | `.forge/learn/store/runs.jsonl` | Local only |
| Repo names | `.forge/learn/store/runs.jsonl` | Local only |
| File paths | Not stored | Never |
| AI responses | Not stored | Never |
| Error messages | `.forge/learn/insights/` (pattern only) | Anonymized |

With `privacy_mode: true`:
- Repo names replaced with hashes
- Task goals replaced with category tags
- No raw goals stored, only structural patterns

---

## Relationship to Existing Steps

| Step | What It Does | Learn's Role |
|------|-------------|--------------|
| Step 1 — Intake | Collects task goal | Learn tags the task category |
| Step 5 — Execute | Runs workstreams | Learn records model, duration, changes |
| Step 6 — Integrate | Runs integration tests | Learn records pass/fail, test count |
| **Learn** | Collects telemetry, generates insights | Feeds back into all prior steps |

Learn is the **memory** of Forge. It doesn't change what Forge does — it makes what Forge does *better over time*.

---

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- `forge learn init` — Creates `.forge/learn/` with config and store
- Telemetry appended after each `forge execute` and `forge integrate` run
- `forge learn --insights` — Prints generated insights from store
- `forge learn --query outcome=failed` — Returns filtered results
- Active mode: `forge execute` shows model suggestion before running

---

## Non-Goals

- **Not a replacement for logging** — Use your existing logging infrastructure
- **Not a billing tracker** — Track API costs separately
- **Not a team dashboard** — Use Grafana/Datadog for team-level metrics
- **Not training data** — Learn insights inform decisions, not model fine-tuning
- **Not required to run Forge** — Learn is purely additive, Forge works without it

---

## Open Questions

1. Should Learn data be shareable across a team (anonymized aggregates)?
2. How to handle multi-repo users — should insights be per-repo or global?
3. Should Learn track which *types* of errors Lead to which *types* of rollbacks?
4. How many runs needed before insights become statistically meaningful? (Minimum sample size?)
5. Should Learn suggest workstream merge_order optimizations based on failure patterns?
6. Can Learn detect when a model is "hallucinating" non-existent APIs?
7. Should there be a `forge learn --undo` to delete the last run's telemetry?
