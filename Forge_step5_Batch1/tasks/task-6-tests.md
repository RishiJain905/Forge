# Task 6: Tests

## Goal

Create `tests/execute.v1-minimal.test.ts` covering the execute step core functionality.

## Details

### Test File

Create `tests/execute.v1-minimal.test.ts`.

### Test Cases

**1. State Machine Tests**

```typescript
describe('Execute State Machine', () => {
  it('initializes all workstreams to queued', () => {
    const state = createExecuteState(mockSplitJson);
    expect(state.workstreams.get('ws-1')?.state).toBe('queued');
    expect(state.workstreams.get('ws-2')?.state).toBe('queued');
  });

  it('allows queued → running transition', () => {
    const state = createExecuteState(mockSplitJson);
    const result = transitionState('ws-1', 'running', state);
    expect(result.success).toBe(true);
    expect(state.workstreams.get('ws-1')?.state).toBe('running');
  });

  it('allows running → completed when merge_order is satisfied', () => {
    const state = createExecuteState(mockSplitJson);
    // ws-1 has no merge_order prerequisites
    transitionState('ws-1', 'running', state);
    const result = transitionState('ws-1', 'completed', state);
    expect(result.success).toBe(true);
    expect(state.mergedWorkstreams.has('ws-1')).toBe(true);
  });

  it('blocks completed when merge_order prerequisites are not met', () => {
    const state = createExecuteState(mockSplitJson);
    // ws-2 requires ws-1 to be merged first
    transitionState('ws-2', 'running', state);
    const result = transitionState('ws-2', 'completed', state);
    expect(result.success).toBe(false);
    expect(result.violations).toContain('ws-1');
  });

  it('allows running → failed always', () => {
    const state = createExecuteState(mockSplitJson);
    transitionState('ws-1', 'running', state);
    const result = transitionState('ws-1', 'failed', state);
    expect(result.success).toBe(true);
    expect(state.workstreams.get('ws-1')?.error).toBe('Unknown error');
  });

  it('updates mergedWorkstreams only on successful completion', () => {
    const state = createExecuteState(mockSplitJson);
    transitionState('ws-1', 'running', state);
    transitionState('ws-1', 'completed', state);
    expect(state.mergedWorkstreams.has('ws-1')).toBe(true);
  });
});
```

**2. Artifact Writer Tests**

```typescript
describe('Execute Artifact Writer', () => {
  it('writes a valid execute.json artifact', async () => {
    const state = createExecuteState(mockSplitJson);
    const artifact = buildExecuteArtifact(state);
    await writeExecuteArtifact('/tmp/test-execute.json', artifact);
    const content = await fs.readFile('/tmp/test-execute.json', 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.workstreams).toHaveLength(4);
  });
});
```

**3. Integration Test with Mock Split.json**

Create a mock `split.json` fixture in `tests/fixtures/`:

```json
{
  "schemaVersion": "2.0.0",
  "workstreams": [
    {
      "id": "ws-1",
      "title": "Authentication",
      "category": "implementation",
      "mergeOrderAfter": []
    },
    {
      "id": "ws-2",
      "title": "API Layer",
      "category": "implementation",
      "mergeOrderAfter": ["ws-1"]
    },
    {
      "id": "ws-3",
      "title": "Frontend",
      "category": "implementation",
      "mergeOrderAfter": ["ws-1"]
    },
    {
      "id": "ws-4",
      "title": "Integration",
      "category": "implementation",
      "mergeOrderAfter": ["ws-2", "ws-3"]
    }
  ]
}
```

Use this fixture in all tests.

## Acceptance

- All state machine transitions are tested
- merge_order enforcement has dedicated test coverage
- Artifact writer produces valid artifacts
- Tests run with `npm test`
- Mock split.json fixture is used across tests
