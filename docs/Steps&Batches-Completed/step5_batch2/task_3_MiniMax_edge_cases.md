# Step 5 Batch 2 — Task 3: Edge Case Hardening

## Context

Read `src/execute/cli.ts`, `src/execute/state-machine.ts`, and `tests/execute.v1-minimal.test.ts`.

## Goal

Handle edge cases that the Batch 1 minimal tests don't cover.

## Edge Cases

### 1. Empty Workstream List

If `split.json` has zero workstreams:

```typescript
// In cli.ts
if (artifact.workstreams.length === 0) {
  console.log('No workstreams to execute. All done.')
  await writeExecuteArtifact(artifactPath, buildExecuteArtifact(state, '1.0.0', FORGE_VERSION))
  process.exit(0)
}
```

### 2. All Workstreams Blocked

If every workstream is blocked by merge_order:

```typescript
const blocked = getBlockedWorkstreams(state)
if (blocked.length === state.workstreams.size && state.workstreams.size > 0) {
  console.error('All workstreams are blocked by merge_order constraints.')
  console.error('Check that upstream dependencies have been completed first.')
  // Do not exit — let human inspect
}
```

### 3. Partial Completion

Multiple workstreams can be in different states at exit:

```typescript
const summary = {
  total: state.workstreams.size,
  completed: Array.from(state.workstreams.values()).filter(ws => ws.state === 'completed').length,
  running: Array.from(state.workstreams.values()).filter(ws => ws.state === 'running').length,
  failed: Array.from(state.workstreams.values()).filter(ws => ws.state === 'failed').length,
  queued: Array.from(state.workstreams.values()).filter(ws => ws.state === 'queued').length,
  blocked: Array.from(state.workstreams.values()).filter(ws => ws.state === 'blocked').length,
}
console.log(`\nPartial completion: ${summary.completed}/${summary.total} merged`)
```

### 4. Resume from Existing execute.json

If `execute.json` already exists, offer to resume:

```typescript
const executePath = path.join(outputDir, 'execute.json')
try {
  const existing = JSON.parse(await fs.readFile(executePath, 'utf-8'))
  console.log(`Found existing execute.json from ${existing.completedAt}`)
  console.log('Use --resume to continue from previous state, or --force to start over.')
} catch {
  // No existing state, start fresh
}
```

### 5. Debug Output

Add `FORGE_EXECUTE_DEBUG=1` env var support:

```typescript
if (process.env.FORGE_EXECUTE_DEBUG === '1') {
  // Write debug artifact with full state dump
  await fs.writeFile(
    path.join(outputDir, 'execute-debug.json'),
    JSON.stringify(state, null, 2),
    'utf-8'
  )
}
```

### 6. CLI `--force` Flag

Allow restarting even with existing execute.json:

```typescript
// In ExecuteCommandOptions
export interface ExecuteCommandOptions {
  repo?: string
  outputDir?: string
  force?: boolean  // NEW
  resume?: boolean  // NEW
}
```

## Files to Update

- `src/execute/cli.ts` — add all edge case handling
- `src/execute/types.ts` — add `force` and `resume` to ExecuteCommandOptions
- `src/execute/state-machine.ts` — add state restoration for resume

## Verification

- [ ] Empty workstream list → graceful completion, no crash
- [ ] All blocked → clear message, not a crash
- [ ] Partial completion → correct summary printed
- [ ] Resume works: reloading execute.json restores state
- [ ] `--force` flag restarts even with existing state
- [ ] `FORGE_EXECUTE_DEBUG=1` writes debug artifact
