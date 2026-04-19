import assert from "node:assert/strict";

import { extractJsonFromAIResponse } from "../src/integrate/extract-json.js";

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

// 1. json code block extraction
await runScenario(
  "code-block-json extracts path and reports correct method",
  () => {
    const response =
      'Here are the files:\n```json\n[{"path":"tests/api.test.ts","testCount":3,"language":"typescript","framework":"jest","content":"describe(\\"api\\",()=>{})"}]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files[0].path, "tests/api.test.ts");
    assert.equal(result.method, "code-block-json");
  }
);

// 2. typescript code block with JSON inside
await runScenario(
  "code-block-typescript extracts JSON from ts code block",
  () => {
    const response =
      '```typescript\n[{"path":"tests/ts.test.ts","testCount":1,"language":"typescript","framework":"jest"}]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.method, "code-block-typescript");
    assert.equal(result.files[0].path, "tests/ts.test.ts");
  }
);

// 3. tsx code block with JSON inside
await runScenario(
  "code-block-tsx extracts JSON from tsx code block",
  () => {
    const response =
      '```tsx\n[{"path":"tests/component.test.tsx","testCount":2,"language":"typescript","framework":"jest"}]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.method, "code-block-tsx");
    assert.equal(result.files[0].path, "tests/component.test.tsx");
  }
);

// 4. Bare JSON array at start
await runScenario(
  "bare-array detects JSON array at start of response",
  () => {
    const response =
      '[{"path":"tests/bare.test.ts","testCount":1,"language":"typescript","framework":"jest"}]';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.method, "bare-array");
    assert.equal(result.files[0].path, "tests/bare.test.ts");
  }
);

// 5. Embedded JSON array with text before/after
await runScenario(
  "embedded-array finds JSON array surrounded by text",
  () => {
    const response =
      'Some intro text here.\n[{"path":"tests/embedded.test.ts","testCount":2,"language":"typescript","framework":"jest"}]\nSome trailing text.';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, "tests/embedded.test.ts");
    assert.equal(result.method, "embedded-array");
  }
);

// 6. Trailing commas handled
await runScenario(
  "trailing commas are handled by fixed-json strategy",
  () => {
    const response =
      'Here:\n```json\n[{"path":"tests/comma.test.ts","testCount":1,"language":"typescript","framework":"jest",}]\n```';
    // The code-block-json strategy won't parse this due to trailing comma,
    // so fixed-json should eventually handle it.
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, "tests/comma.test.ts");
  }
);

// 7. Comments in JSON stripped by fixed-json
await runScenario(
  "comments in JSON are stripped by fixed-json strategy",
  () => {
    const response =
      "// a comment before\n[{\n// this is a comment\n\"path\":\"tests/commented.test.ts\",\"testCount\":1,\"language\":\"typescript\",\"framework\":\"jest\"\n/* multi-line\n   comment */}]";
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.method, "fixed-json");
    assert.equal(result.files[0].path, "tests/commented.test.ts");
  }
);

// 8. No valid JSON anywhere — throws Error
await runScenario(
  "throws Error when no valid JSON is found",
  () => {
    const response = "This is just plain text with no JSON at all.";
    assert.throws(
      () => extractJsonFromAIResponse(response),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Could not extract valid JSON"));
        return true;
      }
    );
  }
);

// 9. Strategy method names correct for json block, ts block, bare array
await runScenario(
  "strategy method names are correct for each strategy",
  () => {
    const jsonBlock =
      '```json\n[{"path":"a.test.ts","testCount":1,"language":"typescript","framework":"jest"}]\n```';
    assert.equal(extractJsonFromAIResponse(jsonBlock).method, "code-block-json");

    const tsBlock =
      '```typescript\n[{"path":"b.test.ts","testCount":1,"language":"typescript","framework":"jest"}]\n```';
    assert.equal(
      extractJsonFromAIResponse(tsBlock).method,
      "code-block-typescript"
    );

    const bareArray =
      '[{"path":"c.test.ts","testCount":1,"language":"typescript","framework":"jest"}]';
    assert.equal(extractJsonFromAIResponse(bareArray).method, "bare-array");
  }
);

// 10. Defaults applied for missing fields
await runScenario(
  "defaults are applied for missing fields (testCount, language, framework, content)",
  () => {
    const response =
      '```json\n[{"path":"minimal.test.ts"}]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, "minimal.test.ts");
    assert.equal(result.files[0].testCount, 0);
    assert.equal(result.files[0].language, "typescript");
    assert.equal(result.files[0].framework, "jest");
    assert.equal(result.files[0].content, undefined);
  }
);

// 11. Multiple items in array
await runScenario(
  "multiple items in array are all returned",
  () => {
    const response =
      '```json\n[{"path":"tests/first.test.ts","testCount":1,"language":"typescript","framework":"jest"},{"path":"tests/second.test.ts","testCount":2,"language":"typescript","framework":"vitest"}]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].path, "tests/first.test.ts");
    assert.equal(result.files[0].testCount, 1);
    assert.equal(result.files[1].path, "tests/second.test.ts");
    assert.equal(result.files[1].framework, "vitest");
    assert.equal(result.files[1].testCount, 2);
  }
);

// 12. Non-array JSON object in code block — throws Error
await runScenario(
  "throws Error for non-array JSON object in code block",
  () => {
    const response =
      '```json\n{"path":"tests/not-array.test.ts","testCount":1,"language":"typescript","framework":"jest"}\n```';
    assert.throws(
      () => extractJsonFromAIResponse(response),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Could not extract valid JSON"));
        return true;
      }
    );
  }
);

// 13. Non-object items in array skipped, valid items kept
await runScenario(
  "non-object items in array are skipped, valid objects are kept",
  () => {
    const response =
      '```json\n[1, "str", {"path":"valid.test.ts","testCount":1,"language":"typescript","framework":"jest"}, null, true]\n```';
    const result = extractJsonFromAIResponse(response);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, "valid.test.ts");
  }
);

// 14. raw field contains the matched JSON string and is valid JSON
await runScenario(
  "raw field contains the matched JSON string and is valid JSON",
  () => {
    const jsonStr =
      '[{"path":"tests/raw.test.ts","testCount":5,"language":"typescript","framework":"jest","content":"test(\\"raw\\",()=>{})"}]';
    const response = `\`\`\`json\n${jsonStr}\n\`\`\``;
    const result = extractJsonFromAIResponse(response);
    const parsed = JSON.parse(result.raw);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].path, "tests/raw.test.ts");
  }
);

// 15. Empty array [] — throws Error
await runScenario(
  "throws Error for empty array",
  () => {
    const response = "[]";
    assert.throws(
      () => extractJsonFromAIResponse(response),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Could not extract valid JSON"));
        return true;
      }
    );
  }
);