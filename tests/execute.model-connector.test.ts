import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import {
  AIModelError,
  loadModelConfig,
  callModel,
  parseModelResponse,
  applyChanges,
  executeWorkstream,
  hashContent,
} from "../src/execute/model-connector.js";
import type { ModelConfig, AIModelChange, FetchLike } from "../src/execute/model-connector.js";

async function runScenario(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Helpers for mocking fetch and env vars
// ---------------------------------------------------------------------------

/** Create a mock fetch function that returns the given response. */
function mockFetch(responseBody: string, status = 200): FetchLike {
  return async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(responseBody, { status, headers: { "Content-Type": "application/json" } });
  };
}

/** Create a mock fetch that tracks calls and responds per-call. */
function mockFetchSequence(responses: Array<{ body: string; status: number }>): { fetch: FetchLike; calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  let callIndex = 0;
  const fetchFn: FetchLike = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    calls.push({ url: urlStr, body: init?.body?.toString() ?? "" });
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return new Response(resp.body, { status: resp.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch: fetchFn, calls };
}

const MODEL_ENV_KEYS = [
  "FORGE_MODEL_PROVIDER",
  "FORGE_MODEL_NAME",
  "FORGE_MODEL_API_KEY",
  "FORGE_MODEL_BASE_URL",
  "FORGE_MODEL",
  "FORGE_DEFAULT_MODEL",
  "FORGE_EXECUTE_DEFAULT_MODEL",
] as const;

/** Clear model-related env vars, then apply overrides (for isolated cwd tests). */
function modelEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of MODEL_ENV_KEYS) {
    out[k] = undefined;
  }
  Object.assign(out, overrides);
  return out;
}

/** Temporarily set env vars and restore them after the callback. */
async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

await runScenario("AIModelError has code, message, and originalError", async () => {
  const inner = new Error("socket hang up");
  const err = new AIModelError("API_ERROR", "Failed to call model", inner);
  assert.equal(err.name, "AIModelError");
  assert.equal(err.code, "API_ERROR");
  assert.equal(err.message, "Failed to call model");
  assert.equal(err.originalError, inner);
  assert.ok(err instanceof Error);
});

await runScenario("AIModelError works without originalError", async () => {
  const err = new AIModelError("MISSING_MODEL_CONFIG", "Provider not set");
  assert.equal(err.code, "MISSING_MODEL_CONFIG");
  assert.equal(err.originalError, undefined);
});

await runScenario("loadModelConfig reads env vars and returns ModelConfig", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test-key",
    FORGE_MODEL_BASE_URL: "https://api.custom-openai.com",
  }, async () => {
    const config = loadModelConfig();
    assert.equal(config.provider, "openai");
    assert.equal(config.modelName, "gpt-4o");
    assert.equal(config.apiKey, "sk-test-key");
    assert.equal(config.baseUrl, "https://api.custom-openai.com");
  });
});

await runScenario("loadModelConfig throws MISSING_MODEL_CONFIG when FORGE_MODEL_PROVIDER missing", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: undefined,
    FORGE_MODEL_NAME: "gpt-4o",
  }, async () => {
    assert.throws(
      () => loadModelConfig(),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "MISSING_MODEL_CONFIG"
    );
  });
});

await runScenario("loadModelConfig throws MISSING_MODEL_CONFIG when FORGE_MODEL_NAME missing", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: undefined,
  }, async () => {
    assert.throws(
      () => loadModelConfig(),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "MISSING_MODEL_CONFIG"
    );
  });
});

await runScenario("loadModelConfig makes API key optional for Ollama", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "ollama",
    FORGE_MODEL_NAME: "llama3",
    FORGE_MODEL_API_KEY: undefined,
  }, async () => {
    const config = loadModelConfig();
    assert.equal(config.provider, "ollama");
    assert.equal(config.apiKey, undefined);
  });
});

await runScenario("loadModelConfig reads FORGE_MODEL_BASE_URL override", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
    FORGE_MODEL_BASE_URL: "https://my-proxy.example.com",
  }, async () => {
    const config = loadModelConfig();
    assert.equal(config.baseUrl, "https://my-proxy.example.com");
  });
});

