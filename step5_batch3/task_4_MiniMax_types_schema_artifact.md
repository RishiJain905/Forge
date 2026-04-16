# Task 4: Types/Schema/Artifact Extension

**Agent:** MiniMax
**Step:** 5.3.4

## Goal

Extend the type definitions, Zod schemas, and artifact builder to include AI execution fields. This ensures `execute.json` properly records what the AI model did per workstream.

## In Scope

- `src/execute/types.ts` — add AI fields to `ExecuteWorkstream` and `ExecuteArtifact`
- `src/execute/schema.ts` — add AI fields to Zod schemas
- `src/execute/artifact.ts` — update `buildExecuteArtifact` to accept AI metadata
- `src/execute/state-machine.ts` — add AI fields to `ExecuteWorkstream` internal tracking
- Unit tests for all schema changes

## Out of Scope

- AI prompt builder (task 1)
- AI model connector (task 2)
- CLI integration (task 3)

## AI Fields to Add

### ExecuteWorkstream (extend existing)

```typescript
// AI execution fields (added after Batch 2)
export interface ExecuteWorkstream {
  workstreamId: string;
  title: string;
  state: ExecuteWorkstreamState;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
  mergeOrderViolations?: string[];

  // --- NEW AI FIELDS ---
  aiModelUsed?: string;           // e.g., "gpt-4o", "claude-3-5-sonnet-4"
  aiPromptHash?: string;          // SHA-256 of the prompt sent to the model
  aiProvider?: string;            // e.g., "openai", "anthropic", "google"
  changesMade?: ChangeMade[];     // Actual file changes the AI made
  aiExecutionDurationMs?: number; // How long the AI call took
}

export interface ChangeMade {
  file: string;                   // Absolute path to the file
  action: 'create' | 'modify' | 'delete';
  diffHash: string;              // SHA-256 of the diff
  linesAdded: number;
  linesRemoved: number;
  beforeHash?: string;           // SHA-256 of file before change
  afterHash?: string;            // SHA-256 of file after change (or null if deleted)
  error?: string;                // If the write failed, the error
}
```

### ExecuteArtifact (extend existing)

```typescript
export interface ExecuteArtifact {
  schemaVersion: string;
  forgeVersion: string;
  createdAt: string;
  splitSource: string;
  workstreams: ExecuteWorkstream[];
  mergeOrderGates: MergeOrderGate[];
  summary: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
    // --- NEW ---
    aiExecutedCount?: number;     // How many workstreams were AI-executed
    totalChangesMade?: number;    // Total file changes across all workstreams
  };
  transitions: StateTransition[];

  // --- NEW ---
  aiConfig?: {
    provider: string;
    modelName: string;
    baseUrl?: string;
  };
}
```

## Task List

1. Read current `src/execute/types.ts` — understand existing `ExecuteWorkstream` and `ExecuteArtifact`
2. Read current `src/execute/schema.ts` — understand existing Zod schemas
3. Read current `src/execute/artifact.ts` — understand `buildExecuteArtifact`
4. Read current `src/execute/state-machine.ts` — understand how workstreams are tracked
5. Add new interfaces to `types.ts`:
   - `ChangeMade` interface
   - `AIModelInfo` interface (for artifact-level config)
   - Add optional AI fields to `ExecuteWorkstream`
   - Add optional AI fields to `ExecuteArtifact.summary`
6. Update `schema.ts`:
   - Add `ChangeMadeSchema`
   - Add `AIModelInfoSchema`
   - Update `ExecuteWorkstreamSchema` to include AI fields
   - Update `ExecuteArtifactSchema.summary` to include AI fields
7. Update `artifact.ts`:
   - `buildExecuteArtifact` now accepts AI config
   - Compute `aiExecutedCount` and `totalChangesMade` from workstream data
8. Update `state-machine.ts`:
   - `createExecuteState` — no changes needed
   - `transitionState` — no changes needed (AI fields set by CLI after execution)
   - `restoreExecuteState` — restore AI fields from artifact
9. Write `tests/execute.types-schema-ai.test.ts`:
   - Validate that AI fields are properly parsed
   - Validate that schema rejects invalid AI field values
   - Validate that artifact builder includes AI fields

## Schema Changes

### ExecuteWorkstreamSchema (update)

```typescript
export const ChangeMadeSchema = z.object({
  file: z.string(),
  action: z.enum(['create', 'modify', 'delete']),
  diffHash: z.string(),
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
  error: z.string().optional(),
}).strict();

export const ExecuteWorkstreamSchema = z.object({
  workstreamId: z.string(),
  title: z.string(),
  state: ExecuteWorkstreamStateSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  error: z.string().optional(),
  mergeOrderViolations: z.array(z.string()).optional(),
  // NEW AI FIELDS
  aiModelUsed: z.string().optional(),
  aiPromptHash: z.string().optional(),
  aiProvider: z.string().optional(),
  changesMade: z.array(ChangeMadeSchema).optional(),
  aiExecutionDurationMs: z.number().optional(),
}).strict();
```

### ExecuteArtifactSchema (update)

```typescript
// Add to summary object:
const ExecuteArtifactSummarySchema = z.object({
  total: z.number(),
  queued: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
  blocked: z.number(),
  // NEW
  aiExecutedCount: z.number().optional(),
  totalChangesMade: z.number().optional(),
});

// Add new top-level field:
export const AIModelInfoSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  baseUrl: z.string().optional(),
}).strict();

export const ExecuteArtifactSchema = z
  .object({
    schemaVersion: z.string(),
    forgeVersion: z.string(),
    createdAt: z.string(),
    splitSource: z.string(),
    workstreams: z.array(ExecuteWorkstreamSchema),
    mergeOrderGates: z.array(MergeOrderGateSchema),
    summary: ExecuteArtifactSummarySchema,
    transitions: z.array(StateTransitionSchema),
    // NEW
    aiConfig: AIModelInfoSchema.optional(),
  })
  .strict();
```

## Acceptance Criteria

- [ ] `ExecuteWorkstream` type has optional `aiModelUsed`, `aiPromptHash`, `aiProvider`, `changesMade`, `aiExecutionDurationMs`
- [ ] `ExecuteArtifact` type has optional `aiConfig` in summary and top-level
- [ ] `ChangeMade` interface has all required fields (file, action, diffHash, linesAdded, linesRemoved, beforeHash, afterHash)
- [ ] All Zod schemas reject unknown fields (`.strict()`)
- [ ] `buildExecuteArtifact` computes `aiExecutedCount` and `totalChangesMade` from workstream data
- [ ] `restoreExecuteState` correctly restores AI fields from artifact
- [ ] Unit tests pass: `npm run test -- --grep "types-schema-ai"`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] `npm run build` — PASS
- [ ] No existing tests break (run full test suite)
