# Step 6 Batch 2 — Integrate Hardening

## Goal

Harden `forge integrate` beyond the happy path. Batch 1 built the core flow. Batch 2 makes it resilient to edge cases, bad AI responses, partial inputs, and real-world CI/CD usage.

---

## Context Files (Read First)

- `src/integrate/cli.ts` — Current integrate CLI (Batch 1 output)
- `src/integrate/prompt-builder.ts` — Current prompt builder
- `src/integrate/test-runner.ts` — Current test runner
- `src/integrate/schema.ts` — Current Zod schemas
- `docs/S6-B1-Done/validation-contract.md` — Current validation contract (Batch 1)

---

## What This Batch Is

- Robust JSON extraction from messy AI responses (markdown, extra text, malformed JSON)
- `--force` flag to re-run even if `integrate.json` already exists
- `--auto` flag for fully non-interactive CI/CD usage
- Graceful handling when `plan.json` or `verify.json` is absent (not just warnings — actual fallback behavior)
- Freeze criteria for "done enough" — when to stop retrying and just report
- Better error classification — distinguish AI failure types (rate limit, parse error, timeout)
- Test framework override confirmation — validate the override actually exists
- Handling partial execute.json — some workstreams completed, some failed, some in unknown state
- Concurrency-safe test file generation — write multiple files in parallel
- Retry logic for transient AI failures (rate limits, network timeouts)

---

## What This Batch Is NOT