await runScenario("loadModelConfig sets default base URLs per provider", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "glm",
    FORGE_MODEL_NAME: "glm-4",
    FORGE_MODEL_API_KEY: "zhipuai-key",
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    assert.ok(config.baseUrl?.includes("bigmodel"), `GLM base URL should include bigmodel, got: ${config.baseUrl}`);
  });
});

await runScenario("parseModelResponse extracts JSON from markdown code block", async () => {
  const raw = `Here are the changes:

## CHANGES
\`\`\`json
[{"file": "src/foo.ts", "action": "modify", "content": "console.log(\\"hello\\")"}]
\`\`\`

That's all.`;

  const result = parseModelResponse(raw);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0]?.file, "src/foo.ts");
  assert.equal(result.changes[0]?.action, "modify");
  assert.equal(result.changes[0]?.content, 'console.log("hello")');
});

await runScenario("parseModelResponse handles multiple changes", async () => {
  const raw = `## CHANGES
\`\`\`json
[
  {"file": "src/a.ts", "action": "create", "content": "export const a = 1;"},
  {"file": "src/b.ts", "action": "delete"},
  {"file": "src/c.ts", "action": "modify", "content": "updated content"}
]
\`\`\``;

  const result = parseModelResponse(raw);
  assert.equal(result.changes.length, 3);
  assert.equal(result.changes[0]?.action, "create");
  assert.equal(result.changes[1]?.action, "delete");
  assert.equal(result.changes[2]?.action, "modify");
});

await runScenario("parseModelResponse throws PARSE_ERROR on invalid JSON", async () => {
  const raw = `## CHANGES
\`\`\`json
{this is not valid json}
\`\`\``;

  assert.throws(
    () => parseModelResponse(raw),
    (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "PARSE_ERROR"
  );
});

await runScenario("parseModelResponse throws PARSE_ERROR when no code block found", async () => {
  const raw = "I made some changes but didn't follow the format.";

  assert.throws(
    () => parseModelResponse(raw),
    (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "PARSE_ERROR"
  );
});

await runScenario("parseModelResponse throws PARSE_ERROR when JSON is not an array", async () => {
  const raw = `## CHANGES
\`\`\`json
{"file": "src/foo.ts", "action": "modify", "content": "x"}
\`\`\``;

  assert.throws(
    () => parseModelResponse(raw),
    (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "PARSE_ERROR"
  );
});

await runScenario("callModel sends correct request for OpenAI provider", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([{
    body: JSON.stringify({
      choices: [{ message: { content: "## CHANGES\n```json\n[]\n```" } }],
    }),
    status: 200,
  }]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn);
    assert.ok(result.includes("## CHANGES"), `result should include CHANGES section`);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]?.url.includes("/v1/chat/completions"), `URL should include /v1/chat/completions, got: ${calls[0]?.url}`);

    const body = JSON.parse(calls[0]?.body ?? "{}");
    assert.equal(body.model, "gpt-4o");
    assert.equal(body.messages[0]?.role, "user");
    assert.equal(body.messages[0]?.content, "test prompt");
  });
});

await runScenario("callModel sends correct request for Anthropic provider", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([{
    body: JSON.stringify({
      content: [{ type: "text", text: "## CHANGES\n```json\n[]\n```" }],
    }),
    status: 200,
  }]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "anthropic",
    FORGE_MODEL_NAME: "claude-3-5-sonnet-4",
    FORGE_MODEL_API_KEY: "ant-test",
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn);
    assert.ok(result.includes("## CHANGES"));
    assert.ok(calls[0]?.url.includes("/v1/messages"), `URL should include /v1/messages, got: ${calls[0]?.url}`);

    const body = JSON.parse(calls[0]?.body ?? "{}");
    assert.equal(body.model, "claude-3-5-sonnet-4");
    assert.equal(body.messages[0]?.role, "user");
  });
});

