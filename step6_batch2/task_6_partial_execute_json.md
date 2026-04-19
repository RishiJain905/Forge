# Step 6 Batch 2 — Task 6: Partial execute.json Support

## Owner

MiniMax

## Status

**Pending**

## Context

Real `execute.json` files have mixed workstream states — some completed, some failed, some partial. `forge integrate` should handle all combinations gracefully. This task adds explicit handling for partial execution states.

## Implementation

### Workstream Health Classification

Add helper types and functions in `src/integrate/cli.ts`:

```typescript
type WorkstreamHealth = {
  completed: ExecuteWorkstream[];
  failed: ExecuteWorkstream[];
  partial: ExecuteWorkstream[];
  unknown: ExecuteWorkstream[];
};

function classifyWorkstreamHealth(
  workstreams: ExecuteWorkstream[]
): WorkstreamHealth {
  return {
    completed: workstreams.filter((ws) => ws.state === "completed"),
    failed: workstreams.filter((ws) => ws.state === "failed"),
    partial: workstreams.filter((ws) => ws.state === "partial"),
    unknown: workstreams.filter(
      (ws) => !ws.state || !["completed", "failed", "partial"].includes(ws.state)
    ),
  };
}
```

### Updated Workstream Validation

Replace the current all-failed check:

```typescript
const health = classifyWorkstreamHealth(executeArtifact.workstreams);

// If ALL workstreams failed, integration is meaningless
if (
  health.completed.length === 0 &&
  health.failed.length === executeArtifact.workstreams.length
) {
  return {
    status: "failed",
    summary:
      "All workstreams failed in execute.json. Integration is meaningless without completed work.",
    artifactPath: "",
    outputRoot: repoRoot,
    failure: {
      code: "ALL_WORKSTREAMS_FAILED",
      message: "All workstreams failed. Fix failures before integrating.",
    },
  };
}

// If ALL workstreams are unknown state, treat as no workstreams
if (
  health.unknown.length === executeArtifact.workstreams.length ||
  executeArtifact.workstreams.length === 0
) {
  return {
    status: "failed",
    summary: "No valid workstreams found in execute.json.",
    artifactPath: "",
    outputRoot: repoRoot,
    failure: {
      code: "NO_WORKSTREAMS",
      message: "No workstreams found in execute.json.",
    },
  };
}

// Warn if some workstreams failed (but others completed)
if (health.failed.length > 0 && health.completed.length > 0) {
  const msg = `Warning: ${health.failed.length}/${executeArtifact.workstreams.length} workstreams failed. Integration will verify what was completed.`;
  if (options.auto) {
    console.warn(`[Auto] ${msg}`);
  } else {
    console.warn(msg);
  }
}
```

### Enhanced Prompt Context for Mixed States

Update the prompt builder call to include workstream health context:

```typescript
// Build workstreams health summary for prompt
const workstreamHealthContext = [
  `# Workstream Health`,
  ``,
  `| State | Count |`,
  `|-------|-------|`,
  `| ✅ Completed | ${health.completed.length} |`,
  `| ❌ Failed | ${health.failed.length} |`,
  `| ⚠️ Partial | ${health.partial.length} |`,
  `| ❓ Unknown | ${health.unknown.length} |`,
  ``,
  health.failed.length > 0
    ? `**Failed workstreams:** ${health.failed.map((ws) => ws.workstreamId).join(", ")}`
    : "",
  health.partial.length > 0
    ? `**Partial workstreams:** ${health.partial.map((ws) => ws.workstreamId).join(", ")}`
    : "",
]
  .filter(Boolean)
  .join("\n");

// Pass health to prompt builder
const promptContext = {
  executeArtifact,
  planArtifact,
  verifyArtifact,
  repoRoot,
  testFramework: options.testFramework,
  // New: include workstream health in context
  workstreamHealth: health,
  workstreamHealthContext,
};
```

### Update Prompt Builder (`src/integrate/prompt-builder.ts`)

Add optional health context parameter:

```typescript
export interface PromptBuildContext {
  executeArtifact: ExecuteArtifact;
  planArtifact: PlanArtifact | null;
  verifyArtifact: VerifyArtifact | null;
  repoRoot: string;
  testFramework?: string;
  workstreamHealth?: WorkstreamHealth;      // NEW
  workstreamHealthContext?: string;         // NEW
}

export async function buildIntegrationTestPrompt(
  ctx: PromptBuildContext
): Promise<BuiltPrompt> {
  // ... existing code ...

  // Add workstream health section to prompt
  const healthSection = ctx.workstreamHealthContext
    ? `\n\n${ctx.workstreamHealthContext}`
    : "";

  const prompt = `...${healthSection}\n\n# ORIGINAL TASK GOAL\n${goal}
...`;
}
```

### Update CLI to Pass Health Context

In `runIntegrateCommand`, update the prompt builder call:

```typescript
const { prompt, promptHash, detectedFramework } = await buildIntegrationTestPrompt({
  executeArtifact,
  planArtifact,
  verifyArtifact,
  repoRoot,
  testFramework: options.testFramework,
  workstreamHealth: health,
  workstreamHealthContext: buildWorkstreamHealthContext(health),
});
```

Where `buildWorkstreamHealthContext` is:

```typescript
function buildWorkstreamHealthContext(health: WorkstreamHealth): string {
  const lines: string[] = [
    "# Workstream Health Summary",
    "",
    `Completed: ${health.completed.length} | Failed: ${health.failed.length} | Partial: ${health.partial.length}`,
    "",
  ];

  if (health.completed.length > 0) {
    lines.push(`## Completed Workstreams (focus integration tests here)`);
    for (const ws of health.completed) {
      lines.push(`- ${ws.workstreamId}: ${ws.title}`);
    }
    lines.push("");
  }

  if (health.failed.length > 0) {
    lines.push(`## Failed Workstreams (tests may need to work around these)`);
    for (const ws of health.failed) {
      lines.push(`- ${ws.workstreamId}: ${ws.title} — ${ws.error ?? "unknown error"}`);
    }
    lines.push("");
  }

  if (health.partial.length > 0) {
    lines.push(`## Partial Workstreams`);
    for (const ws of health.partial) {
      lines.push(`- ${ws.workstreamId}: ${ws.title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

## Files Modified

- `src/integrate/cli.ts` — add workstream health classification and handling
- `src/integrate/prompt-builder.ts` — add health context to prompt
- `src/integrate/types.ts` — add WorkstreamHealth type

## Tests

Add to `tests/integrate.cli.test.ts`:

- All workstreams completed → proceeds normally
- All workstreams failed → fails with `ALL_WORKSTREAMS_FAILED`
- Mixed (some completed, some failed) → proceeds with warning
- Mixed in `--auto` mode → warning in output, still proceeds
- No workstreams → fails with `NO_WORKSTREAMS`
- Workstreams with unknown state → included in health summary
- Partial workstreams → included in health summary with note

Add to `tests/integrate.prompt-builder.test.ts`:

- Prompt includes workstream health context when health is passed
- Prompt health section lists completed, failed, and partial workstreams separately

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- Mixed workstream states produce a warning but continue
- `--auto` mode still shows warning in output for mixed states
- AI prompt includes workstream health section for better test generation
