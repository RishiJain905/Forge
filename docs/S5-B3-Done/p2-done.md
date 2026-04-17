# Step 5 Batch 3 -- Task 2 Done

**Task:** AI Model Connector
**Agent:** GLM
**Completed:** 2025-04-17

## Files Created

- `src/execute/model-connector.ts` -- AI model connector module
- `tests/execute.model-connector.test.ts` -- Unit tests for model connector (32 scenarios)

## Files Modified

- `package.json` -- Added `execute.model-connector.test.js` to test script and `test:model-connector` convenience script

## What was built

### model-connector.ts

- `loadModelConfig(): ModelConfig` -- Reads `FORGE_MODEL_PROVIDER`, `FORGE_MODEL_NAME`, `FORGE_MODEL_API_KEY`, `FORGE_MODEL_BASE_URL` from env; throws `AIModelError(MISSING_MODEL_CONFIG)` on missing required vars; validates provider against allowed list; sets default base URLs per provider; API key optional for Ollama
- `callModel(prompt, config, fetchFn?, timeoutMs?): Promise<string>` -- Calls the configured AI model API; supports all 5 providers (OpenAI, Anthropic, Google, Ollama, GLM); injectable `fetchFn` for testing; retry on 5xx/429 (3 attempts, exponential backoff); `AIModelError(API_ERROR)` on non-retryable 4xx; `AIModelError(TIMEOUT)` on abort
- `parseModelResponse(raw): AIModelResponse` -- Extracts JSON from `## CHANGES\n```json` code block; validates array shape and required fields (file, action); throws `AIModelError(PARSE_ERROR)` on invalid/missing format
- `applyChanges(changes, repoRoot): Promise<ChangeResult[]>` -- Creates, modifies, or deletes files on disk; creates parent directories; returns `ChangeResult` with path, action, SHA-256 hash, linesAdded, linesRemoved; throws `AIModelError(FILE_WRITE_ERROR)` or `AIModelError(FILE_DELETE_ERROR)` on IO failures
- `executeWorkstream(prompt, repoRoot, fetchFn?): Promise<ExecuteWorkstreamResult>` -- Orchestrates the full flow: loadConfig → callModel → parseResponse → applyChanges; returns `ExecuteWorkstreamResult` with changes, modelUsed, promptHash (SHA-256), rawResponse
- `hashContent(content): string` -- SHA-256 hash utility
- `AIModelError` -- Custom error class with `code` (AIErrorCode), `message`, and optional `originalError`

### Provider Support

| Provider | Endpoint | Request Shape | Response Extraction |
|----------|----------|---------------|-------------------|
| OpenAI | `/v1/chat/completions` | `{model, messages}` | `choices[0].message.content` |
| Anthropic | `/v1/messages` | `{model, max_tokens, messages}` | `content[0].text` |
| Google | `/v1beta/models/{model}:generateContent` | `{contents}` | `candidates[0].content.parts[0].text` |
| Ollama | `/api/chat` | `{model, messages, stream: false}` | `message.content` |
| GLM | `/v1/chat/completions` (OpenAI-compatible at `open.bigmodel.cn`) | `{model, messages}` | `choices[0].message.content` |

### Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_MODEL_CONFIG` | Required env vars not set or invalid provider |
| `API_ERROR` | HTTP error from model provider (non-retryable or exhausted retries) |
| `PARSE_ERROR` | Model output could not be parsed as JSON changes array |
| `FILE_WRITE_ERROR` | Could not write a file to disk |
| `FILE_DELETE_ERROR` | Could not delete a file |
| `TIMEOUT` | Model call exceeded timeout |

## Verification

- `npm run typecheck` -- PASS
- `npm run build` -- PASS
- `tests/execute.model-connector.test.ts` -- 32/32 scenarios PASS
- `npm run test` -- ALL PASS (no regressions)
- `npm run smoke` -- PASS