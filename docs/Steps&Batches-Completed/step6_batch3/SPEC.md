# Step 6 Batch 3 — Integrate Polish, Freeze & V1 Completion

## Goal

Polish the shipped `forge integrate` surface, address the five open questions from Batch 2, add parallel test execution, and freeze Step 6 for V1. After Batch 3, Step 6 integrate is considered complete and production-ready.

---

## What This Batch Does

- Addresses all 5 Open Questions from Batch 2 (force flag behavior, retry delay, --auto skip report, retry persistence, freeze config)
- Adds parallel test file generation and execution
- Polishes CLI output, error messages, and the integration report
- Validates the full integrate surface against the smoke test suite
- Freezes Step 6 for V1 with explicit freeze boundary documentation

## What This Batch Is NOT

- A new AI model connector (reuse from Batch 1)
- A redesign of the integrate architecture
- A change to the core integrate artifact schema
- A change to how workstream health affects the AI prompt

---

## Context Files (Read First)

- `src/integrate/cli.ts` — Current integrate CLI
- `src/integrate/prompt-builder.ts` — Current prompt builder
- `src/integrate/test-runner.ts` — Current test runner
- `src/integrate/schema.ts` — Current Zod schemas
- `src/integrate/artifact.ts` — Current artifact builder
- `src/integrate/report.ts` — Current report generator
- `docs/S6-B1-Done/validation-contract.md` — Batch 1 validation contract
- `docs/S6-B2-Done/p6-done.md` — Batch 2 final closeout
- `step6_batch2/SPEC.md` — Batch 2 spec (including Open Questions)

---

## Architecture

### Where Batch 3 Fits

```
forge integrate (Batch 1: happy path works)
       ↓
forge integrate --force / --auto (Batch 2: hardening)
       ↓
forge integrate with parallel test execution (Batch 3: polish + freeze)
       ↓
V1 FORGE INTEGRATE — FROZEN
```

### File Structure

```
step6_batch3/
├── SPEC.md              — This file
├── README.md            — Batch 3 index
├── progress.md          — Progress tracking
└── tasks/
    ├── task_1_open_questions.md       — Address Batch 2 open questions
    ├── task_2_parallel_test_execution.md — Concurrent test file generation + execution
    ├── task_3_prompt_builder_polish.md — Performance and clarity polish
    ├── task_4_cli_output_polish.md    — Better output, error messages, report polish
    └── task_5_freeze_and_smoke.md     — Smoke test, freeze boundary, V1 sign-off

src/integrate/
├── cli.ts              MODIFY — parallel execution, retry delay, --auto skip report
├── prompt-builder.ts   MODIFY — performance optimizations
├── test-runner.ts      MODIFY — parallel test execution
├── types.ts           MODIFY — add RetryConfig, attemptCount persistence
├── schema.ts           MODIFY — extend IntegrateArtifact with attemptCount
└── report.ts          MODIFY — polish report output

tests/integrate.cli.test.ts               MODIFY — Batch 3 test scenarios
tests/integrate.test-runner.test.ts        MODIFY — parallel execution tests
tests/integrate.prompt-builder.test.ts     MODIFY — performance tests
```

---

## Tasks

| # | Task | Description | Agent |
|---|------|-------------|-------|
| 1 | Open Questions | Address all 5 Batch 2 open questions definitively | MiniMax |
| 2 | Parallel Test Execution | Concurrent test file generation and execution | MiniMax |
| 3 | Prompt Builder Polish | Performance optimization and clarity | MiniMax |
| 4 | CLI Output Polish | Better output, error messages, report polish | MiniMax |
| 5 | Freeze + Smoke | Smoke test, freeze boundary, V1 sign-off | MiniMax |

---

## Task Details

### Task 1: Open Questions

#### OQ1: Should `--force` also delete the old `integrate.json` or just overwrite it?

**Decision: Overwrite only.** Overwrite is safer — the old artifact is available in git history if needed. Deletion adds risk with no meaningful benefit.

```typescript
// In runIntegrateCommand, check force flag:
const integrateJsonPath = path.join(outputDir, "integrate.json");
const integrateExists = await fs.pathExists(integrateJsonPath);

if (integrateExists && !options.force) {
  return {
    status: "failed",
    summary: `integrate.json already exists. Use --force to overwrite.`,
    artifactPath: integrateJsonPath,
    outputRoot: outputDir,
    failure: {
      code: "INTEGRATE_ALREADY_EXISTS",
      message: `integrate.json already exists at ${integrateJsonPath}. Use --force to overwrite and re-run.`,
    },
  };
}
// If force is true, just proceed — overwrite happens when writeIntegrateArtifact runs
```

