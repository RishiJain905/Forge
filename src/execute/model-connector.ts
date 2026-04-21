import { promises as fs } from "fs";
import path from "node:path";
import crypto from "node:crypto";

import { getConfiguredModelIdFromWorkspace } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelProvider = "openai" | "anthropic" | "google" | "ollama" | "glm";

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AIModelChange {
  file: string;
  action: "create" | "modify" | "delete";
  content?: string;
}

export interface AIModelResponse {
  changes: AIModelChange[];
}

export interface ChangeResult {
  path: string;
  action: "create" | "modify" | "delete";
  hash: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface ExecuteWorkstreamResult {
  changes: ChangeResult[];
  modelUsed: string;
  promptHash: string;
  rawResponse: string;
  provider: ModelProvider;
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const AI_ERROR_CODES = {
  MISSING_MODEL_CONFIG: "MISSING_MODEL_CONFIG",
  API_ERROR: "API_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  FILE_WRITE_ERROR: "FILE_WRITE_ERROR",
  FILE_DELETE_ERROR: "FILE_DELETE_ERROR",
  TIMEOUT: "TIMEOUT",
  PATH_TRAVERSAL: "PATH_TRAVERSAL",
} as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

// ---------------------------------------------------------------------------
// AIModelError
// ---------------------------------------------------------------------------

export class AIModelError extends Error {
  code: AIErrorCode;
  originalError?: Error;

  constructor(code: AIErrorCode, message: string, originalError?: Error) {
    super(message);
    this.name = "AIModelError";
    this.code = code;
    this.originalError = originalError;
  }
}

// ---------------------------------------------------------------------------
// Default base URLs per provider
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULT_BASE_URLS: Record<ModelProvider, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  ollama: "http://localhost:11434",
  glm: "https://open.bigmodel.cn/api/paas",
};

const VALID_PROVIDERS: Set<string> = new Set<ModelProvider>([
  "openai",
  "anthropic",
  "google",
  "ollama",
  "glm",
]);

// ---------------------------------------------------------------------------
// hashContent
// ---------------------------------------------------------------------------

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// loadModelConfig
// ---------------------------------------------------------------------------

function parseProviderModelId(raw: string): { provider: ModelProvider; modelName: string } {
  const trimmed = raw.trim();
  /** OpenAI-compatible hosts often configure only the model path segment. */
  const normalized = trimmed.includes("/")
    ? trimmed
    : VALID_PROVIDERS.has(trimmed)
      ? null
      : `openai/${trimmed}`;

  if (normalized === null) {
    throw new AIModelError(
      AI_ERROR_CODES.MISSING_MODEL_CONFIG,
      `Invalid model id "${raw}". Use provider/model (e.g. openai/gpt-4o), not a provider name alone.`
    );
  }

  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash >= normalized.length - 1) {
    throw new AIModelError(
      AI_ERROR_CODES.MISSING_MODEL_CONFIG,
      `Invalid model id "${raw}". Expected provider/model (e.g. openai/gpt-4o).`
    );
  }
  const provider = normalized.slice(0, slash);
  const modelName = normalized.slice(slash + 1);
  if (!VALID_PROVIDERS.has(provider)) {
    throw new AIModelError(
      AI_ERROR_CODES.MISSING_MODEL_CONFIG,
      `Invalid provider in "${raw}". Must be one of: ${[...VALID_PROVIDERS].join(", ")}`
    );
  }
  return { provider: provider as ModelProvider, modelName };
}

/**
 * Resolves model provider, name, API key, and base URL for AI calls.
 * Prefer `FORGE_MODEL_PROVIDER` + `FORGE_MODEL_NAME` when both are set; otherwise
 * uses `execute.default_model` / `forge.default_model` from `.forge/config.yaml`
 * or from `FORGE_EXECUTE_DEFAULT_MODEL` / `FORGE_MODEL` / `FORGE_DEFAULT_MODEL` env
 * (see `getConfiguredModelIdFromWorkspace`).
 *
 * @param cwd Repository root used to resolve `.forge/config.yaml` (default: `process.cwd()`).
 */
