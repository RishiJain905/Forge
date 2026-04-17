# Step 6 Batch 1 — Integrate: Core Types, Schema, and Artifact

## Goal

Build the foundation of `forge integrate` — Step 6 of the Forge pipeline. After Step 5 AI-executes all workstreams, Step 6 verifies the whole system works together by having an AI generate and run integration tests against the full codebase.

This batch establishes the core types, Zod schemas, and artifact shape for the integrate step.

---

## Context Files (Read First)

Before any implementation, read ALL of these:

- `src/execute/types.ts` — ExecuteArtifact and ExecuteWorkstream (Step 5 output)
- `src/execute/schema.ts` — Execute artifact Zod schemas
- `src/plan/types.ts` — PlanArtifact and plan item types (Step 2 output)
- `src/verify/types.ts` — VerifyArtifact and verify findings (Step 3 output)
- `src/split/types.ts` — SplitWorkstream type (Step 4 output)
- `docs/step5-ai-execute-flow.md` — Step 5 vs Step 6 responsibility diagram
- `src/plan/schema.ts` — Plan artifact schema (for reference on artifact pattern)
- `src/verify/schema.ts` — Verify artifact schema (for reference on artifact pattern)

---

## What This Batch Is

- Core type definitions for the integrate step (`src/integrate/types.ts`)
- Zod schemas for all integrate artifacts (`src/integrate/schema.ts`)
- Integration artifact builder (`src/integrate/artifact.ts`)
- An AI integration test prompt builder (`src/integrate/prompt-builder.ts`) — builds a prompt that asks the AI to analyze the full codebase post-execution and generate integration tests
- An integration test executor (`src/integrate/test-runner.ts`) — runs the generated tests using the project's existing test framework (npm test, pytest, etc.)
- The `forge integrate` CLI (`src/integrate/cli.ts`) — the command that runs after `forge execute`
- Types for integration test results: what passed, what failed, what the AI recommended

---

## What This Batch Is NOT

- Multi-agent orchestration (V2)
- Concurrent test execution
- Automated PR creation or git operations
- Performance benchmarking
- Security scanning

---

## Architecture

### Where Step 6 Fits in the Pipeline

```
forge execute  →  forge integrate
     ↓                  ↓
execute.json    →  integrate.json + integration-report.md
```

`forge integrate` reads:
- `.forge/execute.json` — what was executed (workstreams, changes made, AI model used)
- `.forge/plan.json` — the original plan (what was supposed to be built)
- `.forge/verify.json` — the safety constraints that were verified
- The actual files on disk (post-execution)

### What `forge integrate` Does

1. **Read execute artifact** — know what workstreams ran, what files changed
2. **Read plan artifact** — know what the original requirements were
3. **Analyze post-execution state** — scan the codebase to understand what actually exists
4. **Build integration test prompt** — ask the AI to generate tests that verify the whole works
5. **Run AI model** — send the prompt, receive integration test code
6. **Write tests to disk** — persist the AI-generated tests
7. **Execute tests** — run the test suite against the codebase
8. **Record results** — write integrate.json with pass/fail, failures, recommendations

### Key Difference from Step 5

- Step 5 operates on **one workstream at a time** with merge_order enforcement
- Step 6 operates on the **entire codebase** — all workstreams considered together

### No Merge Order in Step 6

Step 6 does not enforce merge_order. All workstreams from Step 5 are already completed (or failed). Step 6's job is to verify the **combined result** makes sense.

### Integration Test Prompt Builder

The prompt builder (`src/integrate/prompt-builder.ts`) constructs a prompt that includes:

1. **Original task/goal** — from plan.json (what were we trying to build?)
2. **Executed workstreams** — from execute.json (what did the AI actually change?)
3. **Changed files** — actual file contents post-execution (what did the AI write?)
4. **Verify constraints** — from verify.json (what safety rules were established?)
5. **Test framework detection** — automatically detect npm test, pytest, etc.
6. **Existing test files** — what's already tested, to avoid duplication

Output: a prompt that asks the AI to write integration tests covering the key scenarios.

---

## File Structure