#### OQ2: For rate limits — should we offer a `--delay` flag to manually set retry delay?

**Decision: Add `--delay` flag with seconds as the unit.** Defaults to exponential backoff from RetryConfig.

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  testFramework?: string;
  delay?: number;       // NEW: seconds between retries (overrides backoff)
}
```

CLI registration:
```typescript
.option("--delay <seconds>", "Override the retry delay in seconds for rate limit backoff", (val) => parseInt(val, 10))
```

Behavior:
- If `--delay` is provided, use it instead of exponential backoff
- If `--delay 0` is provided, retry immediately (no delay)
- If `--delay` is not provided, use exponential backoff from `RetryConfig`

#### OQ3: Should `--auto` also skip writing the human-readable `integration-report.md`?

**Decision: No — keep the report always.** The human-readable report is valuable even in CI/CD. Instead, add a `--json-only` flag to skip the report.

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  jsonOnly?: boolean;   // NEW: skip writing integration-report.md
  testFramework?: string;
  delay?: number;
}
```

CLI registration:
```typescript
.option("--json-only", "Only write integrate.json, skip integration-report.md")
```

In CLI:
```typescript
if (!options.jsonOnly) {
  await fs.writeFile(reportPath, createIntegrationReport(artifact), "utf-8");
}
```

#### OQ4: Should we persist retry attempts to the artifact?

**Decision: Yes.** Add `attemptCount` to `IntegrateArtifact` so users and CI can see how many tries were needed.

```typescript
// src/integrate/schema.ts — add to IntegrateArtifactSchema:
const IntegrateArtifactSchema = z.object({
  // ... existing fields ...
  attemptCount: z.number().int().nonnegative().optional(), // NEW: retry attempts
  frozenAt: z.string().optional(),
  finalError: z.string().optional(),
});
```

```typescript
// src/integrate/types.ts — add to IntegrateArtifact:
export interface IntegrateArtifact {
  // ... existing fields ...
  attemptCount?: number;       // NEW: how many integration attempts were made
  frozenAt?: string;          // EXISTING in freeze criteria
  finalError?: string;        // EXISTING in freeze criteria
}
```

Update `cli.ts` to track and persist attempt count:
```typescript
let attemptCount = 1;
// After each retry attempt:
attemptCount++;

// In buildIntegrateArtifact call:
buildIntegrateArtifact(
  executeArtifact,
  planArtifact,
  verifyArtifact,
  testResult,
  aiModelUsed,
  aiConfig,
  SCHEMA_VERSION,
  FORGE_VERSION,
  attemptCount  // NEW
);
```

#### OQ5: Should freeze criteria be configurable via `config.yaml` or just CLI flags?

**Decision: CLI flags only for V1.** Config file support can be a future enhancement. Add `--max-retries` and `--max-duration` flags for freeze criteria.

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;
  auto?: boolean;
  jsonOnly?: boolean;
  testFramework?: string;
  delay?: number;
  maxRetries?: number;      // NEW: override max retries for freeze criteria
  maxDurationMs?: number;    // NEW: override max duration for freeze criteria
}
```

CLI registration:
```typescript
.option("--max-retries <n>", "Maximum retry attempts before freezing", (val) => parseInt(val, 10))
.option("--max-duration <ms>", "Maximum duration in ms before freezing", (val) => parseInt(val, 10))
```

Pass these to the freeze criteria:
```typescript
const effectiveFreezeCriteria: FreezeCriteria = {
  maxRetries: options.maxRetries ?? DEFAULT_FREEZE_CRITERIA.maxRetries,
  maxDurationMs: options.maxDurationMs ?? DEFAULT_FREEZE_CRITERIA.maxDurationMs,
  freezeOn: DEFAULT_FREEZE_CRITERIA.freezeOn,
};
```

---

### Task 2: Parallel Test Execution

Currently test files are written and executed sequentially. Batch 3 adds concurrent execution.

#### Phase A: Parallel File Writing

```typescript
// src/integrate/test-runner.ts — parallel file writes
import { promises as fs } from "fs";
import path from "node:path";

