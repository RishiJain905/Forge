# Step 6 Batch 2 — Task 2: Robust JSON Extraction

## Owner

MiniMax

## Status

**Pending**

## Context

AI responses are messy. Current JSON parsing in `cli.ts` assumes clean JSON. This task adds robust extraction with multiple fallback strategies.

## Implementation

Create a new utility file `src/integrate/extract-json.ts`:

```typescript
import { z } from "zod";

const TestFileSchema = z.object({
  path: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  content: z.string().optional(),
});

const TestFilesArraySchema = z.array(TestFileSchema);

export interface JsonExtractResult {
  files: Array<{
    path: string;
    framework: string;
    language: string;
    content: string;
  }>;
  raw: string;
  method: string;
}

export function extractJsonFromAIResponse(response: string): JsonExtractResult {
  const strategies: Array<() => JsonExtractResult | null> = [
    () => tryParseJsonBlock(response, "json"),
    () => tryParseJsonBlock(response, "typescript"),
    () => tryParseJsonBlock(response, "tsx"),
    () => tryParseBareArray(response),
    () => tryParseEmbeddedArray(response),
    () => tryParseAndFixJson(response),
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result) return result;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Could not extract valid JSON from AI response. Response preview: ${response.slice(0, 300)}...`
  );
}

function tryParseJsonBlock(
  response: string,
  lang: string
): JsonExtractResult | null {
  const pattern = new RegExp(`\`\`\`${lang}[\\s\\S]*?\`\`\``, "i");
  const match = response.match(pattern);
  if (!match) return null;

  const block = match[0]
    .replace(new RegExp(`\`\`\`${lang}`, "i"), "")
    .replace(/```$/, "")
    .trim();

  return tryParseArray(block, `code-block-${lang}`);
}

function tryParseBareArray(response: string): JsonExtractResult | null {
  const match = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;
  return tryParseArray(match[0], "bare-array");
}

function tryParseEmbeddedArray(response: string): JsonExtractResult | null {
  const match = response.match(/\[[\s\S]*\]\s*(?:\n|$)/);
  if (!match) return null;
  return tryParseArray(match[0], "embedded-array");
}

function tryParseAndFixJson(response: string): JsonExtractResult | null {
  let fixed = response
    .replace(/,\s*([}\]])/g, "$1")      // Remove trailing commas
    .replace(/\/\/.*$/gm, "")           // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "")   // Remove multi-line comments
    .replace(/,\s*\}/g, "}")            // Remove trailing commas in objects
    .replace(/,\s*\]/g, "]");           // Remove trailing commas in arrays

  const match = fixed.match(/\[[\s\S]*\]\s*/);
  if (!match) return null;
  return tryParseArray(match[0], "fixed-json");
}

function tryParseArray(text: string, method: string): JsonExtractResult | null {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;

    const files = parsed.map((item: unknown, i: number) => {
      const obj = item as Record<string, unknown>;
      return {
        path:
          typeof obj.path === "string"
            ? obj.path
            : `tests/integration/generated-${i + 1}.test.ts`,
        framework:
          typeof obj.framework === "string" ? obj.framework : "jest",
        language:
          typeof obj.language === "string" ? obj.language : "typescript",
        content: typeof obj.content === "string" ? obj.content : "",
      };
    });

    return { files, raw: text, method };
  } catch {
    return null;
  }
}
```

Update `src/integrate/cli.ts` to use the new extractor instead of the simple regex match:

```typescript
import { extractJsonFromAIResponse } from "./extract-json.js";

// In the AI response parsing section, replace the simple JSON match with:
let generatedFiles: Array<{ path: string; framework: string; language: string; content: string }> = [];

try {
  const extractResult = extractJsonFromAIResponse(rawResponse);
  console.log(`[AI] Parsed JSON via: ${extractResult.method}`);
  
  generatedFiles = extractResult.files;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "failed",
    summary: `Failed to parse AI response: ${message}`,
    artifactPath: "",
    outputRoot: repoRoot,
    failure: { code: "AI_GENERATION_FAILED", message: `Failed to parse AI response: ${message}` },
  };
}
```

## Files Created

- `src/integrate/extract-json.ts` — NEW utility

## Files Modified

- `src/integrate/cli.ts`

## Tests

Add to `tests/integrate.cli.test.ts` or create `tests/integrate.extract-json.test.ts`:

- AI response with ` ```json ` code block → parses correctly
- AI response with ` ```typescript ` code block → parses correctly
- AI response with bare JSON array → parses correctly
- AI response with extra text before/after JSON → parses correctly
- AI response with trailing commas → parses correctly after fix
- AI response with comments → parses correctly after stripping
- AI response with no valid JSON → fails with helpful error
- Each parsing strategy reports the correct `method` name

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- All extraction strategies listed above pass their tests
