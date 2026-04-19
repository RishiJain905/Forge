# Architecture

## Step 6 Integrate — How It Works

### Overview

`forge integrate` is Step 6 of the Forge pipeline. After `forge execute` AI-implements all workstreams, `forge integrate` verifies the whole system works together by:
1. Reading execute.json (what was executed), plan.json (what was supposed to be built), verify.json (safety constraints)
2. Building an AI prompt asking for integration tests covering the whole
3. The AI generates test files
4. Test runner executes them against the actual codebase
5. Producing `integrate.json` + `integration-report.md`

### Key Difference from Step 5

- **Step 5** operates on **one workstream at a time** with merge_order enforcement
- **Step 6** operates on the **entire codebase** — all workstreams together

### No Merge Order in Step 6

Step 6 does not enforce merge_order. All workstreams from Step 5 are already completed (or failed). Step 6's job is to verify the **combined result** makes sense.

### Component Flow

```
forge integrate CLI (cli.ts)
    ├── loadExecuteArtifact() — reads .forge/execute.json
    ├── loadPlanArtifact() — reads .forge/plan.json (optional)
    ├── loadVerifyArtifact() — reads .forge/verify.json (optional)
    ├── buildIntegrationTestPrompt() — constructs AI prompt (prompt-builder.ts)
    │   ├── detectTestFramework() — detects jest/vitest/pytest from package.json
    │   └── getChangedFileContents() — reads files changed by AI
    ├── loadModelConfig() + callModel() — calls AI model (from model-connector.ts)
    ├── parseTestFilesFromAIResponse() — extracts test files from AI response
    ├── runIntegrationTests() — executes generated tests (test-runner.ts)
    ├── buildIntegrateArtifact() — creates artifact (artifact.ts)
    ├── writeIntegrateArtifact() — writes .forge/integrate.json
    └── createIntegrationReport() — generates integration-report.md (report.ts)
```

### Files Created

| File | Purpose |
|------|---------|
| `src/integrate/types.ts` | All TypeScript types for integrate step |
| `src/integrate/schema.ts` | Zod schemas for all integrate types |
| `src/integrate/prompt-builder.ts` | AI integration test prompt builder |
| `src/integrate/test-runner.ts` | Execute generated tests |
| `src/integrate/artifact.ts` | Artifact builder and writer |
| `src/integrate/report.ts` | Human-readable report generator |
| `src/integrate/cli.ts` | The `forge integrate` command |
| `tests/integrate.types-schema.test.ts` | TDD tests for types and schemas |

### AI Integration

**CRITICAL**: Step 6 must NOT use `executeWorkstream()` from `src/execute/model-connector.ts`. That function calls `parseModelResponse()` which expects AI responses in `## CHANGES\n```json [{file, action, content}]```' format and then calls `applyChanges()` to write files to disk. The integrate step's prompt asks the AI to return a plain JSON array of test files `[{path, content, language, framework, testCount}]` — a completely different format, and `runIntegrationTests()` handles file writing.

Instead, use `loadModelConfig()` + `callModel()` from `src/execute/model-connector.ts` directly, then parse the response with the local `parseTestFilesFromAIResponse()` function.

Do NOT create a new model connector — reuse the lower-level primitives (`loadModelConfig`, `callModel`) from the existing connector.

The prompt builder reuses `src/execute/prompt-builder.ts` patterns — similar structure (system role + context sections), but adapted for integration testing.

### Test Framework Detection

Auto-detect by scanning:
1. `package.json` test script for jest/vitest/mocha/pytest
2. `pytest.ini` or `pyproject.toml` with `[tool.pytest]` for Python projects
3. Fall back to `npm test`

### Error Codes

| Code | When |
|------|------|
| `NO_EXECUTE_ARTIFACT` | execute.json not found |
| `NO_WORKSTREAMS` | execute.json has no workstreams |
| `ALL_WORKSTREAMS_FAILED` | All workstreams failed |
| `AI_GENERATION_FAILED` | AI model call failed or bad response |
| `NO_TEST_FILES_GENERATED` | AI returned empty array |
| `TEST_RUN_FAILED` | Test runner crashed |
| `IO_ERROR` | File write error |

### Known Type Discrepancies

**PlanArtifact carry_forward**: The `carry_forward` field on PlanArtifact uses snake_case keys at runtime (e.g., `task_spec`, `repo_context`, `candidate_targets`) per `PlanArtifactCarryForward` interface. However, `PlanCarryForwardContext` interface uses camelCase (e.g., `taskSpec`, `repoContext`). Code working with serialized PlanArtifact JSON data must access snake_case keys using type assertions (`as { task_spec?: { goal?: string } }`). This pattern is used in both `artifact.ts` and `prompt-builder.ts`.

### workstreamsSummary Format Contract

The `workstreamsSummary` field in `IntegrateArtifact` is a free-form string produced by `buildWorkstreamsSummary()` in `artifact.ts` and parsed by `parseWorkstreamsSummary()` in `report.ts`. The format is: `"Total: X, Completed: Y, Failed: Z, Changes: W"`. If this format changes, the report generator will silently fall back to displaying the raw string.
