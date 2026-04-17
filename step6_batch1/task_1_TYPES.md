# Step 6 Batch 1 — Task 1: Core TypeScript Types

## Owner

MiniMax

## Description

Define all TypeScript types for the `forge integrate` step in `src/integrate/types.ts`.

---

## What to Implement

Create `src/integrate/types.ts` with the following exports:

### Integration Test State

```typescript
export type IntegrationTestState = "pending" | "passed" | "failed" | "skipped";
```

### IntegrationTestCase

```typescript
export interface IntegrationTestCase {
  id: string;                    // e.g., "int-test-1"
  name: string;                  // e.g., "API endpoint returns correct data"
  status: IntegrationTestState;
  durationMs?: number;           // How long the test took
  error?: string;                // If failed, the error message
  recommendation?: string;      // AI recommendation on how to fix
}
```

### IntegrationTestFile

```typescript
export interface IntegrationTestFile {
  path: string;                  // Absolute path where the test file was written
  testCount: number;             // Number of test cases in this file
  language: string;              // e.g., "typescript", "python"
  framework: string;             // e.g., "jest", "pytest"
}
```

### IntegrationSummary

```typescript
export interface IntegrationSummary {
  total: number;                 // Total test cases
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;            // Total time for all tests
  testFilesGenerated: number;    // How many test files the AI wrote
  aiModelUsed?: string;          // e.g., "openai/gpt-4o"
}
```

### IntegrateArtifact

```typescript
export interface IntegrateArtifact {
  schemaVersion: string;
  forgeVersion: string;
  createdAt: string;
  executeSource: string;         // path to execute.json
  planSource: string;            // path to plan.json
  verifySource: string;          // path to verify.json
  goal: string;                  // What the original task was (from plan)
  workstreamsSummary: {
    total: number;
    completed: number;
    failed: number;
    totalChangesMade: number;
  };
  tests: IntegrationTestCase[];
  testFiles: IntegrationTestFile[];
  summary: IntegrationSummary;
  aiConfig?: AIModelInfo;        // AI configuration used
  recommendations: string[];     // AI recommendations for fixing failures
}
```

### IntegrateCommandOptions

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  testFramework?: string;
}
```

### IntegrateCommandResult

```typescript
export interface IntegrateCommandResult {
  status: "ready" | "failed";
  summary: string;
  artifactPath: string;
  reportPath?: string;
  outputRoot: string;
  exitCode?: number;
  failure?: {
    code: string;
    message: string;
  };
}
```

### PromptBuildContext (input for the prompt builder)

```typescript
export interface PromptBuildContext {
  executeArtifact: ExecuteArtifact;
  planArtifact: PlanArtifact;
  verifyArtifact: VerifyArtifact;
  repoRoot: string;
  testFramework?: string;        // Detected or forced
}
```

### BuiltPrompt (output from the prompt builder)

```typescript
export interface BuiltPrompt {
  prompt: string;                 // The full prompt sent to the AI
  promptHash: string;            // SHA-256 of the prompt
  detectedFramework: {
    name: string;               // e.g., "jest", "pytest"
    language: string;           // e.g., "typescript", "python"
    testCommand: string;        // e.g., "npm test"
  };
}
```

### TestRunResult (output from the test runner)

```typescript
export interface TestRunResult {
  success: boolean;              // Did the test suite pass overall?
  tests: IntegrationTestCase[];
  testFiles: IntegrationTestFile[];
  durationMs: number;
  error?: string;               // If the test runner itself crashed
}
```

---

## Reused Types

Import these from existing modules (do NOT re-define them):
- `ExecuteArtifact` → from `src/execute/types.ts`
- `PlanArtifact` → from `src/plan/types.ts`
- `VerifyArtifact` → from `src/verify/types.ts`
- `AIModelInfo` → from `src/execute/types.ts`

---

## Implementation Notes

1. Use `import type` for all cross-module imports
2. Follow the same style as `src/execute/types.ts` and `src/verify/types.ts`
3. All interfaces should be exported
4. The `IntegrationTestCase.error` field should be optional (tests may pass with no error)
5. The `IntegrationSummary.durationMs` is required (always computed)
6. `aiConfig` in `IntegrateArtifact` is optional — if Step 6 runs without AI it won't be present

---

## Verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `src/integrate/types.ts` exports all types listed above
- [ ] All cross-module imports use `import type`
- [ ] Types are consistent with the schema defined in `task_2_SCHEMA.md`

---

## Output

When complete, create `step6_batch1/task_1_p1-done.md` documenting what was implemented and verified.
