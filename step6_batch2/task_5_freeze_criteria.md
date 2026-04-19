# Step 6 Batch 2 — Task 5: Freeze Criteria

## Owner

MiniMax

## Status

**Pending**

## Context

When retries and backoffs aren't enough, `forge integrate` should know when to stop trying and produce the best artifact possible. Define and implement "freeze criteria" — conditions that trigger a graceful stop with a partial but useful result.

## Implementation

### New Types (`src/integrate/types.ts`)

```typescript
export interface FreezeCriteria {
  maxRetries: number;
  maxDurationMs: number;
  freezeOn: {
    rateLimitHit: boolean;
    authFailure: boolean;
    parseFailure: boolean;
  };
}

export const DEFAULT_FREEZE_CRITERIA: FreezeCriteria = {
  maxRetries: 2,
  maxDurationMs: 300000, // 5 minutes
  freezeOn: {
    rateLimitHit: false, // Wait out rate limits by default
    authFailure: true,   // Never retry auth failures
    parseFailure: true,  // Freeze on parse failure immediately
  },
};
```

### Extend IntegrateArtifact Schema (`src/integrate/schema.ts`)

```typescript
// Add to IntegrateArtifactSchema:
const IntegrateArtifactSchema = z.object({
  // ... existing fields ...
  attemptCount: z.number().int().nonnegative().optional(),
  frozenAt: z.string().optional(),
  finalError: z.string().optional(),
});
```

### Freeze Logic in CLI (`src/integrate/cli.ts`)

The freeze check happens during the retry loop. Add a freeze tracker:

```typescript
interface FreezeState {
  frozen: boolean;
  frozenAt?: string;
  finalError?: string;
  attemptCount: number;
}

function shouldFreeze(
  criteria: FreezeCriteria,
  state: FreezeState,
  lastError: ErrorClassification | null
): boolean {
  // Check max retries
  if (state.attemptCount > criteria.maxRetries) {
    return true;
  }

  // Check max duration (track separately in CLI)

  // Check specific freeze conditions
  if (lastError?.type === "auth_failure" && criteria.freezeOn.authFailure) {
    return true;
  }
  if (lastError?.type === "parse_error" && criteria.freezeOn.parseFailure) {
    return true;
  }

  return false;
}
```

When freeze criteria are met:

```typescript
const freezeState: FreezeState = {
  frozen: false,
  attemptCount: 0,
};

const startTime = Date.now();

for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
  freezeState.attemptCount = attempt;

  try {
    const result = await executeWorkstream(prompt, repoRoot);
    // ... success path ...
    break;
  } catch (err) {
    const classified = classifyError(err);
    const elapsed = Date.now() - startTime;

    // Check if we should freeze instead of retry
    const freezeCriteria: FreezeCriteria = {
      ...DEFAULT_FREEZE_CRITERIA,
      maxDurationMs: elapsed, // Already exceeded if we get here
    };

    if (
      shouldFreeze(freezeCriteria, freezeState, classified) ||
      elapsed > DEFAULT_FREEZE_CRITERIA.maxDurationMs
    ) {
      freezeState.frozen = true;
      freezeState.frozenAt = new Date().toISOString();
      freezeState.finalError = `${classified.type}: ${classified.message}`;

      // Produce a frozen artifact — still useful, but marked as incomplete
      const frozenArtifact = buildFrozenArtifact(
        executeArtifact,
        planArtifact,
        verifyArtifact,
        freezeState,
        classified
      );
      await writeIntegrateArtifact(artifactPath, frozenArtifact);
      await fs.writeFile(reportPath, createFrozenReport(frozenArtifact, classified), "utf-8");

      return {
        status: "failed",
        summary: `Integration frozen at ${freezeState.frozenAt}. ${classified.suggestion}`,
        artifactPath,
        reportPath,
        outputRoot: outputDir,
        exitCode: 1,
        failure: {
          code: "INTEGRATION_FROZEN",
          message: `Integration stopped: ${classified.type}. ${freezeState.finalError}`,
        },
      };
    }

    // ... retry logic ...
  }
}
```

### Frozen Artifact Builder (`src/integrate/artifact.ts`)

```typescript
export function buildFrozenArtifact(
  executeArtifact: ExecuteArtifact,
  planArtifact: PlanArtifact | null,
  verifyArtifact: VerifyArtifact | null,
  freezeState: FreezeState,
  lastError: ErrorClassification
): IntegrateArtifact {
  return {
    schemaVersion: SCHEMA_VERSION,
    forgeVersion: FORGE_VERSION,
    createdAt: new Date().toISOString(),
    executeSource: executeArtifact.splitSource ?? ".forge/split.json",
    planSource: planArtifact ? ".forge/plan.json" : "",
    verifySource: verifyArtifact ? ".forge/verify.json" : "",
    goal: planArtifact?.task?.goal ?? planArtifact?.goal ?? "Unknown",
    workstreamsSummary: {
      total: executeArtifact.workstreams.length,
      completed: executeArtifact.workstreams.filter((ws) => ws.state === "completed").length,
      failed: executeArtifact.workstreams.filter((ws) => ws.state === "failed").length,
      totalChangesMade: 0,
    },
    tests: [],
    testFiles: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      testFilesGenerated: 0,
      aiModelUsed: lastError.type,
    },
    recommendations: [`Frozen due to: ${lastError.type}. ${lastError.suggestion}`],
    frozenAt: freezeState.frozenAt,
    finalError: freezeState.finalError,
    attemptCount: freezeState.attemptCount,
  };
}
```

### Frozen Report (`src/integrate/report.ts`)

Add a function to generate a frozen report:

```typescript
export function createFrozenReport(
  artifact: IntegrateArtifact,
  lastError: ErrorClassification
): string {
  return `# Forge Integration Report — [FROZEN]

**Date:** ${artifact.createdAt}
**Status:** ❌ INTEGRATION FROZEN
**Frozen At:** ${artifact.frozenAt}
**Attempts:** ${artifact.attemptCount}

## Reason for Freeze

\`\`\`
${artifact.finalError}
\`\`\`

## Suggestion

${lastError.suggestion}

## Workstreams

| Total | Completed | Failed |
|-------|-----------|--------|
| ${artifact.workstreamsSummary.total} | ${artifact.workstreamsSummary.completed} | ${artifact.workstreamsSummary.failed} |

## Next Steps

1. Address the underlying issue: ${lastError.type}
2. Run \`forge integrate --force\` to retry after fixing the issue
3. If the issue is a rate limit, wait before retrying

---
*This integration was frozen and may be incomplete.*
`;
}
```

## Files Modified

- `src/integrate/types.ts` — add FreezeCriteria, DEFAULT_FREEZE_CRITERIA
- `src/integrate/schema.ts` — extend IntegrateArtifactSchema with frozen fields
- `src/integrate/artifact.ts` — add buildFrozenArtifact
- `src/integrate/report.ts` — add createFrozenReport
- `src/integrate/cli.ts` — add freeze logic in retry loop

## Tests

Add to `tests/integrate.cli.test.ts`:

- Max retries exceeded → integration freezes
- Max duration exceeded → integration freezes
- Auth failure triggers immediate freeze
- Parse failure triggers immediate freeze
- Rate limit does NOT trigger freeze (waits by default)
- Frozen artifact has `frozenAt`, `finalError`, `attemptCount` set
- Frozen report contains `[FROZEN]` badge and suggestion

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- Frozen integration produces artifact with frozenAt and finalError
- Frozen report is generated with [FROZEN] badge
- Exit code is still 1 for frozen integrations
