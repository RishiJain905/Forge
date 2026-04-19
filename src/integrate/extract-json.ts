// ---------------------------------------------------------------------------
// Integrate step — JSON extraction from AI responses
// ---------------------------------------------------------------------------
// Robustly extracts JSON arrays of test file descriptors from messy AI model
// responses. AI output may contain markdown, extra text, trailing commas,
// comments, or code blocks in various languages. Six fallback strategies are
// tried in order until a valid array of IntegrationTestFile items is found.
//
// Exported:
//   JsonExtractResult           — result interface
//   extractJsonFromAIResponse() — main entrypoint
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { IntegrationTestFile } from "./types.js";

// ---------------------------------------------------------------------------
// Result interface
// ---------------------------------------------------------------------------

/** Result of extracting JSON from an AI response. */
export interface JsonExtractResult {
  /** Validated integration test file descriptors. */
  files: IntegrationTestFile[];
  /** The raw string that was successfully parsed. */
  raw: string;
  /** Name of the extraction strategy that succeeded. */
  method: string;
}

// ---------------------------------------------------------------------------
// Zod schema for individual items in the AI response array
// ---------------------------------------------------------------------------

/**
 * Validates a single test file item from the AI response array.
 * All fields are optional so that partially-specified items can still be
 * accepted and filled with sensible defaults.
 */
const TestFileItemSchema = z.object({
  path: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  content: z.string().optional(),
  testCount: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Default values for missing fields
// ---------------------------------------------------------------------------

let generatedCounter = 0;

/** Returns a unique default path for generated test files. */
function defaultPath(): string {
  generatedCounter += 1;
  return `tests/integration/generated-${generatedCounter}.test.ts`;
}

const DEFAULT_FRAMEWORK = "jest";
const DEFAULT_LANGUAGE = "typescript";
const DEFAULT_TEST_COUNT = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates an array of unknown items against TestFileItemSchema, skipping
 * invalid entries. Returns the list of valid IntegrationTestFile objects.
 */
function validateItems(items: unknown[]): IntegrationTestFile[] {
  const valid: IntegrationTestFile[] = [];

  for (const item of items) {
    // Skip non-objects (null, primitives, arrays)
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const parsed = TestFileItemSchema.safeParse(item);
    if (!parsed.success) {
      continue;
    }

    const data = parsed.data;
    valid.push({
      path: data.path ?? defaultPath(),
      framework: data.framework ?? DEFAULT_FRAMEWORK,
      language: data.language ?? DEFAULT_LANGUAGE,
      testCount: data.testCount ?? DEFAULT_TEST_COUNT,
      ...(data.content !== undefined ? { content: data.content } : {}),
    });
  }

  return valid;
}

/**
 * Attempts to parse a string as JSON, returning null on failure.
 */
function tryParseJson(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed as unknown[];
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

/**
 * Strategy: code-block-json
 * Extract JSON from ```json code blocks.
 */
function tryCodeBlock(response: string, lang: string): { raw: string; items: unknown[] } | null {
  // Match ```lang ... ``` blocks (lang may be followed by whitespace)
  const pattern = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "g");
  const matches = [...response.matchAll(pattern)];

  for (const match of matches) {
    const content = match[1].trim();
    const items = tryParseJson(content);
    if (items !== null) {
      return { raw: content, items };
    }
  }

  return null;
}

/**
 * Strategy: bare-array
 * The response starts with a JSON array (possibly after whitespace).
 */
function tryBareArray(response: string): { raw: string; items: unknown[] } | null {
  const trimmed = response.trim();
  if (!trimmed.startsWith("[")) {
    return null;
  }

  const items = tryParseJson(trimmed);
  if (items !== null) {
    return { raw: trimmed, items };
  }

  return null;
}

/**
 * Strategy: embedded-array
 * Find the first '[' and the matching ']' anywhere in the text.
 */
function tryEmbeddedArray(response: string): { raw: string; items: unknown[] } | null {
  const startIndex = response.indexOf("[");
  if (startIndex === -1) {
    return null;
  }

  // Find the matching closing bracket by tracking bracket depth
  let depth = 0;
  let endIndex = -1;

  for (let i = startIndex; i < response.length; i++) {
    if (response[i] === "[") {
      depth += 1;
    } else if (response[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const candidate = response.slice(startIndex, endIndex + 1);
  const items = tryParseJson(candidate);
  if (items !== null) {
    return { raw: candidate, items };
  }

  return null;
}

/**
 * Strategy: fixed-json
 * Fix trailing commas and strip JS-style comments, then try parsing again.
 */
function tryFixedJson(response: string): { raw: string; items: unknown[] } | null {
  let text = response;

  // Strip single-line comments (// ...)
  text = text.replace(/\/\/.*$/gm, "");

  // Strip multi-line comments (/* ... */)
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, "$1");

  // Now try embedded array on the fixed text
  const result = tryEmbeddedArray(text);
  if (result !== null) {
    return { raw: result.raw, items: result.items };
  }

  // Also try bare array on the fixed text
  const bareResult = tryBareArray(text);
  if (bareResult !== null) {
    return { raw: bareResult.raw, items: bareResult.items };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts a JSON array of test file descriptors from an AI model response.
 *
 * Six strategies are tried in order:
 *   1. code-block-json      — ```json code block
 *   2. code-block-typescript — ```typescript code block
 *   3. code-block-tsx       — ```tsx code block
 *   4. bare-array           — JSON array at the start of the response
 *   5. embedded-array       — JSON array found anywhere in the text
 *   6. fixed-json           — Fix trailing commas / strip comments, retry
 *
 * @throws Error if no valid test file items could be extracted.
 */
export function extractJsonFromAIResponse(response: string): JsonExtractResult {
  // Reset the generated counter for each call
  generatedCounter = 0;

  const strategies: Array<{
    method: string;
    run: () => { raw: string; items: unknown[] } | null;
  }> = [
    {
      method: "code-block-json",
      run: () => tryCodeBlock(response, "json"),
    },
    {
      method: "code-block-typescript",
      run: () => tryCodeBlock(response, "typescript"),
    },
    {
      method: "code-block-tsx",
      run: () => tryCodeBlock(response, "tsx"),
    },
    {
      method: "bare-array",
      run: () => tryBareArray(response),
    },
    {
      method: "embedded-array",
      run: () => tryEmbeddedArray(response),
    },
    {
      method: "fixed-json",
      run: () => tryFixedJson(response),
    },
  ];

  for (const strategy of strategies) {
    const result = strategy.run();
    if (result === null) {
      continue;
    }

    const files = validateItems(result.items);
    if (files.length === 0) {
      continue;
    }

    return {
      files,
      raw: result.raw,
      method: strategy.method,
    };
  }

  // No strategy produced valid items
  const preview = response.slice(0, 200);
  throw new Error(
    `Could not extract valid JSON from AI response. Response preview: ${preview}`
  );
}