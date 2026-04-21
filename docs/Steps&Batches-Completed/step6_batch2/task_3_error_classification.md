# Step 6 Batch 2 — Task 3: Error Classification + Retry

## Owner

MiniMax

## Status

**Pending**

## Context

AI calls fail in different ways — rate limits, timeouts, bad auth, malformed responses. Classify each error type and implement retry with exponential backoff for transient failures.

## Implementation

### New Types (`src/integrate/types.ts`)

```typescript
export type AIErrorType =
  | "rate_limit"
  | "auth_failure"
  | "timeout"
  | "parse_error"
  | "api_error"
  | "context_overflow"
  | "unknown_error";

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: AIErrorType[];
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
  retryAfterMs?: number;
  message: string;
  suggestion: string;
}
```

### Error Classifier (`src/integrate/errors.ts`)

```typescript
import type { AIErrorType, ErrorClassification } from "./types.js";

export function classifyError(err: unknown): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
    return {
      type: "rate_limit",
      retryable: true,
      retryAfterMs: extractRetryAfter(message),
      message,
      suggestion: "Rate limit hit. Will retry automatically.",
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

  if (
    message.includes("timeout") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET")
  ) {
    return {
      type: "timeout",
      retryable: true,
      retryAfterMs: 5000,
      message,
      suggestion: "Request timed out. Will retry automatically.",
    };
  }

  if (
    message.includes("unexpected token") ||
    message.includes("JSON.parse") ||
    message.includes("Unexpected end")
  ) {
    return {
      type: "parse_error",
      retryable: false,
      message,
      suggestion: "AI returned malformed response. The model may need temperature adjustment.",
    };
  }

  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("Bad gateway")
  ) {
    return {
      type: "api_error",
      retryable: true,
      retryAfterMs: 10000,
      message,
      suggestion: "API server error. Will retry automatically.",
    };
  }

  if (message.includes("context") && (message.includes("exceed") || message.includes("length"))) {
    return {
      type: "context_overflow",
      retryable: false,
      message,
      suggestion: "Prompt exceeds model context window. Reduce workstream scope.",
    };
  }

  return {
    type: "unknown_error",
    retryable: false,
    message,
    suggestion: "An unexpected error occurred.",
  };
}

function extractRetryAfter(message: string): number {
  const match = message.match(/retry[_-]?after[:\s]*(\d+)/i);
  if (match) return parseInt(match[1], 10) * 1000;
  return 5000;
}
```

### Retry Loop in CLI (`src/integrate/cli.ts`)

Update the AI call section in `runIntegrateCommand`:

```typescript
import { classifyError, DEFAULT_RETRY_CONFIG } from "./types.js";
import { extractJsonFromAIResponse } from "./extract-json.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAIWithRetry(
  prompt: string,
  repoRoot: string,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ response: string; modelUsed: string; aiConfig: AIModelInfo }> {
  let lastError: ErrorClassification | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await executeWorkstream(prompt, repoRoot);
      return result;
    } catch (err) {
      const classified = classifyError(err);
      lastError = classified;

      if (!classified.retryable) {
        throw new Error(`[${classified.type}] ${classified.message}`);
      }

      if (attempt < retryConfig.maxRetries) {
        const delay = classified.retryAfterMs
          ?? retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
        console.error(`[AI] ${classified.type} (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})`);
        console.error(`[AI] ${classified.suggestion}`);
        console.error(`[AI] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`[${lastError?.type ?? "unknown_error"}] ${lastError?.message ?? "Max retries exceeded"}`);
}
```

Replace the direct `executeWorkstream` call in `runIntegrateCommand` with:

```typescript
let rawResponse = "";
let aiModelUsed = "";
let aiConfig: AIModelInfo | undefined;

try {
  const result = await callAIWithRetry(prompt, repoRoot);
  rawResponse = result.response ?? "";
  aiModelUsed = result.modelUsed;
  aiConfig = result.aiConfig;
} catch (err) {
  const classified = classifyError(err);
  return {
    status: "failed",
    summary: `AI call failed (${classified.type}): ${classified.message}`,
    artifactPath: "",
    outputRoot: repoRoot,
    failure: {
      code: `AI_${classified.type.toUpperCase().replace("_", "")}`,
      message: `${classified.message}\nSuggestion: ${classified.suggestion}`,
    },
  };
}
```

## Files Created

- `src/integrate/errors.ts` — NEW error classification utility

## Files Modified

- `src/integrate/types.ts` — add AIErrorType, RetryConfig, ErrorClassification types
- `src/integrate/cli.ts` — add retry loop, use classifyError

## New Error Codes

| Code | Type | Retryable |
|------|------|-----------|
| `AI_RATELIMIT` | rate_limit | After backoff |
| `AI_AUTHFAILURE` | auth_failure | No |
| `AI_TIMEOUT` | timeout | After backoff |
| `AI_PARSEERROR` | parse_error | No |
| `AI_APIERROR` | api_error | After backoff |
| `AI_CONTEXTOVERFLOW` | context_overflow | No |
| `AI_UNKNOWN` | unknown_error | No |

## Tests

Add to `tests/integrate.cli.test.ts`:

- Rate limit error triggers retry with backoff
- Auth error fails immediately without retry
- Timeout triggers retry
- Parse error fails immediately without retry
- API error (500) triggers retry
- Context overflow fails immediately without retry
- Max retries exceeded → final error reported correctly

Add unit tests for `classifyError`:

- Classifies 429 as rate_limit
- Classifies 401/403 as auth_failure
- Classifies timeout as timeout
- Classifies JSON parse errors as parse_error
- Classifies 500/502/503 as api_error
- Classifies context length errors as context_overflow
- Unknown errors default to unknown_error

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- Classified errors are logged with type and suggestion
- Retry loop respects maxRetries and backoffMultiplier
