# Step 6 Batch 2 Part 3 Done — Error Classification + Retry

## Implemented Spec
- `step6_batch2/task_3_error_classification.md`

## What Changed
- Added `AIErrorType`, `RetryConfig`, `DEFAULT_RETRY_CONFIG`, and `ErrorClassification` types to `src/integrate/types.ts`.
- Created `src/integrate/errors.ts` — error classification utility with `classifyError()` function.
- Modified `src/integrate/cli.ts` — Step 5 now uses a retry loop with exponential backoff; non-retryable errors fail immediately with SPEC-compliant error codes.
- Added `tests/integrate.errors.test.ts` — unit tests for all 7 error type classifications.
- Updated `tests/integrate.cli.test.ts` — added CLI-level retry behavior tests; updated existing test for classified error codes.

## Error Classification Table

| Error Type | Triggers | Retryable | Error Code | Default Delay |
|---|---|---|---|---|
| `rate_limit` | 429, "rate limit" | Yes | `AI_RATE_LIMIT` | From Retry-After header, else 5000ms |
| `auth_failure` | 401, 403, "auth" | No | `AI_AUTH_FAILURE` | — |
| `timeout` | "timeout", ETIMEDOUT, ECONNRESET | Yes | `AI_TIMEOUT` | 5000ms |
| `parse_error` | "unexpected token", "JSON.parse", "Unexpected end" | No | `AI_PARSE_FAILURE` | — |
| `api_error` | 500, 502, 503, "Bad gateway" | Yes | `AI_API_ERROR` | 10000ms |
| `context_overflow` | "context" + "exceed"/"length" | No | `AI_CONTEXT_OVERFLOW` | — |
| `unknown_error` | Everything else | No | `AI_UNKNOWN` | — |

## Key Design Decisions
- Retry loop is implemented inline in `runIntegrateCommand` Step 5 (not as a separate exported function) — keeps it close to the call site and avoids adding another exported symbol.
- Retry delay uses the classified `retryAfterMs` when available (e.g., from HTTP Retry-After headers), falling back to exponential backoff: `initialDelayMs * backoffMultiplier^attempt`.
- Both `retryConfig.retryableErrors.includes(classified.type)` AND `classified.retryable` must be true for retry — the config can further restrict which types are retried.
- Non-retryable errors (auth_failure, parse_error, context_overflow, unknown_error) fail immediately with a SPEC-compliant error code.
- The `aiErrorTypeToCode()` helper maps `AIErrorType` to SPEC error codes, with special cases for `parse_error` → `AI_PARSE_FAILURE` and `unknown_error` → `AI_UNKNOWN`.
- `extractRetryAfter()` parses `Retry-After` / `retry_after` patterns from the error message string, converting seconds to milliseconds.
- Default retry config: 2 retries, 1000ms initial delay, 2x backoff multiplier.

## Key Files
- `src/integrate/types.ts` (modified — added 48 lines)
- `src/integrate/errors.ts` (new — 111 lines)
- `src/integrate/cli.ts` (modified — retry loop + helpers)
- `tests/integrate.errors.test.ts` (new)
- `tests/integrate.cli.test.ts` (modified — updated + 2 new scenarios)

## Test Coverage
- `tests/integrate.errors.test.ts` — 21 scenarios:
  - rate_limit: 429, "rate limit" text, Retry-After extraction
  - auth_failure: 401, 403, "auth" text
  - timeout: "timeout", ETIMEDOUT, ECONNRESET
  - parse_error: "unexpected token", "JSON.parse", "Unexpected end"
  - api_error: 500, 502, 503, "Bad gateway"
  - context_overflow: "context exceeds", "context length"
  - unknown_error: unrecognized errors, non-Error objects
  - Cross-type: suggestion present for all 7 types, SPEC error code format verification

- `tests/integrate.cli.test.ts` — 2 new scenarios:
  - SPEC error code format matches expected AI_<TYPE> patterns
  - AI call failure produces classified error code (not generic AI_GENERATION_FAILED)
  - Plus: existing test updated from `AI_GENERATION_FAILED` to `AI_UNKNOWN`

## Commits
- `007247a` — feat(step6-batch2): add AI error classification types (task 3)
- `56fb06b` — feat(step6-batch2): add error classification module (task 3)
- `759d8e9` — test(step6-batch2): add error classification unit tests (task 3)
- `f7f335e` — feat(step6-batch2): add retry loop with error classification (task 3)
- `54bb23a` — test(step6-batch2): add CLI retry behavior tests (task 3)

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `node dist-tests/tests/integrate.errors.test.js` — 21/21 PASS
- `node dist-tests/tests/integrate.cli.test.js` — ALL PASS (no regressions)
- `node dist-tests/tests/integrate.extract-json.test.js` — ALL PASS

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 2 Task 3 (Error Classification + Retry) is complete and verified.

## Follow-On
- Next Step 6 Batch 2 target: Task 4 (Missing Artifact Handling)