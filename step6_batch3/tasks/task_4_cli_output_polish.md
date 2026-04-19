# Step 6 Batch 3 — Task 4: CLI Output Polish

## Owner

MiniMax

## Status

**Pending**

## Context

Polish CLI output, error messages, and the integration report for better clarity and usability.

## Implementation

### Phase A: More Actionable Error Suggestions

Update `src/integrate/errors.ts` with more actionable error suggestions:

```typescript
// src/integrate/errors.ts — enhanced suggestions

const ERROR_SUGGESTIONS: Record<AIErrorType, string> = {
  rate_limit: "Rate limit hit. Will retry automatically. Consider using --delay to increase wait time, or switch to a faster/less congested model.",
  auth_failure: "Authentication failed. Check your FORGE_API_KEY environment variable or .env file. Ensure the key has not expired.",
  timeout: "Request timed out. Will retry automatically. Consider using --max-duration to limit total time spent.",
  parse_error: "AI returned malformed JSON. Try adjusting the model temperature, or use --force to retry with a fresh prompt.",
  api_error: "API server error (5xx). Will retry automatically. If this persists, check your API provider status page.",
  context_overflow: "Prompt exceeds model context window. Use --focus to narrow the workstream scope, or use a model with larger context.",
  unknown_error: "An unexpected error occurred. Check Forge logs at ~/.forge/logs/ for details. Use --force to retry.",
};
```

### Phase B: Color Output Control

Make `--auto` suppress color and add `--no-color` support:

```typescript
// src/integrate/cli.ts — color control

export function shouldUseColor(options: IntegrateCommandOptions): boolean {
  if (options.auto) return false;
  if (process.env.FORGE_NO_COLOR === "true") return false;
  if (process.env.NO_COLOR === "true") return false;
  if (process.argv.includes("--no-color")) return false;
  return true;
}

function formatStatusIcon(failed: number, useColor: boolean): string {
  if (failed > 0) {
    return useColor ? "\x1b[31m✗\x1b[0m" : "✗";
  }
  return useColor ? "\x1b[32m✓\x1b[0m" : "✓";
}

function formatDim(text: string, useColor: boolean): string {
  return useColor ? `\x1b[2m${text}\x1b[0m` : text;
}
```

Update summary output:
```typescript
const useColor = shouldUseColor(options);
const icon = formatStatusIcon(summary.failed, useColor);

console.log(`\n${icon} Integration complete.`);
if (useColor) {
  console.log(`  \x1b[2mTests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped\x1b[0m`);
} else {
  console.log(`  Tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
}
```

### Phase C: Staged Progress Output

Add numbered progress stages during long-running operations:

```typescript
// In runIntegrateCommand:

async function runIntegrateCommand(options: IntegrateCommandOptions): Promise<IntegrateCommandResult> {
  const useColor = shouldUseColor(options);
  const dim = (text: string) => formatDim(text, useColor);

  console.log("Welcome to Forge Integrate (V1)\n");

  // Stage 1: Load artifacts
  console.log(dim("[1/5] Loading artifacts..."));
  const executeArtifact = await loadExecuteArtifact(repoRoot);
  const [planArtifact, verifyArtifact] = await Promise.all([
    loadPlanArtifact(repoRoot),
    loadVerifyArtifact(repoRoot),
  ]);

  // Stage 2: Build prompt
  console.log(dim("[2/5] Building integration prompt..."));
  const { prompt, promptHash, detectedFramework } = await buildIntegrationTestPrompt({
    executeArtifact,
    planArtifact,
    verifyArtifact,
    repoRoot,
    testFramework: options.testFramework,
  });

  // Stage 3: AI call
  console.log(dim("[3/5] Calling AI model..."));
  const result = await executeWorkstream(prompt, repoRoot);

  // Stage 4: Generate test files
  console.log(dim("[4/5] Generating test files..."));
  // ... parse AI response, write files ...

  // Stage 5: Run tests
  console.log(dim("[5/5] Running integration tests..."));
  const testResult = await runIntegrationTestsParallel(...);

  // Final output
  const icon = formatStatusIcon(summary.failed, useColor);
  console.log(`\n${icon} Integration complete.`);
}
```

### Phase D: Enhanced Report

Update `src/integrate/report.ts` with improved sections:

```typescript
export function createIntegrationReport(artifact: IntegrateArtifact): string {
  const { summary, tests, testFiles, workstreamsSummary, goal, recommendations, attemptCount } = artifact;

  const lines: string[] = [
    "# Forge Integration Report",
    "",
    `**Date:** ${artifact.createdAt}`,
    `**Goal:** ${goal}`,
    `**Attempts:** ${attemptCount ?? 1}`,
    "",
    "## How to Reproduce",
    "",
    "```bash",
    `forge integrate --repo .`,
    "```",
    "",
    "## Workstreams Summary",
    "",
    `| Total | Completed | Failed | Changes Made |`,
    `|-------|-----------|--------|-------------|`,
    `| ${workstreamsSummary.total} | ${workstreamsSummary.completed} | ${workstreamsSummary.failed} | ${workstreamsSummary.totalChangesMade} |`,
    "",
    "## Integration Test Results",
    "",
    `**AI Model:** ${summary.aiModelUsed ?? "unknown"}`,
    "",
    `| Result | Count |`,
    `|--------|-------|`,
    `| ✅ Passed | ${summary.passed} |`,
    `| ❌ Failed | ${summary.failed} |`,
    `| ⏭️ Skipped | ${summary.skipped} |`,
    `| ⏱️ Duration | ${summary.durationMs}ms |`,
    "",
  ];

  // Test files section
  if (testFiles.length > 0) {
    lines.push("## Test Files Generated");
    lines.push("");
    for (const tf of testFiles) {
      lines.push(`- **${tf.path}** — ${tf.testCount} test(s) (${tf.framework}, ${tf.language})`);
    }
    lines.push("");
  }

  // Individual test results
  lines.push("## Individual Test Results");
  lines.push("");
  if (tests.length === 0) {
    lines.push("*No tests were run.*");
  } else {
    for (const test of tests) {
      const icon = test.status === "passed" ? "✅" : test.status === "failed" ? "❌" : "⏭️";
      lines.push(`### ${icon} ${test.name}`);
      if (test.error) {
        lines.push(`\`\`\`\n${test.error}\n\`\`\``);
      }
      if (test.recommendation && test.status === "failed") {
        lines.push(`**Recommendation:** ${test.recommendation}`);
      }
      lines.push("");
    }
  }

  // AI Recommendations
  if (recommendations.length > 0) {
    lines.push("## AI Recommendations for Fixing Failures");
    lines.push("");
    for (const rec of recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  // Troubleshooting section
  lines.push("## Troubleshooting");
  lines.push("");
  if (summary.failed > 0) {
    lines.push(`- **${summary.failed} test(s) failed** — review individual test errors above`);
    lines.push("- Check that all workstream changes were applied correctly");
    lines.push("- Verify the test framework is correctly detected");
    lines.push("- Try `forge integrate --force` to re-run from scratch");
    lines.push("- Check `forge integrate --help` for available flags");
  } else {
    lines.push("- All tests passed — no troubleshooting needed");
  }

  // Next Steps
  lines.push("## Next Steps");
  lines.push("");
  if (summary.failed === 0) {
    lines.push("✅ **All tests passed.** Integration is complete. The codebase is ready.");
  } else {
    lines.push(`❌ **${summary.failed} test(s) failed.** Review the failures above and fix the issues.`);
    lines.push("");
    lines.push("Suggested workflow:");
    lines.push("1. Review failed test errors and recommendations above");
    lines.push("2. Fix the identified issues in the relevant files");
    lines.push("3. Re-run `forge integrate --force` to verify fixes");
    lines.push("4. If tests still fail, manually inspect the generated test files");
  }

  return lines.join("\n");
}
```

### Phase E: Frozen Report State

When integration is frozen (freeze criteria met), add `[FROZEN]` badge:

```typescript
// In createFrozenReport (existing from Batch 2), add:
const lines: string[] = [
  "# Forge Integration Report [FROZEN]",
  "",
  `**Date:** ${artifact.createdAt}`,
  `**Goal:** ${artifact.goal}`,
  `**Attempts:** ${artifact.attemptCount ?? 1}`,
  `**Frozen At:** ${artifact.frozenAt}`,
  "",
  `⚠️ **Integration was frozen** — not all tests could be verified.`,
  `**Final Error:** ${artifact.finalError ?? "Unknown"}`,
  "",
  // ... rest of report ...
];
```

## Test Coverage

Add to `tests/integrate.cli.test.ts`:

```typescript
it("--auto disables color output", async () => {
  // Capture console output with --auto
  // Verify no ANSI color codes in output
});

it("--no-color flag disables color even without --auto", async () => {
  // Run with --no-color
  // Verify no ANSI color codes
});

it("progress stages are logged in order", async () => {
  // Capture console output
  // Verify [1/5] through [5/5] appear in order
});
```

Add to `tests/integrate.report.test.ts`:

```typescript
it("report includes attemptCount when > 1", ...)
it("report includes troubleshooting section when tests fail", ...)
it("report includes how to reproduce section", ...)
it("frozen report includes [FROZEN] badge", ...)
```

## Files Modified

- `src/integrate/errors.ts` — enhanced error suggestions
- `src/integrate/cli.ts` — color control, staged progress
- `src/integrate/report.ts` — enhanced report sections
- `tests/integrate.cli.test.ts` — add output format tests
- `tests/integrate.report.test.ts` — add report polish tests

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- All new tests pass
- Report includes all new sections
- `--auto` suppresses color