export function loadModelConfig(cwd: string = process.cwd()): ModelConfig {
  const apiKey = process.env.FORGE_MODEL_API_KEY;
  const baseUrl = process.env.FORGE_MODEL_BASE_URL;

  const envProvider = process.env.FORGE_MODEL_PROVIDER;
  const envName = process.env.FORGE_MODEL_NAME;

  let provider: ModelProvider;
  let modelName: string;

  if (envProvider && envName) {
    if (!VALID_PROVIDERS.has(envProvider)) {
      throw new AIModelError(
        AI_ERROR_CODES.MISSING_MODEL_CONFIG,
        `Invalid FORGE_MODEL_PROVIDER "${envProvider}". Must be one of: ${[...VALID_PROVIDERS].join(", ")}`
      );
    }
    provider = envProvider as ModelProvider;
    modelName = envName;
  } else if (envProvider || envName) {
    throw new AIModelError(
      AI_ERROR_CODES.MISSING_MODEL_CONFIG,
      "Set both FORGE_MODEL_PROVIDER and FORGE_MODEL_NAME, or omit both and configure execute.default_model / forge.default_model (e.g. in .forge/config.yaml or via FORGE_MODEL)."
    );
  } else {
    const fromWorkspace = getConfiguredModelIdFromWorkspace(cwd);
    if (!fromWorkspace) {
      throw new AIModelError(
        AI_ERROR_CODES.MISSING_MODEL_CONFIG,
        "No model configured. Set FORGE_MODEL_PROVIDER and FORGE_MODEL_NAME, or set execute.default_model / forge.default_model in .forge/config.yaml (e.g. anthropic/claude-3-5-sonnet-20241022), or set FORGE_MODEL=provider/model."
      );
    }
    const parsed = parseProviderModelId(fromWorkspace);
    provider = parsed.provider;
    modelName = parsed.modelName;
  }

  const resolvedBaseUrl = baseUrl || PROVIDER_DEFAULT_BASE_URLS[provider];

  return {
    provider,
    modelName,
    apiKey,
    baseUrl: resolvedBaseUrl,
  };
}

/** Non-null message when {@link loadModelConfig} would throw for this repo root. */
export function getModelConfigError(cwd: string = process.cwd()): string | null {
  try {
    loadModelConfig(cwd);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** True when {@link loadModelConfig} would succeed for the given repo root. */
export function isModelConfigured(cwd: string = process.cwd()): boolean {
  return getModelConfigError(cwd) === null;
}

// ---------------------------------------------------------------------------
// callModel
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function getBackoffMs(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s
  return Math.pow(2, attempt) * 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchLike = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function callModel(
  prompt: string,
  config: ModelConfig,
  fetchFn?: FetchLike,
  timeoutMs?: number
): Promise<string> {
  const fetch = fetchFn ?? globalThis.fetch;
  const timeout = timeoutMs ?? 120_000;

  const { url, body, headers } = buildProviderRequest(prompt, config);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseBody = await response.text();
        return extractContent(responseBody, config.provider);
      }

      if (RETRYABLE_STATUSES.has(response.status)) {
        lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(getBackoffMs(attempt));
          continue;
        }
        throw new AIModelError(
          AI_ERROR_CODES.API_ERROR,
          `API request failed after ${MAX_RETRIES} retries: ${lastError.message}`,
          lastError
        );
      }

      // Non-retryable error
      const errorText = await response.text();
      throw new AIModelError(
        AI_ERROR_CODES.API_ERROR,
        `API request failed with HTTP ${response.status}: ${errorText}`
      );
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof AIModelError) {
        throw err;
      }

      if (err instanceof Error && err.name === "AbortError") {
        throw new AIModelError(
          AI_ERROR_CODES.TIMEOUT,
          `Model call timed out after ${timeout}ms`
        );
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES - 1) {
        await sleep(getBackoffMs(attempt));
        continue;
      }

      throw new AIModelError(
        AI_ERROR_CODES.API_ERROR,
        `API request failed after ${MAX_RETRIES} retries: ${lastError.message}`,
        lastError
      );
    }
  }

  // Should not reach here, but just in case
  throw new AIModelError(
    AI_ERROR_CODES.API_ERROR,
    `API request failed after ${MAX_RETRIES} retries`,
    lastError
  );
}

// ---------------------------------------------------------------------------
// Provider request builders
// ---------------------------------------------------------------------------

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Join `base` (OpenAI-compatible root, often `https://host` or `https://host/v1`)
 * with an absolute path that normally starts with `/v1/...`, avoiding `/v1/v1/`.
 */
