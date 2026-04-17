# Step 5 Batch 2 — Task 2: Error Handling Polish

## Context

Read `src/execute/cli.ts`, `src/execute/state-machine.ts`, and the error handling patterns from Steps 1-4 (e.g., `src/intake/cli.ts`, `src/plan/cli.ts`).

## Goal

Harden error handling so `forge execute` fails cleanly and informatively when things go wrong.

## Error Scenarios

### Missing split.json

```typescript
// In cli.ts
const splitPath = path.join(repoPath, '.forge', 'split.json')
try {
  splitContent = await fs.readFile(splitPath, 'utf-8')
} catch {
  console.error(`Error: split.json not found at ${splitPath}`)
  console.error('Run: forge intake → forge plan → forge verify → forge split first.')
  process.exit(1)
}
```

### Corrupt / Invalid split.json

```typescript
const splitArtifact = validateSplitArtifact(JSON.parse(splitContent))
if (!splitArtifact.success) {
  console.error(`Error: split.json is invalid: ${splitArtifact.error}`)
  process.exit(1)
}
```

### Write Failures

```typescript
try {
  await writeExecuteArtifact(artifactPath, artifact)
} catch (err) {
  console.error(`Error: Failed to write execute.json: ${err.message}`)
  process.exit(1)
}
```

### Invalid State Transitions

```typescript
const result = transitionState(workstreamId, newState, state, reason)
if (!result.success) {
  console.error(`Error: ${result.error}`)
  // Do not exit — let human try another command
}
```

### Exit Code Semantics

For script automation:

| Exit Code | Meaning |
|-----------|---------|
| 0 | All workstreams completed successfully |
| 1 | General error (missing file, write failure, etc.) |
| 2 | Exit with blocked workstreams (partial completion) |

```typescript
// At exit:
const failed = Array.from(state.workstreams.values()).filter(ws => ws.state === 'failed')
const blocked = Array.from(state.workstreams.values()).filter(ws => ws.state === 'blocked')

if (failed.length > 0) process.exit(1)
if (blocked.length > 0) process.exit(2)
process.exit(0)
```

## Files to Update

- `src/execute/cli.ts` — add all error handling above
- `src/execute/state-machine.ts` — ensure transitionState returns structured errors

## Verification

- [ ] Missing split.json → clear error, exit code 1
- [ ] Invalid split.json (bad JSON) → clear error, exit code 1
- [ ] Write failure → clear error, exit code 1
- [ ] Invalid state transition → error printed, no crash
- [ ] All workstreams complete → exit code 0
- [ ] Some workstreams failed → exit code 1
- [ ] Exit with blocked workstreams → exit code 2