export async function writeTestFilesParallel(
  testFiles: IntegrationTestFile[],
  repoRoot: string
): Promise<IntegrationTestFile[]> {
  const writePromises = testFiles.map(async (tf) => {
    const fullPath = path.isAbsolute(tf.path) ? tf.path : path.join(repoRoot, tf.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, tf.content ?? "", "utf-8");
    return {
      ...tf,
      path: fullPath,
      testCount: tf.testCount ?? countTestsInContent(tf.content ?? "", tf.framework),
    };
  });
  return Promise.all(writePromises);
}
```

#### Phase B: Parallel Test Execution

```typescript
// For small test suites (< 5 files), run sequentially (less overhead)
// For large test suites (>= 5 files), run in parallel batches

export interface ParallelTestRunOptions {
  maxConcurrency: number;   // Max parallel test commands
  command: string;          // Test command to run
  repoRoot: string;
  timeoutMs: number;
}

export async function runIntegrationTestsParallel(
  testFiles: IntegrationTestFile[],
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();

  if (testFiles.length < 5) {
    // Small suite: sequential
    return runIntegrationTestsSequential(testFiles, options);
  }

  // Large suite: parallel batches
  const batches = chunkArray(testFiles, options.maxConcurrency);
  const allResults: IntegrationTestCase[] = [];
  const allFiles: IntegrationTestFile[] = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((tf) => runSingleTestFile(tf, options))
    );
    for (const result of batchResults) {
      allResults.push(...result.tests);
      allFiles.push(...result.testFiles);
    }
  }

  const totalFailed = allResults.filter((t) => t.status === "failed").length;
  return {
    success: totalFailed === 0,
    tests: allResults,
    testFiles: allFiles,
    durationMs: Date.now() - startTime,
  };
}