function joinOpenAiCompatibleBase(base: string, pathFromRoot: string): string {
  const b = base.replace(/\/+$/, "");
  const p = pathFromRoot.startsWith("/") ? pathFromRoot : `/${pathFromRoot}`;
  if (/\/v1$/i.test(b) && p.toLowerCase().startsWith("/v1/")) {
    return `${b}${p.slice("/v1".length)}`;
  }
  return `${b}${p}`;
}

function buildProviderRequest(prompt: string, config: ModelConfig): ProviderRequest {
  const base = config.baseUrl ?? PROVIDER_DEFAULT_BASE_URLS[config.provider];

  switch (config.provider) {
    case "openai":
      return {
        url: joinOpenAiCompatibleBase(base, "/v1/chat/completions"),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey ?? ""}`,
        },
        body: {
          model: config.modelName,
          messages: [{ role: "user", content: prompt }],
        },
      };

    case "anthropic":
      return {
        url: joinOpenAiCompatibleBase(base, "/v1/messages"),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: config.modelName,
          max_tokens: 8192,
          messages: [{ role: "user", content: prompt }],
        },
      };

    case "google":
      return {
        url: `${base}/v1beta/models/${config.modelName}:generateContent?key=${config.apiKey ?? ""}`,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
        },
      };

    case "ollama":
      return {
        url: `${base}/api/chat`,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          model: config.modelName,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        },
      };

    case "glm":
      return {
        url: joinOpenAiCompatibleBase(base, "/v1/chat/completions"),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey ?? ""}`,
        },
        body: {
          model: config.modelName,
          messages: [{ role: "user", content: prompt }],
        },
      };
  }
}

// ---------------------------------------------------------------------------
// extractContent — extract the text content from a provider response
// ---------------------------------------------------------------------------

function extractContent(responseBody: string, provider: ModelProvider): string {
  try {
    const parsed = JSON.parse(responseBody);

    switch (provider) {
      case "openai":
      case "glm":
        // OpenAI-compatible: response.choices[0].message.content
        return parsed?.choices?.[0]?.message?.content ?? "";

      case "anthropic":
        // Anthropic: response.content[0].text
        return parsed?.content?.[0]?.text ?? "";

      case "google":
        // Google: response.candidates[0].content.parts[0].text
        return parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      case "ollama":
        // Ollama: response.message.content
        return parsed?.message?.content ?? "";
    }
  } catch {
    throw new AIModelError(
      AI_ERROR_CODES.PARSE_ERROR,
      `Failed to parse ${provider} response as JSON: ${responseBody.slice(0, 200)}`
    );
  }
}

// ---------------------------------------------------------------------------
// parseModelResponse
// ---------------------------------------------------------------------------

