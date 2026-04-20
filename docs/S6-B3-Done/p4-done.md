# Step 6 Batch 3 Part 4 Done — CLI Output Polish

## Implemented Spec
- `step6_batch3/tasks/task_4_cli_output_polish.md`

## What Changed

### Phase A: More Actionable Error Suggestions

Updated all 7 error suggestion strings in `src/integrate/errors.ts` `classifyError()`:
- `rate_limit`: "Rate limit hit. Will retry automatically. Consider using --delay to increase wait time, or switch to a faster/less congested model."
- `auth_failure`: "Authentication failed. Check your FORGE_API_KEY environment variable or .env file. Ensure the key has not expired."
- `timeout`: "Request timed out. Will retry automatically. Consider using --max-duration to limit total time spent."
- `parse_error`: "AI returned malformed JSON. Try adjusting the model temperature, or use --force to retry with a fresh prompt."
- `api_error`: "API server error (5xx). Will retry automatically. If this persists, check your API provider status page."
- `context_overflow`: "Prompt exceeds model context window. Use --focus to narrow the workstream scope, or use a model with larger context."
- `unknown_error`: "An unexpected error occurred. Check Forge logs at ~/.forge/logs/ for details. Use --force to retry."

Also updated `tests/integrate.errors.test.ts` to assert on the new suggestion strings (auth_failure now contains "FORGE_API_KEY" instead of "API key").

### Phase B: Color Output Control

Added 3 exported functions to `src/integrate/cli.ts`:
- `shouldUseColor(options)` — Returns false when `--auto`, `FORGE_NO_COLOR=true`, `NO_COLOR=true`, or `--no-color` flag is present; otherwise true
- `formatStatusIcon(failed, useColor)` — Returns green/red ANSI-colored ✓/✗ icons when useColor is true, plain Unicode otherwise
- `formatDim(text, useColor)` — Wraps text in ANSI dim escape codes `\x1b[2m...\x1b[0m` when useColor is true, returns plain text otherwise

### Phase C: Staged Progress Output

Added numbered progress messages and a welcome banner to `runIntegrateCommand()`:
- `"Welcome to Forge Integrate (V1)\n"` at the start
- `"[1/5] Loading artifacts..."` — after force guard, before loading execute.json
- `"[2/5] Building integration prompt..."` — before buildIntegrationTestPrompt
- `"[3/5] Calling AI model..."` — before the AI retry loop
- `"[4/5] Generating test files..."` — before parsing AI response
- `"[5/5] Running integration tests..."` — before runIntegrationTestsParallel
- Final status summary using `formatStatusIcon` and ANSI dim text: `"✓ Integration complete."` / `"✗ Integration complete."` with a dimmed summary line

All progress messages use `formatDim()` to conditionally dim output when color is enabled.

### Phase D: Enhanced Report — `createIntegrationReport()`

Added 2 new sections to `src/integrate/report.ts`:
- **How to Reproduce** section — inserted after Overview, contains `forge integrate --repo .` in a code block
- **Troubleshooting** section — inserted before Next Steps; shows actionable guidance when tests fail (5 bullet points), or "All tests passed — no troubleshooting needed" when all pass

Verified that `attemptCount` is already displayed in the Overview section (no change needed).

### Phase E: Enhanced Frozen Report — `createFrozenReport()`

Added to `src/integrate/report.ts` `createFrozenReport()`:
- `**Goal**: ${artifact.goal}` line — matching the regular report
- `⚠️ **Integration was frozen** — not all tests could be verified.` warning line
- `**Final Error:** ${artifact.finalError ?? "Unknown"}` line

## Test Coverage

17 new test scenarios added:

**Phase B — Color control (11 tests in `tests/integrate.cli.test.ts`):**
1. `shouldUseColor returns true by default`
2. `shouldUseColor returns false when auto is true`
3. `shouldUseColor returns false when FORGE_NO_COLOR is true`
4. `shouldUseColor returns false when NO_COLOR is true`
5. `formatStatusIcon returns green ✓ with color when no failures`
6. `formatStatusIcon returns plain ✓ without color when no failures`
7. `formatStatusIcon returns red ✗ with color when failures > 0`
8. `formatStatusIcon returns plain ✗ without color when failures > 0`
9. `formatDim wraps text in ANSI dim codes when useColor is true`
10. `formatDim returns plain text when useColor is false`

**Phase C — Staged progress (3 tests in `tests/integrate.cli.test.ts`):**
11. `welcome message is printed`
12. `formatDim produces correct progress messages for all 5 stages`
13. `formatStatusIcon and formatDim combine for final summary`

**Phase D — Report polish (4 tests in `tests/integrate.report.test.ts`):**
14. `Report includes How to Reproduce section`
15. `Report includes Troubleshooting section when tests fail`
16. `Report Troubleshooting shows all tests passed when no failures`
17. `Report includes attemptCount in Overview`

**Phase E — Frozen report polish (3 tests in `tests/integrate.report.test.ts`):**
18. `createFrozenReport includes frozen warning`
19. `createFrozenReport includes final error`
20. `createFrozenReport includes goal`

Total: 877 tests all pass (0 failures).

## Key Files

| File | Change |
|------|--------|
| `src/integrate/errors.ts` | Enhanced all 7 error suggestion strings |
| `src/integrate/cli.ts` | Added `shouldUseColor`, `formatStatusIcon`, `formatDim`; added staged progress output and welcome message to `runIntegrateCommand()` |
| `src/integrate/report.ts` | Added `renderHowToReproduce()`, `renderTroubleshooting()` to `createIntegrationReport()`; added goal, frozen warning, final error to `createFrozenReport()` |
| `tests/integrate.cli.test.ts` | 14 new TDD test scenarios (B+C) |
| `tests/integrate.report.test.ts` | 7 new TDD test scenarios (D+E+1 attemptCount) |
| `tests/integrate.errors.test.ts` | Updated auth_failure assertion |

## Design Decisions

- **Color control as exported functions**: `shouldUseColor`, `formatStatusIcon`, and `formatDim` are exported for testability and reuse, rather than inline in `runIntegrateCommand()`.
- **Progress messages use formatDim()**: All 5 stage markers use dim styling via `formatDim()`, which respects the `--auto` / `FORGE_NO_COLOR` / `--no-color` flags.
- **Troubleshooting section is conditional**: Shows actionable guidance when tests fail, or a "no troubleshooting needed" message when all pass.
- **FORGE_NO_COLOR leak fix**: The `--auto` tests set `FORGE_NO_COLOR=true` which leaked to later tests. The `shouldUseColor` default test now properly saves/restores the env var.

## Verification

- `npx tsc -p tsconfig.test.json` — PASS
- `npm run build` — PASS
- `node dist-tests/tests/integrate.cli.test.js` — 69 PASS (49 original + 14 new + 6 from prior batches)
- `node dist-tests/tests/integrate.report.test.js` — 33 PASS (20 original + 13 new from prior batches + 6 new from batch 3)
- `node dist-tests/tests/integrate.errors.test.js` — 21 PASS
- `npm test` — 877 total, 0 failures