async function runSingleTestFile(
  tf: IntegrationTestFile,
  options: ParallelTestRunOptions
): Promise<TestRunResult> {
  const startTime = Date.now();
  const command = `${options.command} ${tf.path}`;  // Run specific file

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: options.repoRoot,
      timeout: options.timeoutMs,
    });
    const output = stdout + stderr;
    const tests = parseTestOutputForFile(tf.path, output, tf.framework);
    return {
      success: tests.filter((t) => t.status === "failed").length === 0,
      tests,
      testFiles: [tf],
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      tests: [{
        id: tf.path,
        name: `Test file: ${tf.path}`,
        status: "failed",
        error: errorMessage,
        durationMs: Date.now() - startTime,
      }],
      testFiles: [tf],
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

#### Phase C: CLI Wiring for Parallelism

```typescript
// src/integrate/cli.ts — wire parallelism option
export interface IntegrateCommandOptions {
  // ... existing options ...
  maxConcurrency?: number;   // NEW: max parallel test operations
}

const DEFAULT_MAX_CONCURRENCY = 5;

// In test runner invocation:
const parallelOptions: ParallelTestRunOptions = {
  maxConcurrency: options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
  command: detectedFramework.testCommand,
  repoRoot,
  timeoutMs: 300000,
};

const testResult = await runIntegrationTestsParallel(
  testFiles,
  parallelOptions
);
```

CLI registration:
```typescript
.option("--max-concurrency <n>", "Max parallel test operations (default: 5)", (val) => parseInt(val, 10))
```

---

### Task 3: Prompt Builder Polish

#### Performance: Cache File Existence Checks

The `getChangedFileContents` function reads files sequentially. Optimize:

```typescript
// src/integrate/prompt-builder.ts — parallel file reads

export async function getChangedFileContents(
  executeArtifact: ExecuteArtifact,
  repoRoot: string
): Promise<Record<string, string>> {
  const fileReads: Array<{ file: string; path: string }> = [];

  for (const ws of executeArtifact.workstreams) {
    if (!ws.changesMade) continue;
    for (const change of ws.changesMade) {
      if (change.action === "delete") continue;
      const fullPath = path.isAbsolute(change.file)
        ? change.file
        : path.join(repoRoot, change.file);
      fileReads.push({ file: change.file, path: fullPath });
    }
  }

  // Parallel reads with error handling
  const results = await Promise.all(
    fileReads.map(async ({ file, path: fullPath }) => {
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        return { file, content };
      } catch {
        return { file, content: `[FILE NOT FOUND: ${file}]` };
      }
    })
  );

  return Object.fromEntries(results.map((r) => [r.file, r.content]));
}
```

#### Clarity: Add Token Estimate

For large execute artifacts, warn if the prompt might exceed context limits:

```typescript
// src/integrate/prompt-builder.ts — add context size warning

export async function buildIntegrationTestPrompt(
  ctx: PromptBuildContext
): Promise<BuiltPrompt> {
  // ... existing prompt building ...

  const prompt = `...`;

  // Rough token estimate (4 chars per token average)
  const estimatedTokens = Math.ceil(prompt.length / 4);
  const CONTEXT_WARNING_THRESHOLD = 100000;  // ~100k tokens

  let contextWarning = "";
  if (estimatedTokens > CONTEXT_WARNING_THRESHOLD) {
    contextWarning = `\n\n⚠️ WARNING: Prompt is estimated at ~${estimatedTokens} tokens, which may approach context limits. Consider using --focus to narrow scope.`;
  }

  const finalPrompt = prompt + contextWarning;
  const promptHash = crypto.createHash("sha256").update(finalPrompt).digest("hex");

  return {
    prompt: finalPrompt,
    promptHash,
    detectedFramework: framework,
  };
}
```

#### Performance: Batch Existing Test Discovery

```typescript
// src/integrate/prompt-builder.ts — faster existing test discovery

async function discoverExistingTests(repoRoot: string): Promise<string[]> {
  const testPatterns = [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*_test.py",
    "**/*_spec.rb",
  ];

  const allFiles: string[] = [];
  const testsDir = path.join(repoRoot, "tests");

  try {
    await fs.access(testsDir);
  } catch {
    return [];
  }

  // Use Promise.all for parallel pattern matching
  const patternResults = await Promise.all(
    testPatterns.map(async (pattern) => {
      const { glob } = await import("glob");
      try {
        return await glob(pattern, { cwd: testsDir, ignore: ["**/node_modules/**"] });
      } catch {
        return [];
      }
    })
  );

  for (const result of patternResults) {
    allFiles.push(...result);
  }

  return [...new Set(allFiles)];  // Dedupe
}
```

---

### Task 4: CLI Output Polish

#### Better Error Messages

Update error classification suggestions to be more actionable:

```typescript
// src/integrate/errors.ts — more actionable suggestions

const ERROR_SUGGESTIONS: Record<AIErrorType, string> = {
  rate_limit: "Rate limit hit. Will retry automatically. Consider using --delay to increase wait time, or switch to a faster/less congested model.",
  auth_failure: "Authentication failed. Check your FORGE_API_KEY environment variable or .env file. Ensure the key has not expired.",
  timeout: "Request timed out. Will retry automatically. Consider using --max-duration to limit total time spent.",
  parse_error: "AI returned malformed JSON. Try adjusting the model temperature, or use --force to retry with a fresh prompt.",
  api_error: "API server error (5xx). Will retry automatically. If this persists, check your API provider status page.",
  context_overflow: "Prompt exceeds model context window. Use --focus to narrow the workstream scope, or use a model with larger context.",
  unknown_error: "An unexpected error occurred. Check Forge logs at ~/.forge/logs/ for details. Use --force to retry.",
};
```

#### Color Output Control

Make `--auto` suppress color automatically:

```typescript
// src/integrate/cli.ts — auto color control

function shouldUseColor(options: IntegrateCommandOptions): boolean {
  if (options.auto) return false;  // --auto disables color
  return process.env.FORGE_NO_COLOR !== "true" && !process.argv.includes("--no-color");
}

// In output:
const statusIcon = summary.failed > 0 ? "✗" : "✓";
const dim = shouldUseColor(options) ? "" : "";
console.log(`${dim}${statusIcon} Integration complete.${shouldUseColor(options) ? "\x1b[0m" : ""}`);
```

#### Better Progress Output

Add staged progress output during long-running operations:

```typescript
// In runIntegrateCommand, add progress stages:
console.log("[1/5] Loading artifacts...");
const executeArtifact = await loadExecuteArtifact(repoRoot);

console.log("[2/5] Building integration prompt...");
const { prompt, promptHash, detectedFramework } = await buildIntegrationTestPrompt({...});

console.log("[3/5] Calling AI model...");
const result = await executeWorkstream(prompt, repoRoot);

console.log("[4/5] Generating test files...");
const testFiles = writeTestFilesParallel(...);

console.log("[5/5] Running integration tests...");
const testResult = await runIntegrationTestsParallel(...);
```

#### Report Polish

Improve `integration-report.md` with:
- Add a "How to Reproduce" section with exact `forge integrate` command
- Add a "Next Steps" checklist for failed tests
- Add attempt count display if > 1 attempt was needed
- Add a "Troubleshooting" section for common failure patterns

```typescript
// src/integrate/report.ts — enhanced report

export function createIntegrationReport(artifact: IntegrateArtifact): string {
  const { summary, tests, testFiles, workstreamsSummary, goal, recommendations, attemptCount } = artifact;

  const lines: string[] = [
    "# Forge Integration Report",
    "",
    `**Date:** ${artifact.createdAt}`,
    `**Goal:** ${goal}`,
    `**Attempts:** ${attemptCount ?? 1}`,
    "",
    "## How to Reproduce",
    "",
    "```bash",
    `forge integrate --repo .`,
    "```",
    "",
    // ... rest of existing sections ...

    "## Troubleshooting",
    "",
  ];

  if (summary.failed > 0) {
    lines.push(`- ${summary.failed} test(s) failed — review individual test errors above`);
    lines.push("- Check that all workstream changes were applied correctly");
    lines.push("- Verify the test framework is correctly detected");
    lines.push("- Try `forge integrate --force` to re-run from scratch");
    lines.push("- Check `forge integrate --help` for available flags");
  } else {
    lines.push("- All tests passed — no troubleshooting needed");
  }

  return lines.join("\n");
}
```

---

### Task 5: Freeze + Smoke

#### Freeze Boundary

Add explicit freeze boundary to `src/integrate/README.md` (create if missing) or `docs/S6-B2-Done/`:

```markdown
# Step 6 — INTEGRATE — V1 FROZEN

