// ---------------------------------------------------------------------------
// Integrate step — AI error classification
// ---------------------------------------------------------------------------
// Classifies AI model call failures into typed categories so the CLI can
// decide whether to retry (transient errors) or fail immediately (permanent
// errors like auth failure or parse errors).
//
// Exported:
//   classifyError(err) — classify an unknown error into ErrorClassification
// ---------------------------------------------------------------------------

import type { AIErrorType, ErrorClassification } from "./types.js";

// ---------------------------------------------------------------------------
// extractRetryAfter — parse Retry-After from error message
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a Retry-After value (in milliseconds) from the error
 * message. Looks for patterns like "retry-after: 5" or "retry_after: 5".
 * Returns the default if no pattern is found.
 */
function extractRetryAfter(message: string, defaultMs = 5000): number {
  const match = message.match(/retry[_-]?after[:\s]*(\d+)/i);
  if (match) return parseInt(match[1], 10) * 1000;
  return defaultMs;
}

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

/**
 * Classify an unknown error from the AI model call into a typed
 * ErrorClassification. Determines whether the error is retryable and
 * provides a user-facing suggestion.
 */
export function classifyError(err: unknown): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);

  // Rate limit (429)
  if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
    return {
      type: "rate_limit",
      retryable: true,
      retryAfterMs: extractRetryAfter(message),
      message,
      suggestion: "Rate limit hit. Will retry automatically. Consider using a slower model or adding delay.",
    };
  }

  // Auth failure (401/403)
  if (message.includes("401") || message.includes("403") || message.toLowerCase().includes("auth")) {
    return {
      type: "auth_failure",
      retryable: false,
      message,
      suggestion: "Authentication failed. Check your API key in FORGE_API_KEY or .env file.",
    };
  }

  // Timeout
  if (message.includes("timeout") || message.includes("ETIMEDOUT") || message.includes("ECONNRESET")) {
    return {
      type: "timeout",
      retryable: true,
      retryAfterMs: 5000,
      message,
      suggestion: "Request timed out. Will retry automatically. Consider using a faster model.",
    };
  }

  // Parse error
  if (message.includes("unexpected token") || message.includes("JSON.parse") || message.includes("Unexpected end")) {
    return {
      type: "parse_error",
      retryable: false,
      message,
      suggestion: "AI returned malformed response. The model may need temperature adjustment or prompt simplification.",
    };
  }

  // API server error (500/502/503)
  if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("Bad gateway")) {
    return {
      type: "api_error",
      retryable: true,
      retryAfterMs: 10000,
      message,
      suggestion: "API server error. Will retry automatically. This is likely a temporary outage.",
    };
  }

  // Context overflow
  if (message.includes("context") && (message.includes("exceed") || message.includes("length"))) {
    return {
      type: "context_overflow",
      retryable: false,
      message,
      suggestion: "Prompt exceeds model context window. Consider reducing workstream scope or using a model with larger context.",
    };
  }

  // Unknown
  return {
    type: "unknown_error",
    retryable: false,
    message,
    suggestion: "An unexpected error occurred. Check Forge logs for details.",
  };
}