await runScenario("callModel sends correct request for Google provider", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([{
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: "## CHANGES\n```json\n[]\n```" }] } }],
    }),
    status: 200,
  }]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "google",
    FORGE_MODEL_NAME: "gemini-2.5-flash",
    FORGE_MODEL_API_KEY: "google-test",
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn);
    assert.ok(result.includes("## CHANGES"));
    // Google uses the API key as a query parameter
    assert.ok(calls[0]?.url.includes("key=google-test"), `URL should include API key as query param`);
    assert.ok(calls[0]?.url.includes("generateContent"), `URL should include generateContent`);
  });
});

await runScenario("callModel sends correct request for Ollama provider", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([{
    body: JSON.stringify({
      message: { content: "## CHANGES\n```json\n[]\n```" },
    }),
    status: 200,
  }]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "ollama",
    FORGE_MODEL_NAME: "llama3",
    FORGE_MODEL_API_KEY: undefined,
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn);
    assert.ok(result.includes("## CHANGES"));
    assert.ok(calls[0]?.url.includes("/api/chat"), `URL should include /api/chat, got: ${calls[0]?.url}`);

    const body = JSON.parse(calls[0]?.body ?? "{}");
    assert.equal(body.model, "llama3");
    assert.equal(body.stream, false);
  });
});

await runScenario("callModel sends correct request for GLM provider", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([{
    body: JSON.stringify({
      choices: [{ message: { content: "## CHANGES\n```json\n[]\n```" } }],
    }),
    status: 200,
  }]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "glm",
    FORGE_MODEL_NAME: "glm-4",
    FORGE_MODEL_API_KEY: "zhipu-test",
    FORGE_MODEL_BASE_URL: undefined,
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn);
    assert.ok(result.includes("## CHANGES"));
    // GLM uses OpenAI-compatible endpoint
    assert.ok(calls[0]?.url.includes("/v1/chat/completions"), `GLM URL should include /v1/chat/completions`);
    assert.ok(calls[0]?.url.includes("bigmodel"), `GLM URL should include bigmodel base URL`);
  });
});

await runScenario("callModel retries on 5xx errors (3 attempts)", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([
    { body: "internal error", status: 500 },
    { body: "internal error", status: 500 },
    { body: JSON.stringify({
      choices: [{ message: { content: "## CHANGES\n```json\n[]\n```" } }],
    }), status: 200 },
  ]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn, 0);
    assert.ok(result.includes("## CHANGES"));
    assert.equal(calls.length, 3, "should have made 3 calls (2 retries + 1 success)");
  });
});

await runScenario("callModel retries on 429 rate limit (3 attempts)", async () => {
  const { fetch: mockFetchFn, calls } = mockFetchSequence([
    { body: "rate limited", status: 429 },
    { body: JSON.stringify({
      choices: [{ message: { content: "## CHANGES\n```json\n[]\n```" } }],
    }), status: 200 },
  ]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const config = loadModelConfig();
    const result = await callModel("test prompt", config, mockFetchFn, 0);
    assert.ok(result.includes("## CHANGES"));
    assert.equal(calls.length, 2, "should have made 2 calls (1 retry + 1 success)");
  });
});

await runScenario("callModel throws API_ERROR on non-retryable 4xx", async () => {
  const { fetch: mockFetchFn } = mockFetchSequence([
    { body: JSON.stringify({ error: { message: "Invalid API key" } }), status: 401 },
  ]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "bad-key",
  }, async () => {
    const config = loadModelConfig();
    await assert.rejects(
      () => callModel("test prompt", config, mockFetchFn, 0),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "API_ERROR"
    );
  });
});

await runScenario("callModel throws API_ERROR after exhausting retries on persistent 5xx", async () => {
  const { fetch: mockFetchFn } = mockFetchSequence([
    { body: "error", status: 500 },
    { body: "error", status: 500 },
    { body: "error", status: 500 },
  ]);

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const config = loadModelConfig();
    await assert.rejects(
      () => callModel("test prompt", config, mockFetchFn, 0),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "API_ERROR"
    );
  });
});