```
src/integrate/
├── types.ts           NEW — IntegrateArtifact, IntegrationTestResult, IntegrateCommandResult, etc.
├── schema.ts          NEW — Zod schemas for all integrate types
├── artifact.ts        NEW — buildIntegrateArtifact, writeIntegrateArtifact
├── prompt-builder.ts  NEW — buildIntegrationTestPrompt (analyzes codebase + execute.json, builds AI prompt)
├── test-runner.ts     NEW — runIntegrationTests (executes generated tests, parses results)
├── cli.ts             NEW — forge integrate CLI (runIntegrateCommand)

tests/
├── integrate.types-schema.test.ts   NEW — TDD tests for types and schemas
├── integrate.prompt-builder.test.ts NEW — TDD tests for prompt builder
├── integrate.test-runner.test.ts    NEW — TDD tests for test runner
└── integrate.cli.test.ts            NEW — TDD tests for CLI

step6_batch1/
├── SPEC.md           — This file
├── README.md         — Batch 1 index
├── progress.md       — Progress tracking
├── task_1_TYPES.md   — Task 1 spec
├── task_2_SCHEMA.md  — Task 2 spec
├── task_3_PROMPT_BUILDER.md — Task 3 spec
└── task_4_CLI_WIRING.md       — Task 4 spec
```

---

## Types to Define (`src/integrate/types.ts`)

```typescript
// Integration test status
export type IntegrationTestState = "pending" | "passed" | "failed" | "skipped";

// A single integration test case
export interface IntegrationTestCase {
  id: string;                    // e.g., "int-test-1"
  name: string;                  // e.g., "API endpoint returns correct data"
  status: IntegrationTestState;
  durationMs?: number;           // How long the test took
  error?: string;                // If failed, the error message
  recommendation?: string;       // AI recommendation on how to fix
}

// A single test file generated by the AI
export interface IntegrationTestFile {
  path: string;                  // Absolute path where the test file was written
  testCount: number;             // Number of test cases in this file
  language: string;              // e.g., "typescript", "python"
  framework: string;             // e.g., "jest", "pytest"
}

// Summary of the integration step
export interface IntegrationSummary {
  total: number;                 // Total test cases
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;            // Total time for all tests
  testFilesGenerated: number;     // How many test files the AI wrote
  aiModelUsed?: string;          // e.g., "openai/gpt-4o"
}

// The integrate step artifact
export interface IntegrateArtifact {
  schemaVersion: string;
  forgeVersion: string;
  createdAt: string;
  executeSource: string;         // path to execute.json
  planSource: string;             // path to plan.json
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
  recommendations: string[];      // AI recommendations for fixing failures
}

// Options for the integrate command
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;              // Re-run even with existing integrate.json
  auto?: boolean;                // Auto-run without prompting
  testFramework?: string;        // Force a specific test framework
}

// Result of the integrate command
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

---

## Schema to Define (`src/integrate/schema.ts`)

```typescript
import { z } from "zod";

// IntegrationTestStateSchema
// IntegrationTestCaseSchema — strict, validates id/name/status/error optional
// IntegrationTestFileSchema — strict, validates path/testCount/language/framework
// IntegrationSummarySchema — strict, validates all summary fields
// IntegrateArtifactSchema — strict, validates the full artifact shape
// validateIntegrateArtifact(input: unknown): IntegrateArtifact
```

---

## Task Breakdown

| # | Task | Description | Agent |
|---|------|-------------|-------|
| 1 | Core Types | Define all TypeScript types for integrate step | MiniMax |
| 2 | Zod Schemas | Define and validate all Zod schemas for integrate types | MiniMax |
| 3 | Prompt Builder + Test Runner | Build AI prompt from execute+plan+verify context; execute generated tests | GLM |
| 4 | CLI Wiring | Wire integrate into CLI (`forge integrate` command), read execute.json, produce integrate.json | MiniMax |

---

## Verification

All tasks must pass before Step 6 Batch 1 is considered complete:

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions)
- [ ] `npm run smoke` — PASS
- [ ] `forge integrate` reads execute.json and produces integrate.json
- [ ] `integrate.json` contains valid IntegrateArtifact shape per schema
- [ ] AI generates at least one integration test file
- [ ] Test runner executes tests and records pass/fail in artifact
- [ ] `forge integrate` fails with clear error if execute.json not found
- [ ] Report (`integration-report.md`) is produced alongside artifact

---

## Notes on AI Integration

Step 6 reuses the existing AI model connector from Step 5 (`src/execute/model-connector.ts`). Do NOT create a new model connector. Import and reuse the existing one.

The prompt builder should reuse `src/execute/prompt-builder.ts` patterns — similar structure (system role + context sections), but adapted for integration testing.

The test runner should auto-detect the project's test framework by scanning `package.json` for test scripts, or by detecting `pytest.ini` / `pyproject.toml` for Python projects.