- A new AI model connector (reuse from Batch 1)
- Concurrent test execution (defer to Batch 3+ if needed)
- Performance benchmarking
- Automatic test fixing (AI writes tests, doesn't fix them)

---

## Architecture

### Where Batch 2 Fits

```
forge integrate (Batch 1: happy path works)
       ↓
forge integrate --force (Batch 2: re-run protection bypass)
forge integrate --auto (Batch 2: non-interactive mode)
       ↓
Better JSON parsing (Batch 2: messy AI responses)
Better error classification (Batch 2: rate limit vs parse vs timeout)
       ↓
forge integrate with missing plan.json/verify.json (Batch 2: graceful degradation)
       ↓
forge integrate with partial execute.json (Batch 2: mixed workstream states)
```

---

## File Structure

```
docs/step6_batch2/
├── SPEC.md           — This file
├── README.md         — Batch 2 index
├── progress.md       — Progress tracking

src/integrate/
├── cli.ts           MODIFY — add --force, --auto, retry logic, error classification
├── prompt-builder.ts MODIFY — (no changes expected for Batch 2)
├── test-runner.ts   MODIFY — parallel file writing, framework validation
├── schema.ts        MODIFY — extend IntegrateArtifact with retry count + error classification
└── types.ts         MODIFY — add RetryConfig, ErrorClassification, FreezeCriteria types

tests/integrate.cli.test.ts          MODIFY — add Batch 2 test scenarios
tests/integrate.test-runner.test.ts   MODIFY — add Batch 2 test scenarios
```

---

## Tasks

| # | Task | Description | Agent |
|---|------|-------------|-------|
| 1 | Flag Hardening | Implement `--force` and `--auto` flags with proper behavior | MiniMax |
| 2 | JSON Extraction | Robust AI response parsing with fallback strategies | MiniMax |
| 3 | Error Classification | Classify AI failures (rate_limit, parse_error, timeout, api_error) | MiniMax |
| 4 | Missing Artifact Handling | Graceful fallback when plan.json or verify.json is absent | MiniMax |
| 5 | Freeze Criteria | Define and implement "done enough" stopping conditions | MiniMax |
| 6 | Partial execute.json | Handle mixed workstream states (completed/failed/partial) | MiniMax |

---

## Task Details

### Task 1: Flag Hardening

#### `--force` Flag

Currently: `forge integrate` with existing `integrate.json` should check `--force` before proceeding.

```typescript
// src/integrate/cli.ts modifications

export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;      // NEW: re-run even if integrate.json exists
  auto?: boolean;      // NEW: non-interactive, fail on errors
  testFramework?: string;
}

// In runIntegrateCommand:
const integrateJsonPath = path.join(outputDir, "integrate.json");
const integrateExists = await fs.pathExists(integrateJsonPath);

if (integrateExists && !options.force) {
  return {
    status: "failed",
    summary: `integrate.json already exists at ${integrateJsonPath}. Use --force to re-run.`,
    artifactPath: integrateJsonPath,
    outputRoot: outputDir,
    failure: {
      code: "INTEGRATE_ALREADY_EXISTS",
      message: `integrate.json already exists. Run with --force to re-run integration.`,
    },
  };
}
```

#### `--auto` Flag

Non-interactive mode for CI/CD:

```typescript
// Behavior when auto is true:
// - All warnings become errors (missing plan/verify → failure, not warning)
// - No color output (FORGE_NO_COLOR=true)
// - Exit codes are strict: any failure → exit code 1
// - Progress output is minimal (--quiet equivalent)
// - No prompts for confirmation

if (options.auto) {
  // Elevate warnings to errors
  if (!planArtifact) {
    return failResult("plan.json not found. Use --auto requires plan.json.");
  }
  if (!verifyArtifact) {
    return failResult("verify.json not found. Use --auto requires verify.json.");
  }
}
```

---

### Task 2: JSON Extraction

AI responses are messy. Current parsing assumes clean JSON. Batch 2 adds robustness:

```typescript
// src/integrate/extract-json.ts — NEW utility

export interface JsonExtractResult {
  files: Array<{
    path: string;
    framework: string;
    language: string;
    content: string;
  }>;
  raw: string;          // The extracted JSON string
  method: string;      // Which extraction method worked
}

export function extractJsonFromAIResponse(response: string): JsonExtractResult {
  // Strategy 1: Try bare JSON array
  const bareArray = response.match(/\[[\s\S]*\]\s*$/);
  if (bareArray && isValidJson(bareArray[0])) {
    return parseJsonArray(bareArray[0], "bare-array");
  }

  // Strategy 2: Try JSON in ```json code blocks
  const codeBlock = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlock && isValidJson(codeBlock[1])) {
    return parseJsonArray(codeBlock[1], "code-block");
  }

  // Strategy 3: Try ```typescript ``` or ```tsx ``` code blocks
  const tsBlock = response.match(/```(?:typescript|tsx)\s*([\s\S]*?)\s*```/);
  if (tsBlock && isValidJson(tsBlock[1])) {
    return parseJsonArray(tsBlock[1], "typescript-block");
  }

  // Strategy 4: Try to find JSON array anywhere in text
  const embeddedArray = response.match(/\[[\s\S]*\]\s*(?:\n|$)/);
  if (embeddedArray && isValidJson(embeddedArray[0])) {
    return parseJsonArray(embeddedArray[0], "embedded-array");
  }

  // Strategy 5: Try to fix common JSON issues
  const fixed = fixJsonIssues(response);
  if (isValidJson(fixed)) {
    return parseJsonArray(fixed, "fixed-json");
  }

  throw new Error(`Could not extract valid JSON from AI response. Response preview: ${response.slice(0, 200)}...`);
}

function fixJsonIssues(text: string): string {
  // Remove trailing commas
  let fixed = text.replace(/,(\s*[}\]])/g, "$1");
  // Remove comments
  fixed = fixed.replace(/\/\/.*$/gm, "");
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, "");
  // Fix single quotes to double quotes (inside strings only — naively)
  // This is dangerous, so we only do it if we have a clear array pattern
  return fixed;
}
```

Update `cli.ts` to use the new extraction:

```typescript
// In runIntegrateCommand, replace the JSON parsing section:
let generatedFiles: Array<{...}> = [];