await runScenario("callModel throws TIMEOUT when request exceeds timeout", async () => {
  // Create a fetch that never resolves, but we abort it via timeout
  const slowFetch = async () => {
    return new Promise<Response>((_resolve, reject) => {
      const timeout = setTimeout(() => {
        // Simulate abort
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      }, 50);
      // Never resolve normally
    });
  };

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const config = loadModelConfig();
    await assert.rejects(
      () => callModel("test prompt", config, slowFetch as FetchLike, 10),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "TIMEOUT"
    );
  });
});

await runScenario("applyChanges creates new files on disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  const changes: AIModelChange[] = [
    { file: "src/new-file.ts", action: "create", content: "export const x = 1;\n" },
  ];

  const results = await applyChanges(changes, tmpDir);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.path, "src/new-file.ts");
  assert.equal(results[0]?.action, "create");
  assert.ok(results[0]?.hash.length > 0, "should have a hash");
  assert.equal(results[0]?.linesAdded, 1);
  assert.equal(results[0]?.linesRemoved, 0);

  const written = await fs.readFile(path.join(tmpDir, "src", "new-file.ts"), "utf-8");
  assert.equal(written, "export const x = 1;\n");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("applyChanges modifies existing files on disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "existing.ts"), "old line 1\nold line 2\n");

  const changes: AIModelChange[] = [
    { file: "src/existing.ts", action: "modify", content: "new line 1\nnew line 2\nnew line 3\n" },
  ];

  const results = await applyChanges(changes, tmpDir);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.action, "modify");
  assert.equal(results[0]?.linesAdded, 3);
  assert.equal(results[0]?.linesRemoved, 2);

  const written = await fs.readFile(path.join(tmpDir, "src", "existing.ts"), "utf-8");
  assert.equal(written, "new line 1\nnew line 2\nnew line 3\n");

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("applyChanges deletes files on disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "to-delete.ts"), "will be deleted");

  const changes: AIModelChange[] = [
    { file: "src/to-delete.ts", action: "delete" },
  ];

  const results = await applyChanges(changes, tmpDir);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.action, "delete");
  assert.equal(results[0]?.linesRemoved, 1);
  assert.equal(results[0]?.linesAdded, 0);

  await assert.rejects(
    () => fs.readFile(path.join(tmpDir, "src", "to-delete.ts"), "utf-8"),
    /ENOENT/
  );

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("applyChanges returns ChangeResult with path, hash, lines added/removed", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  const changes: AIModelChange[] = [
    { file: "src/a.ts", action: "create", content: "line1\nline2\nline3\n" },
  ];

  const results = await applyChanges(changes, tmpDir);

  assert.equal(results[0]?.path, "src/a.ts");
  assert.ok(results[0]?.hash.length === 64, "SHA-256 hash should be 64 hex chars");
  assert.equal(results[0]?.linesAdded, 3);
  assert.equal(results[0]?.linesRemoved, 0);

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("applyChanges throws FILE_WRITE_ERROR on write failure", async () => {
  // Try to write to a read-only directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  // Create a file where a directory should be — causes ENOTDIR
  await fs.writeFile(path.join(tmpDir, "src"), "blocking file", { encoding: "utf-8" });

  const changes: AIModelChange[] = [
    { file: "src/nested/file.ts", action: "create", content: "content" },
  ];

  await assert.rejects(
    () => applyChanges(changes, tmpDir),
    (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "FILE_WRITE_ERROR"
  );

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("applyChanges throws FILE_DELETE_ERROR on delete failure", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  // Try to delete a file that doesn't exist
  const changes: AIModelChange[] = [
    { file: "nonexistent-file.ts", action: "delete" },
  ];

  await assert.rejects(
    () => applyChanges(changes, tmpDir),
    (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "FILE_DELETE_ERROR"
  );

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("executeWorkstream orchestrates full flow: loadConfig → callModel → parseResponse → applyChanges", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "target.ts"), "old content\n");

  const mockFetchFn = mockFetch(JSON.stringify({
    choices: [{ message: { content: '## CHANGES\n```json\n[{"file": "src/target.ts", "action": "modify", "content": "new content\\n"}]\n```' } }],
  }));

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const result = await executeWorkstream("implement feature X", tmpDir, mockFetchFn);

    assert.ok(result.modelUsed.includes("gpt-4o"), `modelUsed should include gpt-4o, got: ${result.modelUsed}`);
    assert.ok(result.promptHash.length === 64, `promptHash should be 64 hex chars, got length ${result.promptHash.length}`);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0]?.path, "src/target.ts");
    assert.equal(result.changes[0]?.action, "modify");

    const written = await fs.readFile(path.join(tmpDir, "src", "target.ts"), "utf-8");
    assert.equal(written, "new content\n");
  });

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("executeWorkstream returns ExecuteWorkstreamResult with all fields", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-connector-test-"));

  const mockFetchFn = mockFetch(JSON.stringify({
    choices: [{ message: { content: '## CHANGES\n```json\n[{"file": "src/new.ts", "action": "create", "content": "export const y = 2;\\n"}]\n```' } }],
  }));

  await withEnv({
    FORGE_MODEL_PROVIDER: "openai",
    FORGE_MODEL_NAME: "gpt-4o",
    FORGE_MODEL_API_KEY: "sk-test",
  }, async () => {
    const result = await executeWorkstream("add new module", tmpDir, mockFetchFn);

    assert.ok("modelUsed" in result);
    assert.ok("promptHash" in result);
    assert.ok("rawResponse" in result);
    assert.ok("changes" in result);
    assert.ok("provider" in result);
    assert.equal(result.provider, "openai");
    assert.ok(result.rawResponse.length > 0, "rawResponse should not be empty");
  });

  await fs.rm(tmpDir, { recursive: true });
});

