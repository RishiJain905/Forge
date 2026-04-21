# Step 6 Batch 3 — Task 1: Address Batch 2 Open Questions

## Owner

MiniMax

## Status

**Pending**

## Context

Batch 2 left 5 Open Questions. This task answers all 5 definitively in code.

## Decisions Summary

| OQ# | Question | Decision |
|-----|----------|----------|
| OQ1 | `--force` delete or overwrite? | **Overwrite only** — safer, git history available |
| OQ2 | Add `--delay` flag for rate limits? | **Yes** — seconds as unit, overrides exponential backoff |
| OQ3 | `--auto` skip `integration-report.md`? | **No** — keep report. Add `--json-only` instead |
| OQ4 | Persist retry attempts to artifact? | **Yes** — add `attemptCount` to IntegrateArtifact |
| OQ5 | Config file for freeze criteria? | **CLI flags only for V1** — add `--max-retries`, `--max-duration` |

## Implementation

### OQ1: `--force` Overwrite Behavior

**No code change needed** — existing implementation already overwrites. Verify behavior:

```typescript
// In runIntegrateCommand, the flow is:
// 1. Check if integrate.json exists AND !force → return error
// 2. If force → proceed (overwrite happens when writeIntegrateArtifact writes)
// 3. If !exists → proceed (normal write)
```

Add a test to confirm overwrite behavior:
```typescript
it("force flag allows overwriting existing integrate.json", async () => {
  // Write a fake integrate.json
  // Run with --force
  // Verify new integrate.json is written (timestamp should be newer)
});
```

### OQ2: Add `--delay` Flag

Add to `src/integrate/types.ts`:
```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  jsonOnly?: boolean;
  testFramework?: string;
  delay?: number;       // NEW: seconds between retries
  maxRetries?: number;  // NEW: override max retries
  maxDurationMs?: number; // NEW: override max duration
}
```

Add to `src/integrate/cli.ts` in the retry loop:
```typescript
// Replace the delay calculation with:
const delayMs = options.delay !== undefined
  ? options.delay * 1000  // --delay is in seconds
  : retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
```

Update CLI registration in `src/cli.ts`:
```typescript
.option("--delay <seconds>", "Override retry delay in seconds for rate limit backoff", (val) => parseInt(val, 10))
```

### OQ3: Add `--json-only` Flag

Add to `IntegrateCommandOptions` (same as above):
```typescript
jsonOnly?: boolean;
```

Update CLI registration:
```typescript
.option("--json-only", "Only write integrate.json, skip integration-report.md")
```

Update `runIntegrateCommand` artifact writing:
```typescript
// After building the artifact:
// Write integrate.json (always)
await writeIntegrateArtifact(artifactPath, artifact);

// Write report (skip if --json-only)
if (!options.jsonOnly) {
  await fs.writeFile(reportPath, createIntegrationReport(artifact), "utf-8");
}
```

### OQ4: Add `attemptCount` to Artifact

Update `src/integrate/types.ts`:
```typescript
export interface IntegrateArtifact {
  // ... existing fields ...
  attemptCount?: number;       // NEW: how many integration attempts were made
}
```

Update `src/integrate/schema.ts`:
```typescript
const IntegrateArtifactSchema = z.object({
  // ... existing fields ...
  attemptCount: z.number().int().nonnegative().optional(),
});
```

Track attempt count in `src/integrate/cli.ts`:
```typescript
let attemptCount = 1;
let lastError: ErrorClassification | undefined;

// In retry loop, after each attempt:
attemptCount++;

// Pass to buildIntegrateArtifact:
const artifact = buildIntegrateArtifact(
  // ... existing args ...
  attemptCount
);
```

Update `src/integrate/artifact.ts` signature and body:
```typescript
export function buildIntegrateArtifact(
  // ... existing args ...
  attemptCount?: number,
): IntegrateArtifact {
  return validateIntegrateArtifact({
    // ... existing fields ...
    attemptCount,
  });
}
```

Update `src/integrate/report.ts` to show attempt count:
```typescript
const lines: string[] = [
  // ...
  `**Attempts:** ${artifact.attemptCount ?? 1}`,
  // ...
];
```

### OQ5: Add `--max-retries` and `--max-duration` Flags

These are already declared in OQ2 (shared `IntegrateCommandOptions`). Wire them to freeze criteria:

```typescript
// In runIntegrateCommand, build effective freeze criteria:
const effectiveFreezeCriteria: FreezeCriteria = {
  maxRetries: options.maxRetries ?? DEFAULT_FREEZE_CRITERIA.maxRetries,
  maxDurationMs: options.maxDurationMs ?? DEFAULT_FREEZE_CRITERIA.maxDurationMs,
  freezeOn: DEFAULT_FREEZE_CRITERIA.freezeOn,
};
```

Update CLI registration:
```typescript
.option("--max-retries <n>", "Maximum retry attempts before freezing", (val) => parseInt(val, 10))
.option("--max-duration <ms>", "Maximum duration in ms before freezing", (val) => parseInt(val, 10))
```

## Test Coverage

Add to `tests/integrate.cli.test.ts`:
```typescript
it("force flag allows overwriting existing integrate.json", ...)
it("--json-only skips writing integration-report.md", ...)
it("--delay overrides exponential backoff delay", ...)
it("--max-retries overrides freeze maxRetries", ...)
it("--max-duration overrides freeze maxDurationMs", ...)
it("attemptCount is 1 on first attempt", ...)
it("attemptCount increments on retry", ...)
```

## Files Modified

- `src/integrate/types.ts` — add `delay`, `maxRetries`, `maxDurationMs`, `attemptCount` fields
- `src/integrate/schema.ts` — add `attemptCount` to schema
- `src/integrate/cli.ts` — wire new options, track attempt count
- `src/integrate/artifact.ts` — accept and persist `attemptCount`
- `src/integrate/report.ts` — display attempt count in report
- `src/cli.ts` — register new CLI flags
- `tests/integrate.cli.test.ts` — add coverage for new flags

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- All new tests pass
- `forge integrate --help` shows `--delay`, `--max-retries`, `--max-duration`, `--json-only`
