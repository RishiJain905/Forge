# Step 6 Batch 3 — Task 3: Prompt Builder Polish

## Owner

MiniMax

## Status

**Pending**

## Context

The prompt builder reads files sequentially and has no context size warnings. This task optimizes performance and adds clarity improvements.

## Implementation

### Phase A: Parallel File Reads

Current `getChangedFileContents` reads files sequentially. Replace with parallel reads:

```typescript
// src/integrate/prompt-builder.ts — parallel file reads

export async function getChangedFileContents(
  executeArtifact: ExecuteArtifact,
  repoRoot: string
): Promise<Record<string, string>> {
  const fileReads: Array<{ file: string; path: string }> = [];

  for (const ws of executeArtifact.workstreams) {
    if (!ws.changesMade) continue;
    for (const change of ws.changesMade) {
      if (change.action === "delete") continue;
      const fullPath = path.isAbsolute(change.file)
        ? change.file
        : path.join(repoRoot, change.file);
      fileReads.push({ file: change.file, path: fullPath });
    }
  }

  // Parallel reads with per-file error handling
  const results = await Promise.all(
    fileReads.map(async ({ file, path: fullPath }) => {
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        return { file, content };
      } catch {
        return { file, content: `[FILE NOT FOUND: ${file}]` };
      }
    })
  );

  return Object.fromEntries(results.map((r) => [r.file, r.content]));
}
```

### Phase B: Batch Existing Test Discovery

Replace the recursive `findTests` function with a faster glob-based approach:

```typescript
// src/integrate/prompt-builder.ts — fast glob-based test discovery

async function discoverExistingTests(repoRoot: string): Promise<string[]> {
  const testsDir = path.join(repoRoot, "tests");
  const testPatterns = [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*_test.py",
    "**/*_spec.rb",
    "**/*.test.js",
    "**/*.spec.js",
  ];

  try {
    await fs.access(testsDir);
  } catch {
    return [];
  }

  const { glob } = await import("glob");

  const patternResults = await Promise.all(
    testPatterns.map(async (pattern) => {
      try {
        return await glob(pattern, {
          cwd: testsDir,
          ignore: ["**/node_modules/**", "**/dist/**"],
        });
      } catch {
        return [];
      }
    })
  );

  const allFiles: string[] = [];
  for (const result of patternResults) {
    allFiles.push(...result);
  }

  return [...new Set(allFiles)];
}
```

Update `buildIntegrationTestPrompt` to use the new discovery:

```typescript
// In buildIntegrationTestPrompt, replace the findTests block:
const existingTestsSection = await discoverExistingTests(repoRoot).then(
  (files) => files.length > 0 ? files.join("\n") : "(no existing tests found)"
);
```

### Phase C: Context Size Warning

Add a rough token estimate and warning for large prompts:

```typescript
// In buildIntegrationTestPrompt, after assembling the prompt:

// Rough token estimate (4 chars per token average)
const estimatedTokens = Math.ceil(prompt.length / 4);
const CONTEXT_WARNING_THRESHOLD = 100000; // ~100k tokens

let contextWarning = "";
if (estimatedTokens > CONTEXT_WARNING_THRESHOLD) {
  contextWarning = `\n\n⚠️ WARNING: Prompt is estimated at ~${estimatedTokens.toLocaleString()} tokens, ` +
    `which may approach context limits. Consider using --focus to narrow scope.`;
}

const finalPrompt = prompt + contextWarning;
const promptHash = crypto.createHash("sha256").update(finalPrompt).digest("hex");

return {
  prompt: finalPrompt,
  promptHash,
  detectedFramework: framework,
};
```

### Phase D: Add `getFileCount` Helper

Add a quick summary of how many files will be included:

```typescript
// In buildIntegrationTestPrompt, add a file summary:

const totalChangedFiles = Object.keys(changedFiles).length;
const filesSectionHeader = totalChangedFiles > 20
  ? `# CHANGED FILES (${totalChangedFiles} files — showing first 20)`
  : "# CHANGED FILES";

const filesSection = Object.entries(changedFiles)
  .slice(0, 20)  // Cap at 20 for very large change sets
  .map(([filePath, content]) => `FILE: ${filePath}\n---\n${content}\n---`)
  .join("\n\n");

if (totalChangedFiles > 20) {
  filesSection += `\n\n... and ${totalChangedFiles - 20} more files`;
}
```

## Test Coverage

Add to `tests/integrate.prompt-builder.test.ts`:

```typescript
it("getChangedFileContents reads files in parallel", async () => {
  // Mock fs.readFile to track concurrent calls
  // Verify Promise.all pattern is used
});

it("discoverExistingTests uses glob patterns", async () => {
  // Mock glob
  // Verify patterns are searched
});

it("context size warning appears for large prompts", async () => {
  // Create large execute artifact with many workstreams
  // Verify warning is included in prompt
});

it("changed files are capped at 20 with overflow note", async () => {
  // Create 25 changed files
  // Verify only 20 appear in prompt
  // Verify "... and 5 more files" message
});
```

## Files Modified

- `src/integrate/prompt-builder.ts` — parallel reads, glob discovery, context warning, file cap
- `tests/integrate.prompt-builder.test.ts` — add coverage

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- All new tests pass
- Large execute artifact triggers context warning
