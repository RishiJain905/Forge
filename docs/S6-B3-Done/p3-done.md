# Step 6 Batch 3 Part 3 Done — Prompt Builder Polish

## Implemented Spec
- `step6_batch3/tasks/task_3_prompt_builder_polish.md`

## What Changed

### Phase A: Parallel File Reads

Refactored `getChangedFileContents` in `src/integrate/prompt-builder.ts`:
- Changed from sequential `for` loop with `await fs.readFile` per file to a two-phase approach:
  1. **Collection phase**: Iterate workstreams, deduplicate paths, apply path traversal guards, build an entries-to-read list
  2. **Parallel read phase**: Use `Promise.all` to read all files concurrently
- Per-file error handling: missing files produce `{ path, content: null, warning }` entries, not crashes
- All path traversal guards preserved (absolute path rejection, resolves-outside-repo)

### Phase B: Test Discovery

Added `discoverExistingTests(repoRoot: string): Promise<string[]>`:
- Checks for `tests/` directory under `repoRoot`; returns `[]` if not found
- Recursively walks the `tests/` directory using `fs.readdir({ recursive: true })`
- Filters by test file patterns: `.test.ts`, `.spec.ts`, `.test.js`, `.spec.js`, `_test.py`, `_spec.rb`
- Excludes files under `node_modules` and `dist` directories
- Returns deduplicated repo-relative paths
- **No new dependencies** — uses Node.js built-in `fs.readdir` instead of `glob`

Wired into `buildIntegrationTestPrompt`:
- New `# Existing Tests` section added to the prompt between `# Changed Files` and `# Test Framework`
- If no tests found, shows `(no existing tests found)`

### Phase C: Context Size Warning

Added context size estimation to `buildIntegrationTestPrompt`:
- Exported `CONTEXT_WARNING_THRESHOLD = 100_000` constant
- Estimates tokens as `Math.ceil(prompt.length / 4)`
- If over threshold, appends warning: `⚠️ WARNING: Prompt is estimated at ~N tokens, which may approach context limits. Consider using --focus to narrow scope.`
- `promptHash` now hashes `finalPrompt` (prompt + warning) for deterministic tracking

### Phase D: File Cap at 20

Modified `buildFileSection`:
- Added `FILE_CAP = 20` constant
- When `files.length > FILE_CAP`, slices to first 20 entries and appends `... and N more file(s)` overflow note
- Header changes dynamically: `# CHANGED FILES (N files — showing first 20)` when over 20, `# Changed Files` when 20 or fewer
- Singular/plural handling in overflow message

## Test Coverage

9 new test scenarios in `tests/integrate.prompt-builder.test.ts`:

1. `getChangedFileContents reads multiple files in parallel` — Creates 5 temp files, verifies all read with content
2. `getChangedFileContents handles all missing files gracefully in parallel` — All files missing, all get warnings
3. `discoverExistingTests finds test files in tests directory` — Creates tests/ dir with matching files
4. `discoverExistingTests returns empty array when no tests directory` — Missing dir returns []
5. `discoverExistingTests ignores node_modules and dist directories` — Files in excluded dirs are filtered
6. `buildIntegrationTestPrompt includes context warning for large prompts` — Creates large artifact exceeding 400k chars
7. `buildIntegrationTestPrompt has no context warning for normal prompts` — Normal artifact, no WARNING
8. `buildFileSection caps output at 20 files with overflow note` — 25 files, verify 20 shown + overflow message
9. `buildFileSection shows all files when count is 20 or less` — 15 files, all shown, no overflow

Total: 57 prompt-builder tests pass (48 original + 9 new)

## Key Files

| File | Change |
|------|--------|
| `src/integrate/prompt-builder.ts` | Parallel reads, `discoverExistingTests`, context warning, file cap |
| `tests/integrate.prompt-builder.test.ts` | 9 new TDD test scenarios |

## Design Decisions

- **No `glob` dependency**: The spec used dynamic `import("glob")`, but `glob` is not installed in the project. Used `fs.readdir({ recursive: true })` instead — no new dependencies needed.
- **Return type preserved**: `getChangedFileContents` continues to return `ChangedFileContent[]` (not `Record<string, string>`), preserving backward compatibility and carrying more information (warnings).

## Verification

- `npx tsc -p tsconfig.test.json` — PASS
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- 57/57 prompt-builder tests pass
- 46/46 test-runner tests pass
- 54/54 CLI tests pass