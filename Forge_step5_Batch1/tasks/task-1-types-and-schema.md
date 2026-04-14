# Task 1: Execute Types and Schema

## Goal

Create `src/execute/types.ts` and `src/execute/schema.ts` with the type definitions and Zod schema for the execute step artifact.

## Details

### Types (`src/execute/types.ts`)

Create a `src/execute/` directory and add the following types:

```typescript
// Workstream execution states
export type ExecuteWorkstreamState = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';

// A single workstream's execution state
export interface ExecuteWorkstream {
  workstreamId: string;
  title: string;
  state: ExecuteWorkstreamState;
  startedAt?: string;       // ISO timestamp when marked running
  completedAt?: string;     // ISO timestamp when marked completed
  failedAt?: string;        // ISO timestamp when marked failed
  error?: string;           // error message if failed
  mergeOrderViolations?: string[];  // list of prerequisite workstream ids that blocked completion
}

// The execute step artifact
export interface ExecuteArtifact {
  schemaVersion: string;
  forgeVersion: string;
  createdAt: string;
  splitSource: string;           // path to split.json
  workstreams: ExecuteWorkstream[];
  mergeOrderGates: {
    workstreamId: string;
    prerequisites: string[];      // workstream ids that must merge first
    prerequisitesMet: boolean;
  }[];
  summary: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
  };
}

// State transition event for the log
export interface StateTransition {
  workstreamId: string;
  from: ExecuteWorkstreamState;
  to: ExecuteWorkstreamState;
  timestamp: string;
  reason?: string;
}
```

### Schema (`src/execute/schema.ts`)

Create the Zod schema matching the types, following the artifact boundary pattern from Steps 1-4:

```typescript
import { z } from 'zod';

export const ExecuteWorkstreamStateSchema = z.enum(['queued', 'running', 'completed', 'failed', 'blocked']);

export const ExecuteWorkstreamSchema = z.object({
  workstreamId: z.string(),
  title: z.string(),
  state: ExecuteWorkstreamStateSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  error: z.string().optional(),
  mergeOrderViolations: z.array(z.string()).optional(),
});

export const MergeOrderGateSchema = z.object({
  workstreamId: z.string(),
  prerequisites: z.array(z.string()),
  prerequisitesMet: z.boolean(),
});

export const ExecuteArtifactSchema = z.object({
  schemaVersion: z.string(),
  forgeVersion: z.string(),
  createdAt: z.string(),
  splitSource: z.string(),
  workstreams: z.array(ExecuteWorkstreamSchema),
  mergeOrderGates: z.array(MergeOrderGateSchema),
  summary: z.object({
    total: z.number(),
    queued: z.number(),
    running: z.number(),
    completed: z.number(),
    failed: z.number(),
    blocked: z.number(),
  }),
});

export const StateTransitionSchema = z.object({
  workstreamId: z.string(),
  from: ExecuteWorkstreamStateSchema,
  to: ExecuteWorkstreamStateSchema,
  timestamp: z.string(),
  reason: z.string().optional(),
});
```

### Module Exports

Export all types and schemas from `src/execute/index.ts`:

```typescript
export * from './types';
export * from './schema';
```

## Acceptance

- All types and Zod schemas are defined
- Schema validation passes for valid artifacts
- Schema validation fails for invalid artifacts
- Exports are clean from `src/execute/index.ts`
