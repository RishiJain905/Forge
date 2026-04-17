# Step 6 Batch 1 — Task 3: AI Prompt Builder + Test Runner

## Owner

GLM

## Description

Build the AI-powered integration test generation system:

1. **`src/integrate/prompt-builder.ts`** — constructs a rich prompt asking the AI to generate integration tests based on what was executed and what the plan said should happen
2. **`src/integrate/test-runner.ts`** — executes the generated tests using the project's existing test framework

---

## Context Files (Read First)

- `src/execute/prompt-builder.ts` — for patterns on building AI prompts (reuse structure)
- `src/execute/model-connector.ts` — for how to call the AI model (reuse, do NOT recreate)
- `src/integrate/types.ts` — types you defined in Task 1

---

## Part A: Prompt Builder (`src/integrate/prompt-builder.ts`)

### What It Does

Takes `PromptBuildContext` and returns `BuiltPrompt`. The prompt asks the AI to write integration tests that verify the whole system works together.

### Prompt Structure

```
# SYSTEM ROLE
You are a skilled software engineer writing integration tests...

# ORIGINAL TASK GOAL
{goal from plan.json}

# EXECUTED WORKSTREAMS
{list of workstreams that ran, what each changed}

# PLAN ITEMS (what was supposed to be built)
{requirement → file mapping from plan.json}

# VERIFY CONSTRAINTS (safety rules from verify.json)
{conflict zones, safety rules, carried concerns}

# CHANGED FILES (post-execution actual contents)
{contents of files that were modified}

# EXISTING TESTS (what's already covered)
{list of existing test files and what they cover}

# TEST FRAMEWORK
{detected framework: name, language, command to run tests}

# YOUR TASK
Write integration tests that verify the whole system works together...

# OUTPUT FORMAT
Return a JSON array of test files to create...
```

### Key Functions to Export

```typescript
export async function buildIntegrationTestPrompt(
  ctx: PromptBuildContext
): Promise<BuiltPrompt>

// Helper: detect test framework from package.json or project files
export function detectTestFramework(repoRoot: string): Promise<{
  name: string;
  language: string;
  testCommand: string;
}>

// Helper: get changed file contents from execute artifact
export async function getChangedFileContents(
  executeArtifact: ExecuteArtifact,
  repoRoot: string
): Promise<Record<string, string>>
```

### What Gets Included in the Prompt

For each executed workstream (from execute.json):
- Title and description
- Files changed (from `changesMade`)
- AI model used

From plan.json:
- The `goal` field
- Plan items (requirements → files)

From verify.json:
- Conflict zones
- Safety rules
- Carried-forward concerns

### AI Output Format (what the prompt asks for)

The prompt tells the AI to return a JSON array of test files:

```json
[
  {
    "path": "tests/integration/api.test.ts",
    "framework": "jest",
    "language": "typescript",
    "content": "import { describe, it, expect } from '@jest/globals';\n..."
  }
]
```

---

## Part B: Test Runner (`src/integrate/test-runner.ts`)

### What It Does

After the AI generates test files, the test runner:
1. Writes the generated test files to disk
2. Runs the test suite
3. Parses the test output (pass/fail per test)
4. Returns `TestRunResult`

### Key Functions to Export

```typescript
export async function runIntegrationTests(
  testFiles: IntegrationTestFile[],
  repoRoot: string,
  testCommand?: string  // override detected command
): Promise<TestRunResult>
```

### Framework Detection

Auto-detect the test framework by scanning:

1. `package.json` — look for `scripts.test` (jest, vitest, mocha, etc.)
2. `pytest.ini` or `pyproject.toml` — Python projects
3. `Makefile` — look for `test` target
4. Fall back to `npm test` if nothing found

Framework → command mapping:
| Framework | Command |
|-----------|---------|
| jest | `npm test -- --passWithNoTests` |
| vitest | `npm test -- --passWithNoTests` |
| pytest | `python -m pytest` |
| mocha | `npm test` |
| default | `npm test` |

### Test File Writing

Write each `IntegrationTestFile` to its `path` on disk. Create parent directories if they don't exist.

### Result Parsing

Parse the test output to extract per-test results. If full parse fails, fall back to:
- Exit code 0 → all passed
- Exit code ≠ 0 → failed (with whatever error message is available)

---

## Reuse from Step 5

Import and reuse, do NOT recreate:
- `src/execute/model-connector.ts` — the `executeWorkstream` or equivalent AI call function
- `src/execute/prompt-builder.ts` — patterns for building prompts

If the model connector needs adaptation for integrate use, wrap it rather than copy-paste.

---

## Verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `buildIntegrationTestPrompt` produces a prompt with all required sections
- [ ] `detectTestFramework` correctly identifies jest/pytest from project files
- [ ] `runIntegrationTests` writes test files to disk
- [ ] `runIntegrationTests` runs the test command and returns parsed results
- [ ] `TestRunResult` contains all required fields per types.ts

---

## Output

When complete, create `step6_batch1/task_3_p3-done.md` documenting what was implemented and verified.