await runScenario("hashContent returns consistent SHA-256 hash", async () => {
  const hash1 = hashContent("hello world");
  const hash2 = hashContent("hello world");
  const hash3 = hashContent("different content");

  assert.equal(hash1, hash2, "same content should produce same hash");
  assert.notEqual(hash1, hash3, "different content should produce different hash");
  assert.equal(hash1.length, 64, "SHA-256 hex digest should be 64 chars");

  // Verify against Node.js crypto directly
  const expected = crypto.createHash("sha256").update("hello world").digest("hex");
  assert.equal(hash1, expected);
});

await runScenario("loadModelConfig throws MISSING_MODEL_CONFIG for invalid provider", async () => {
  await withEnv({
    FORGE_MODEL_PROVIDER: "invalid_provider",
    FORGE_MODEL_NAME: "some-model",
  }, async () => {
    assert.throws(
      () => loadModelConfig(),
      (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "MISSING_MODEL_CONFIG"
    );
  });
});

await runScenario("loadModelConfig throws when no env and no explicit workspace model", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-model-isolated-"));
  try {
    await withEnv(modelEnv({}), async () => {
      assert.throws(
        () => loadModelConfig(dir),
        (err: unknown): err is AIModelError => err instanceof AIModelError && err.code === "MISSING_MODEL_CONFIG"
      );
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

await runScenario("loadModelConfig reads execute.default_model from .forge/config.yaml", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-model-yaml-"));
  try {
    await fs.mkdir(path.join(dir, ".forge"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".forge", "config.yaml"),
      "execute:\n  default_model: google/gemini-2.0-flash\n",
      "utf8",
    );
    await withEnv(modelEnv({}), async () => {
      const config = loadModelConfig(dir);
      assert.equal(config.provider, "google");
      assert.equal(config.modelName, "gemini-2.0-flash");
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

await runScenario("loadModelConfig prefers FORGE_MODEL over config file when env model pair unset", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-model-env-pref-"));
  try {
    await fs.mkdir(path.join(dir, ".forge"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".forge", "config.yaml"),
      "execute:\n  default_model: google/gemini-2.0-flash\n",
      "utf8",
    );
    await withEnv(modelEnv({ FORGE_MODEL: "anthropic/claude-3-5-haiku-20241022" }), async () => {
      const config = loadModelConfig(dir);
      assert.equal(config.provider, "anthropic");
      assert.equal(config.modelName, "claude-3-5-haiku-20241022");
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});