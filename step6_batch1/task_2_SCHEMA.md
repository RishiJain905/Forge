# Step 6 Batch 1 — Task 2: Zod Schemas

## Owner

MiniMax

## Description

Define all Zod schemas for the `forge integrate` step in `src/integrate/schema.ts`.

---

## What to Implement

Create `src/integrate/schema.ts` with the following exports:

### SchemaImports

Import Zod and the required types:
```typescript
import { z } from "zod";
import type {
  IntegrationTestCase,
  IntegrationTestFile,
  IntegrationSummary,
  IntegrateArtifact,
} from "./types.js";
```

### IntegrationTestStateSchema

```typescript
export const IntegrationTestStateSchema = z.enum(["pending", "passed", "failed", "skipped"]);
```

### IntegrationTestCaseSchema

```typescript
export const IntegrationTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: IntegrationTestStateSchema,
  durationMs: z.number().optional(),
  error: z.string().optional(),
  recommendation: z.string().optional(),
}).strict();
```

### IntegrationTestFileSchema

```typescript
export const IntegrationTestFileSchema = z.object({
  path: z.string(),
  testCount: z.number().int().nonnegative(),
  language: z.string(),
  framework: z.string(),
}).strict();
```

### IntegrationSummarySchema

```typescript
export const IntegrationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  testFilesGenerated: z.number().int().nonnegative(),
  aiModelUsed: z.string().optional(),
}).strict();
```

### WorkstreamsSummarySchema (inner object)

```typescript
const WorkstreamsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  totalChangesMade: z.number().int().nonnegative(),
}).strict();
```

### IntegrateArtifactSchema

```typescript
export const IntegrateArtifactSchema = z.object({
  schemaVersion: z.string(),
  forgeVersion: z.string(),
  createdAt: z.string(),
  executeSource: z.string(),
  planSource: z.string(),
  verifySource: z.string(),
  goal: z.string(),
  workstreamsSummary: WorkstreamsSummarySchema,
  tests: z.array(IntegrationTestCaseSchema),
  testFiles: z.array(IntegrationTestFileSchema),
  summary: IntegrationSummarySchema,
  aiConfig: z.object({
    provider: z.string(),
    modelName: z.string(),
    baseUrl: z.string().optional(),
  }).optional(),
  recommendations: z.array(z.string()),
}).strict();
```

### validateIntegrateArtifact

```typescript
export function validateIntegrateArtifact(input: unknown): IntegrateArtifact {
  return IntegrateArtifactSchema.parse(input);
}
```

---

## Implementation Notes

1. Use `.strict()` on all object schemas to reject unknown keys
2. Use `z.number().int().nonnegative()` for counts
3. Use `z.number().nonnegative()` for duration
4. Follow the same pattern as `src/execute/schema.ts` and `src/verify/schema.ts`
5. Export each schema individually and the `validateIntegrateArtifact` function

---

## Verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `src/integrate/schema.ts` exports all schemas listed above
- [ ] `validateIntegrateArtifact` correctly parses a valid artifact
- [ ] Unknown keys are rejected by `.strict()`
- [ ] Invalid states are rejected by `IntegrationTestStateSchema`
- [ ] Negative counts are rejected

---

## Output

When complete, create `step6_batch1/task_2_p2-done.md` documenting what was implemented and verified.
