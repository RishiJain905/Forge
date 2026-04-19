import assert from "node:assert/strict";

import { classifyError } from "../src/integrate/errors.js";
import type { AIErrorType, ErrorClassification } from "../src/integrate/types.js";

async function runScenario(
  name: string,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. classifyError classifies 429 as rate_limit
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 429 as rate_limit (retryable=true, suggestion includes Rate limit)",
  () => {
    const result = classifyError(new Error("HTTP 429 Too Many Requests"));
    assert.equal(result.type, "rate_limit");
    assert.equal(result.retryable, true);
    assert.ok(
      result.suggestion.includes("Rate limit"),
      `suggestion should include "Rate limit", got: ${result.suggestion}`
    );
  }
);

// ---------------------------------------------------------------------------
// 2. classifyError classifies "rate limit" text as rate_limit
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "rate limit" text as rate_limit',
  () => {
    const result = classifyError(new Error("You have hit the rate limit"));
    assert.equal(result.type, "rate_limit");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 3. classifyError extracts retry-after from rate limit message
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError extracts retry-after from rate limit message",
  () => {
    const result = classifyError(
      new Error("429 rate limit exceeded retry-after: 8")
    );
    assert.equal(result.type, "rate_limit");
    assert.equal(result.retryAfterMs, 8000);
  }
);

// ---------------------------------------------------------------------------
// 4. classifyError classifies 401 as auth_failure
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 401 as auth_failure (retryable=false, suggestion includes API key)",
  () => {
    const result = classifyError(new Error("HTTP 401 Unauthorized"));
    assert.equal(result.type, "auth_failure");
    assert.equal(result.retryable, false);
    assert.ok(
      result.suggestion.includes("API key"),
      `suggestion should include "API key", got: ${result.suggestion}`
    );
  }
);

// ---------------------------------------------------------------------------
// 5. classifyError classifies 403 as auth_failure
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 403 as auth_failure",
  () => {
    const result = classifyError(new Error("HTTP 403 Forbidden"));
    assert.equal(result.type, "auth_failure");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 6. classifyError classifies "auth" text as auth_failure
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "auth" text as auth_failure',
  () => {
    const result = classifyError(new Error("Authentication failed for user"));
    assert.equal(result.type, "auth_failure");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 7. classifyError classifies "timeout" as timeout
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "timeout" as timeout (retryable=true, retryAfterMs=5000)',
  () => {
    const result = classifyError(new Error("Request timeout after 30s"));
    assert.equal(result.type, "timeout");
    assert.equal(result.retryable, true);
    assert.equal(result.retryAfterMs, 5000);
  }
);

// ---------------------------------------------------------------------------
// 8. classifyError classifies ETIMEDOUT as timeout
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies ETIMEDOUT as timeout",
  () => {
    const result = classifyError(new Error("connect ETIMEDOUT 10.0.0.1:443"));
    assert.equal(result.type, "timeout");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 9. classifyError classifies ECONNRESET as timeout
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies ECONNRESET as timeout",
  () => {
    const result = classifyError(new Error("read ECONNRESET"));
    assert.equal(result.type, "timeout");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 10. classifyError classifies "unexpected token" as parse_error
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "unexpected token" as parse_error (retryable=false)',
  () => {
    const result = classifyError(new Error("unexpected token at position 0"));
    assert.equal(result.type, "parse_error");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 11. classifyError classifies "JSON.parse" as parse_error
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "JSON.parse" as parse_error',
  () => {
    const result = classifyError(new Error("JSON.parse failed to parse response"));
    assert.equal(result.type, "parse_error");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 12. classifyError classifies "Unexpected end" as parse_error
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "Unexpected end" as parse_error',
  () => {
    const result = classifyError(new Error("Unexpected end of JSON input"));
    assert.equal(result.type, "parse_error");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 13. classifyError classifies 500 as api_error
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 500 as api_error (retryable=true, retryAfterMs=10000)",
  () => {
    const result = classifyError(new Error("HTTP 500 Internal Server Error"));
    assert.equal(result.type, "api_error");
    assert.equal(result.retryable, true);
    assert.equal(result.retryAfterMs, 10000);
  }
);

// ---------------------------------------------------------------------------
// 14. classifyError classifies 502 as api_error
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 502 as api_error",
  () => {
    const result = classifyError(new Error("HTTP 502 Bad Gateway"));
    assert.equal(result.type, "api_error");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 15. classifyError classifies 503 as api_error
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies 503 as api_error",
  () => {
    const result = classifyError(new Error("HTTP 503 Service Unavailable"));
    assert.equal(result.type, "api_error");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 16. classifyError classifies "Bad gateway" as api_error
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "Bad gateway" as api_error',
  () => {
    const result = classifyError(new Error("Bad gateway response from upstream"));
    assert.equal(result.type, "api_error");
    assert.equal(result.retryable, true);
  }
);

// ---------------------------------------------------------------------------
// 17. classifyError classifies "context exceeds" as context_overflow
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "context exceeds" as context_overflow (retryable=false)',
  () => {
    const result = classifyError(new Error("context exceeds maximum size"));
    assert.equal(result.type, "context_overflow");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 18. classifyError classifies "context length" as context_overflow
// ---------------------------------------------------------------------------
await runScenario(
  'classifyError classifies "context length" as context_overflow',
  () => {
    const result = classifyError(new Error("context length too long"));
    assert.equal(result.type, "context_overflow");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 19. classifyError classifies unrecognized errors as unknown_error
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError classifies unrecognized errors as unknown_error",
  () => {
    const result = classifyError(new Error("something completely different"));
    assert.equal(result.type, "unknown_error");
    assert.equal(result.retryable, false);
  }
);

// ---------------------------------------------------------------------------
// 20. classifyError handles non-Error string objects
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError handles non-Error string objects",
  () => {
    const result = classifyError("plain 429 error string");
    assert.equal(result.type, "rate_limit");
    assert.equal(result.retryable, true);
    assert.equal(result.message, "plain 429 error string");
  }
);

// ---------------------------------------------------------------------------
// 21. classifyError returns non-empty suggestion for all 7 error types
// ---------------------------------------------------------------------------
await runScenario(
  "classifyError returns non-empty suggestion for all 7 error types",
  () => {
    const allTypes: AIErrorType[] = [
      "rate_limit",
      "auth_failure",
      "timeout",
      "parse_error",
      "api_error",
      "context_overflow",
      "unknown_error",
    ];

    const inputs: Record<AIErrorType, unknown> = {
      rate_limit: new Error("429"),
      auth_failure: new Error("401"),
      timeout: new Error("timeout"),
      parse_error: new Error("unexpected token"),
      api_error: new Error("500"),
      context_overflow: new Error("context exceeds limit"),
      unknown_error: new Error("bogus"),
    };

    for (const t of allTypes) {
      const result: ErrorClassification = classifyError(inputs[t]);
      assert.equal(
        result.type,
        t,
        `expected type ${t} but got ${result.type}`
      );
      assert.ok(
        result.suggestion.length > 0,
        `suggestion for ${t} should be non-empty`
      );
    }
  }
);