export function parseModelResponse(raw: string): AIModelResponse {
  // Look for the ## CHANGES section with a json code block
  const changesMatch = raw.match(/##\s*CHANGES\s*\n```json\s*\n([\s\S]*?)\n```/);

  if (!changesMatch) {
    throw new AIModelError(
      AI_ERROR_CODES.PARSE_ERROR,
      "Could not find ## CHANGES json code block in model response"
    );
  }

  const jsonStr = changesMatch[1];
  if (!jsonStr) {
    throw new AIModelError(
      AI_ERROR_CODES.PARSE_ERROR,
      "Empty JSON in ## CHANGES code block"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new AIModelError(
      AI_ERROR_CODES.PARSE_ERROR,
      `Failed to parse JSON from model response: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new AIModelError(
      AI_ERROR_CODES.PARSE_ERROR,
      "Model response JSON is not an array"
    );
  }

  // Validate each item has required fields
  const changes: AIModelChange[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      throw new AIModelError(
        AI_ERROR_CODES.PARSE_ERROR,
        `Invalid change item in model response: ${JSON.stringify(item)}`
      );
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.file !== "string" || typeof obj.action !== "string") {
      throw new AIModelError(
        AI_ERROR_CODES.PARSE_ERROR,
        `Change item missing required 'file' or 'action' field: ${JSON.stringify(item)}`
      );
    }
    if (obj.action !== "create" && obj.action !== "modify" && obj.action !== "delete") {
      throw new AIModelError(
        AI_ERROR_CODES.PARSE_ERROR,
        `Invalid action "${obj.action}" in change item: must be "create", "modify", or "delete"`
      );
    }
    changes.push({
      file: obj.file,
      action: obj.action,
      content: typeof obj.content === "string" ? obj.content : undefined,
    });
  }

  return { changes };
}

// ---------------------------------------------------------------------------
// countLines
// ---------------------------------------------------------------------------

/**
 * Count the number of lines in a string.
 * A trailing newline does not create an extra empty line.
 * "a\nb\n" → 2 lines, "a\nb" → 2 lines, "" → 0 lines
 */
function countLines(content: string): number {
  if (content === "") return 0;
  // Remove trailing newline if present, then split
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.split("\n").length;
}

// ---------------------------------------------------------------------------
// applyChanges
// ---------------------------------------------------------------------------

export async function applyChanges(
  changes: AIModelChange[],
  repoRoot: string
): Promise<ChangeResult[]> {
  const results: ChangeResult[] = [];

  for (const change of changes) {
    // Reject absolute paths before resolving
    if (path.isAbsolute(change.file)) {
      throw new AIModelError(
        AI_ERROR_CODES.PATH_TRAVERSAL,
        `Path traversal detected: absolute path not allowed: ${change.file}`
      );
    }

    const absolutePath = path.resolve(repoRoot, change.file);

    // Verify resolved path stays within repoRoot
    const relativePath = path.relative(repoRoot, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new AIModelError(
        AI_ERROR_CODES.PATH_TRAVERSAL,
        `Path traversal detected: "${change.file}" resolves outside repo root to ${absolutePath}`
      );
    }

    try {
      switch (change.action) {
        case "create":
        case "modify": {
          if (!change.content && change.content !== "") {
            throw new AIModelError(
              AI_ERROR_CODES.FILE_WRITE_ERROR,
              `Content is required for "${change.action}" action on file: ${change.file}`
            );
          }

          // Ensure parent directories exist
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });

          // Read old content for diff if modifying
          let oldContent: string | null = null;
          if (change.action === "modify") {
            try {
              oldContent = await fs.readFile(absolutePath, "utf-8");
            } catch {
              // File doesn't exist yet — treat like create
            }
          }

          const newContent = change.content;
          await fs.writeFile(absolutePath, newContent, "utf-8");

          const newLines = countLines(newContent);
          const oldLines = oldContent ? countLines(oldContent) : 0;

          results.push({
            path: change.file,
            action: change.action,
            hash: hashContent(newContent),
            linesAdded: newLines,
            linesRemoved: oldLines,
          });
          break;
        }

        case "delete": {
          let oldLines = 0;
          try {
            const oldContent = await fs.readFile(absolutePath, "utf-8");
            oldLines = countLines(oldContent);
          } catch {
            // File doesn't exist — throw FILE_DELETE_ERROR below
            throw new Error(`ENOENT: no such file '${absolutePath}'`);
          }

          await fs.unlink(absolutePath);

          results.push({
            path: change.file,
            action: "delete",
            hash: "",
            linesAdded: 0,
            linesRemoved: oldLines,
          });
          break;
        }
      }
    } catch (err) {
      if (err instanceof AIModelError) {
        throw err;
      }

      if (change.action === "delete") {
        throw new AIModelError(
          AI_ERROR_CODES.FILE_DELETE_ERROR,
          `Failed to delete file ${change.file}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined
        );
      }

      throw new AIModelError(
        AI_ERROR_CODES.FILE_WRITE_ERROR,
        `Failed to ${change.action} file ${change.file}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// executeWorkstream
// ---------------------------------------------------------------------------

export async function executeWorkstream(
  prompt: string,
  repoRoot: string,
  fetchFn?: FetchLike
): Promise<ExecuteWorkstreamResult> {
  const config = loadModelConfig(repoRoot);
  const promptHash = hashContent(prompt);

  const rawResponse = await callModel(prompt, config, fetchFn);
  const parsed = parseModelResponse(rawResponse);
  const changes = await applyChanges(parsed.changes, repoRoot);

  return {
    changes,
    modelUsed: `${config.provider}/${config.modelName}`,
    promptHash,
    rawResponse,
    provider: config.provider,
  };
}