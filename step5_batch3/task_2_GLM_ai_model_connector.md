# Task 2: AI Model Connector

**Agent:** GLM
**Step:** 5.3.2

## Goal

Build the model-connector.ts module that calls the AI model, receives code changes, and writes them to disk. This is the AI execution engine — it takes the prompt from task 1, calls the configured model, parses the response, and applies changes.

## In Scope

- `src/execute/model-connector.ts` — new file
- Read model configuration from environment variables: `FORGE_MODEL_PROVIDER`, `FORGE_MODEL_NAME`, `FORGE_MODEL_API_KEY`, `FORGE_MODEL_BASE_URL`
- Support multiple providers: `openai` (OpenAI + compatible), `anthropic`, `google`, `ollama`, `glm`
- Call the model with the prompt from task 1
- Parse the model's JSON response (changes array: file, action, content)
- Apply changes to disk: create new files, modify existing files, delete files
- Track changes made: file path, diff hash, lines added/removed
- Handle errors: API errors, parse errors, file write errors, timeout
- Retry logic: retry on transient API errors (up to 3 attempts with backoff)
- Unit tests: `tests/execute.model-connector.test.ts`

## Out of Scope

- Building the prompt (task 1)
- CLI integration (task 3)
- Streaming output display (future)
- Multi-turn对话 / agentic loops
- Tool use / function calling (model returns structured JSON only)

## Task List

1. Read environment variable configuration from `process.env`
2. Design the `ModelConfig` interface:
   ```typescript
   interface ModelConfig {
     provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'glm';
     modelName: string;
     apiKey?: string;
     baseUrl?: string;
   }
   ```
3. Design the `AIModelResponse` interface:
   ```typescript
   interface AIModelResponse {
     changes: Array<{
       file: string;
       action: 'create' | 'modify' | 'delete';
       content?: string; // required for create/modify
     }>;
   }
   ```
4. Implement `src/execute/model-connector.ts`:
   - `loadModelConfig(): ModelConfig` — reads env vars, throws if required vars missing
   - `callModel(prompt: string, config: ModelConfig): Promise<string>` — calls the API
   - `parseModelResponse(raw: string): AIModelResponse` — parses JSON from model output
   - `applyChanges(changes: AIModelResponse['changes'], repoRoot: string): Promise<ChangeResult[]>`
   - `executeWorkstream(prompt: string, repoRoot: string): Promise<ExecuteWorkstreamResult>`
5. Implement provider-specific API calls:
   - OpenAI: `POST /v1/chat/completions` with `gpt-4o` / `gpt-4.5`
   - Anthropic: `POST /v1/messages` with `claude-4` / `claude-3.7`
   - Google: `POST /v1beta/models/{model}:generateContent` with `gemini-2.5-flash`
   - Ollama: `POST /api/chat` with local model
   - GLM: OpenAI-compatible with `zhipuai` base URL
6. Add retry logic with exponential backoff for transient errors
7. Error handling: wrap all errors in `AIModelError` with code, message, and original error
8. Write `tests/execute.model-connector.test.ts` — mock the API calls

## API Response Parsing

The model returns a JSON array in a code block. Parse it robustly:
```
## CHANGES
```json
[{"file": "src/foo.ts", "action": "modify", "content": "..."}]
```
```

Extract the JSON from the markdown code block. If parsing fails, throw `AIModelError` with code `PARSE_ERROR`.

## Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_MODEL_CONFIG` | Required env vars not set |
| `API_ERROR` | HTTP error from model provider |
| `PARSE_ERROR` | Model output could not be parsed as JSON |
| `FILE_WRITE_ERROR` | Could not write a file to disk |
| `FILE_DELETE_ERROR` | Could not delete a file |
| `TIMEOUT` | Model call exceeded timeout |

## Acceptance Criteria

- [ ] `model-connector.ts` exists and exports `executeWorkstream`
- [ ] `loadModelConfig()` reads `FORGE_MODEL_PROVIDER`, `FORGE_MODEL_NAME`; throws if missing
- [ ] `FORGE_MODEL_API_KEY` is optional (some providers like Ollama don't need it)
- [ ] OpenAI, Anthropic, Google, Ollama, and GLM providers are all supported
- [ ] API errors are wrapped in `AIModelError` with `API_ERROR` code
- [ ] Parse errors are wrapped in `AIModelError` with `PARSE_ERROR` code
- [ ] File write errors are wrapped in `AIModelError` with `FILE_WRITE_ERROR` code
- [ ] Transient API errors (5xx, rate limit) are retried up to 3 times with backoff
- [ ] `applyChanges` returns an array of `ChangeResult` with path, hash, lines added/removed
- [ ] Unit tests pass: `npm run test -- --grep "model-connector"`
- [ ] TypeScript compiles: `npm run typecheck`