## Freeze Date: 2025-04-19

Step 6 integrate is frozen for V1. No new features will be added.
Future changes are limited to bug fixes only.

## What Was Shipped

- `forge integrate` — happy path (Batch 1)
- `--force` and `--auto` flags (Batch 2 Task 1)
- Robust JSON extraction (Batch 2 Task 2)
- Error classification + retry (Batch 2 Task 3)
- Missing artifact handling (Batch 2 Task 4)
- Freeze criteria (Batch 2 Task 5)
- Partial execute.json support (Batch 2 Task 6)
- Parallel test execution (Batch 3 Task 2)
- Prompt builder polish (Batch 3 Task 3)
- CLI output polish (Batch 3 Task 4)
- Smoke test + freeze sign-off (Batch 3 Task 5)

## V1 Non-Goals (Deferred)

- Config file (`forge.yaml`) integration for integrate settings
- Multiple test framework support per project
- Custom test file naming patterns
- Integration with external CI dashboards
- Test result caching for unchanged workstreams
- Concurrent AI model calls for multi-framework test generation
```

#### Smoke Test

Run the full smoke test suite:

```bash
npm run smoke
```

And add an integrate-specific smoke scenario:

```bash
# In scripts/smoke.mjs — add integrate smoke:
forge integrate --repo . --force
# Verify integrate.json is created
# Verify integration-report.md is created
# Verify all tests in integrate.json have valid ids
# Verify attemptCount is present and >= 1
```

#### Final Verification Checklist

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions from Batch 1 or 2)
- [ ] `npm run smoke` — PASS
- [ ] `forge integrate --help` shows all flags including new ones
- [ ] `--force` overwrites existing integrate.json
- [ ] `--auto` elevates warnings to errors
- [ ] `--json-only` skips report generation
- [ ] `--delay <n>` overrides retry delay
- [ ] `--max-retries <n>` overrides freeze max retries
- [ ] `--max-duration <ms>` overrides freeze max duration
- [ ] `--max-concurrency <n>` controls parallel test execution
- [ ] `attemptCount` appears in integrate.json after retry
- [ ] `attemptCount` appears in integration-report.md
- [ ] Context size warning appears for large prompts
- [ ] Color output is disabled in `--auto` mode
- [ ] Parallel test execution works for >= 5 test files
- [ ] All 5 Batch 2 Open Questions are answered in code

---

## Error Codes (Batch 3 — Additions)

| Code | Condition |
|------|-----------|
| `INTEGRATION_COMPLETE` | Integration succeeded on attempt N |
| `INTEGRATION_FROZEN` | Freeze criteria met, partial integration produced |
| `RATE_LIMITED` | Rate limit hit after exhausting retries |

---

## Completion

After all tasks done → create `docs/S6-B3-Done/` with p1-done through p5-done closeout docs.
