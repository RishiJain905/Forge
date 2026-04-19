# Integrate AI Call Pattern

## Key Decision

The `forge integrate` CLI (`src/integrate/cli.ts`) does **NOT** use `executeWorkstream()` from `model-connector.ts`. Instead, it calls `loadModelConfig()` + `callModel()` directly.

**Why:** `executeWorkstream()` internally calls `parseModelResponse()` which expects AI responses in `## CHANGES` format (with `file`/`action`/`content` fields). However, the integrate prompt expects the AI to return a plain JSON array of test files (with `path`/`content`/`language`/`framework`/`testCount` fields). Using `executeWorkstream` would fail with `PARSE_ERROR` because the response format doesn't match.

**Pattern:**
```typescript
const config = loadModelConfig();
const rawResponse = await callModel(prompt, config);
const modelUsed = `${config.provider}/${config.modelName}`;
const testFiles = parseTestFilesFromAIResponse(rawResponse);
```

**Contrast with execute step:** The `forge execute` CLI uses `executeWorkstream()` because it needs `## CHANGES` responses to write files. The `forge integrate` CLI does not write AI-generated changes — it only generates test files and runs them.