try {
  const extractResult = extractJsonFromAIResponse(rawResponse);
  console.log(`[AI] Extracted JSON via: ${extractResult.method}`);
  
  generatedFiles = extractResult.files.map((item, i) => ({
    path: item.path ?? `tests/integration/generated-test-${i + 1}.test.${detectedFramework.language === "python" ? "py" : "ts"}`,
    framework: item.framework ?? detectedFramework.name,
    language: item.language ?? detectedFramework.language,
    content: item.content ?? "",
  }));
} catch (err) {
  // Try the original simple approach as fallback before giving up
  const simpleMatch = rawResponse.match(/\[[\s\S]*\]\s*$/);
  if (simpleMatch) {
    try {
      const parsed = JSON.parse(simpleMatch[0]);
      if (Array.isArray(parsed)) {
        generatedFiles = parsed.map(...);
      }
    } catch { /* fall through to error */ }
  }
  
  if (generatedFiles.length === 0) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      summary: `Failed to parse AI response: ${message}`,
      artifactPath: "",
      outputRoot: repoRoot,
      failure: { code: "AI_GENERATION_FAILED", message: `Failed to parse AI response: ${message}` },
    };
  }
}
```

---

### Task 3: Error Classification

Classify AI failures so users know what went wrong and how to fix it:

```typescript
// src/integrate/types.ts — add new types

export type AIErrorType = 
  | "rate_limit"        // 429 — too many requests, back off and retry
  | "auth_failure"       // 401/403 — bad API key or insufficient permissions
  | "timeout"           // Request timed out
  | "parse_error"       // AI returned non-JSON or malformed response
  | "api_error"         // 500/502/503 from the API provider
  | "context_overflow"  // Prompt exceeds context window
  | "unknown_error";    // Something else

export interface RetryConfig {
  maxRetries: number;        // Default: 2
  initialDelayMs: number;     // Default: 1000
  backoffMultiplier: number;  // Default: 2
  retryableErrors: AIErrorType[];  // Which errors are worth retrying
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ["rate_limit", "timeout", "api_error"],
};

export interface ErrorClassification {
  type: AIErrorType;
  retryable: boolean;
  retryAfterMs?: number;   // For rate_limit — when to retry
  message: string;
  suggestion: string;      // User-facing actionable suggestion
}

export function classifyError(err: unknown): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);
  
  if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
    return {
      type: "rate_limit",
      retryable: true,
      retryAfterMs: extractRetryAfter(err),
      message,
      suggestion: "Rate limit hit. Will retry automatically. Consider using a slower model or adding delay.",
    };
  }
  
  if (message.includes("401") || message.includes("403") || message.toLowerCase().includes("auth")) {
    return {
      type: "auth_failure",
      retryable: false,
      message,
      suggestion: "Authentication failed. Check your API key in FORGE_API_KEY or .env file.",
    };
  }
  
  if (message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ECONNRESET")) {
    return {
      type: "timeout",
      retryable: true,
      retryAfterMs: 5000,
      message,
      suggestion: "Request timed out. Will retry automatically. Consider using a faster model.",
    };
  }
  
  if (message.includes("unexpected token") || message.includes("JSON.parse") || message.includes("Unexpected end")) {
    return {
      type: "parse_error",
      retryable: false,
      message,
      suggestion: "AI returned malformed response. The model may need temperature adjustment or prompt simplification.",
    };
  }
  
  if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("Bad gateway")) {
    return {
      type: "api_error",
      retryable: true,
      retryAfterMs: 10000,
      message,
      suggestion: "API server error. Will retry automatically. This is likely a temporary outage.",
    };
  }
  
  if (message.includes("context") && (message.includes("exceed") || message.includes("length"))) {
    return {
      type: "context_overflow",
      retryable: false,
      message,
      suggestion: "Prompt exceeds model context window. Consider reducing workstream scope or using a model with larger context.",
    };
  }
  
  return {
    type: "unknown_error",
    retryable: false,
    message,
    suggestion: "An unexpected error occurred. Check Forge logs for details.",
  };
}
```

Update CLI with retry loop:

```typescript
// In runIntegrateCommand, wrap AI call with retry:
let lastError: ErrorClassification;

for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
  try {
    const result = await executeWorkstream(prompt, repoRoot);
    // ... process result ...
    break; // Success, exit loop
  } catch (err) {
    const classified = classifyError(err);
    lastError = classified;
    
    console.error(`[AI] Error (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}): ${classified.type}`);
    console.error(`[AI] ${classified.suggestion}`);
    
    if (!classified.retryable) {
      // Non-retryable error, fail immediately
      return failResult(`AI call failed (${classified.type}): ${classified.message}`, classified);
    }
    
    if (attempt < retryConfig.maxRetries) {
      const delay = classified.retryAfterMs 
        ?? (retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt));
      console.log(`[AI] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

if (lastError && !lastError.retryable) {
  return failResult(`AI call failed: ${lastError.message}`, lastError);
}
```

---

### Task 4: Missing Artifact Handling

Currently, missing `plan.json` or `verify.json` produces a warning but proceeds. In `--auto` mode, this should fail. For non-auto mode, provide better fallback behavior:

```typescript
// Better stub creation for missing artifacts

function createPlanStub(executeArtifact: ExecuteArtifact): PlanArtifact {
  return {
    schemaVersion: "1.0.0",
    task: {
      goal: executeArtifact.workstreams[0]?.goal 
        ?? executeArtifact.workstreams[0]?.title 
        ?? "Unknown task",
    },
    items: executeArtifact.workstreams.map(ws => ({
      requirement: ws.title,
      category: "general",
      done: ws.state === "completed",
    })),
    goal: executeArtifact.workstreams[0]?.goal ?? "Unknown task",
  };
}

function createVerifyStub(): VerifyArtifact {
  return {
    schemaVersion: "1.0.0",
    findings: [],
    constraints: [],
    riskLevel: "none",
    riskZones: [],
  };
}

// In runIntegrateCommand:
if (!planArtifact) {
  if (options.auto) {
    return {
      status: "failed",
      summary: "plan.json not found. --auto mode requires plan.json.",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: { code: "PLAN_REQUIRED", message: "plan.json required for --auto mode" },
    };
  }
  planArtifact = createPlanStub(executeArtifact);
  console.warn("Warning: plan.json not found. Using stub from execute artifact.");
}

// Same for verify
```

---

### Task 5: Freeze Criteria

Define when to stop retrying and just produce the best artifact possible:

```typescript
// src/integrate/types.ts — add freeze criteria types

export interface FreezeCriteria {
  maxRetries: number;          // Total retry attempts before freezing
  maxDurationMs: number;        // Max time to spend on integration
  freezeOn: {
    rateLimitHit: boolean;     // Freeze if rate limited (don't wait for backoff)
    authFailure: boolean;      // Freeze immediately on auth failure
    parseFailure: boolean;     // Freeze after N parse failures
  };
}

export const DEFAULT_FREEZE_CRITERIA: FreezeCriteria = {
  maxRetries: 2,
  maxDurationMs: 300000,       // 5 minutes max
  freezeOn: {
    rateLimitHit: false,       // Wait out rate limits by default
    authFailure: true,         // Never retry auth failures
    parseFailure: true,         // Freeze on parse failure immediately
  },
};

// In IntegrateArtifact, track attempt count:
export interface IntegrateArtifact {
  // ... existing fields ...
  attemptCount: number;         // NEW: how many integration attempts were made
  frozenAt?: string;           // NEW: when integration froze (hit freeze criteria)
  finalError?: string;          // NEW: the error that caused freezing
}
```

When freeze criteria are met:
- Produce `integrate.json` with `frozenAt` and `finalError` set
- Report includes `[FROZEN]` badge
- Exit code is still 1 (not a full success)
- Report says "Integration frozen — not all tests could be verified"

---

### Task 6: Partial execute.json Handling

Handle the case where some workstreams completed and some failed:

```typescript
// In runIntegrateCommand, before AI call:

const completedWorkstreams = executeArtifact.workstreams.filter(ws => ws.state === "completed");
const failedWorkstreams = executeArtifact.workstreams.filter(ws => ws.state === "failed");
const partialWorkstreams = executeArtifact.workstreams.filter(ws => ws.state === "partial");

if (failedWorkstreams.length > 0 && completedWorkstreams.length === 0) {
  // All workstreams failed — warn but proceed (similar to current ALL_WORKSTREAMS_FAILED check)
  // Actually... this is already handled. Let's handle the mixed case:
}

if (options.auto && failedWorkstreams.length > 0) {
  // In auto mode with some failures, still proceed but note it
  console.warn(`Warning: ${failedWorkstreams.length}/${executeArtifact.workstreams.length} workstreams failed.`);
}

// Build a special prompt context for partial execution:
const partialContext = {
  hasFailures: failedWorkstreams.length > 0,
  hasPartial: partialWorkstreams.length > 0,
  failedWorkstreamIds: failedWorkstreams.map(ws => ws.workstreamId),
  partialWorkstreamIds: partialWorkstreams.map(ws => ws.workstreamId),
  // AI prompt should focus on what DID complete, not what failed
};
```

Update the prompt builder to include workstream health in context:

```typescript
// In buildIntegrationTestPrompt, add a health summary:
const workstreamHealth = `Workstream Health: ${completedWorkstreams.length} completed, ${failedWorkstreams.length} failed, ${partialWorkstreams.length} partial.
${failedWorkstreams.length > 0 ? `FAILED workstreams (tests may need to work around these): ${failedWorkstreams.map(ws => ws.workstreamId).join(", ")}` : ""}
${partialWorkstreams.length > 0 ? `PARTIAL workstreams: ${partialWorkstreams.map(ws => ws.workstreamId).join(", ")}` : ""}
`;

const prompt = `...${workstreamHealth}\n\n# ORIGINAL TASK GOAL\n${goal}\n...`;
```

---

## Verification

All tasks must pass before Step 6 Batch 2 is considered complete:

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions from Batch 1)
- [ ] `npm run smoke` — PASS
- [ ] `forge integrate --force` re-runs even with existing `integrate.json`
- [ ] `forge integrate --auto` with missing `plan.json` fails with `PLAN_REQUIRED`
- [ ] AI response with extra text before/after JSON is parsed correctly
- [ ] AI response in ```typescript ``` block (not ```json ```) is parsed correctly
- [ ] Rate limit error triggers retry with backoff
- [ ] Auth error fails immediately without retry
- [ ] Timeout triggers retry
- [ ] `forge integrate` with mixed workstream states (some failed, some completed) runs successfully
- [ ] `forge integrate` with all missing artifacts (no plan, no verify) produces stub and succeeds
- [ ] Freeze criteria stop retry loop and produce frozen artifact with `frozenAt` set

---

## Error Codes (Batch 2 — New)

| Code | Condition |
|------|-----------|
| `INTEGRATE_ALREADY_EXISTS` | `integrate.json` exists and `--force` not set |
| `PLAN_REQUIRED` | `--auto` mode but `plan.json` not found |
| `VERIFY_REQUIRED` | `--auto` mode but `verify.json` not found |
| `AI_RATE_LIMIT` | Classified rate limit error (after exhausting retries) |
| `AI_AUTH_FAILURE` | Classified auth error (not retryable) |
| `AI_TIMEOUT` | Classified timeout error (after exhausting retries) |
| `AI_PARSE_FAILURE` | Classified parse error (not retryable) |
| `AI_API_ERROR` | Classified API error (after exhausting retries) |
| `AI_CONTEXT_OVERFLOW` | Classified context overflow (not retryable) |
| `INTEGRATION_FROZEN` | Freeze criteria met, partial integration produced |

---

## Open Questions

1. Should `--force` also delete the old `integrate.json` or just overwrite it?
2. For rate limits — should we offer a `--delay` flag to manually set retry delay?
3. Should `--auto` also skip writing the human-readable `integration-report.md` (JSON only)?
4. Should we persist retry attempts to the artifact so users can see how many tries were needed?
5. Should freeze criteria be configurable via `config.yaml` or just CLI flags?
