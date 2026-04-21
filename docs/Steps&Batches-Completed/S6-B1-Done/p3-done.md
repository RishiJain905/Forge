# Step 6 Batch 1 Part 3 Done — Prompt Builder + Test Runner Milestone

## Implemented Spec
- `forge_step6_batch1/part-3-integrate-prompt-builder.md`
- `forge_step6_batch1/part-3-integrate-test-runner.md`

## What Changed — Prompt Builder (`src/integrate/prompt-builder.ts`)
- Added `detectTestFramework(repoRoot)` — auto-detects jest/vitest/mocha from `package.json` or pytest from `pytest.ini`/`pyproject.toml` with fallback to `{ name: "npm", language: "unknown", testCommand: "npm test" }`.
- Added `getChangedFileContents(executeArtifact, repoRoot)` — reads all changed files from all workstreams, deduplicates by path, gracefully handles missing files with a warning.
- Added `buildIntegrationTestPrompt(ctx)` — assembles the full AI prompt from goal, workstream results, plan items, verification constraints, and changed file contents, with a deterministic SHA-256 `promptHash`.
- Added `deriveFrameworkFromOverride(override)` — maps user-provided framework name to `{ name, language, testCommand }`; falls back to `typescript`/`npm test` for unknown frameworks.
- Fixed `fix-prompt-builder-framework-override`: framework override logic now correctly uses the provided `testFramework` value instead of always auto-detecting; `testFramework` is properly optional in `PromptBuildContext`.

## What Changed — Test Runner (`src/integrate/test-runner.ts`)
- Added `estimateTestCount(content, framework)` — counts test cases by matching framework-specific patterns: `def test_\w+` for pytest, `\bit\(` for jest/vitest/mocha; returns 1 for non-empty content of unknown frameworks.
- Added `parseTestOutput(output)` — parses stdout+stderr from jest/vitest (`Tests: N passed, M failed`) and pytest (`N passed, M failed`) output to extract pass/fail/total counts.
- Added `runIntegrationTests(testFiles, repoRoot, testCommand?)` — writes test files to disk (creating directories recursively), runs the test command with a 5-minute timeout and 10 MB output buffer, parses results, and returns `TestRunResult`.
- Guard: returns `{ success: false, error: "No test files provided..." }` when `testFiles` is empty.

## Prompt Builder — Key Behaviors
| Function | Behavior |
|----------|----------|
| `detectTestFramework` | package.json test script → jest/vitest/mocha; devDeps/dependencies → same; pytest.ini or pyproject.toml [tool.pytest] → pytest; else → npm fallback |
| `getChangedFileContents` | Reads all workstream `changesMade` files; skips `action: "delete"`; deduplicates; warns on missing files |
| `buildIntegrationTestPrompt` | Assembles 8-section prompt: System Role, Goal, Workstream Results, Plan Items, Verification Constraints, Changed Files, Test Framework, Your Task |
| `deriveFrameworkFromOverride` | Maps pytest/unittest/vitest/jest/mocha to correct language+command; derives language for unknown frameworks by name heuristics |

## Test Runner — Key Behaviors
| Function | Behavior |
|----------|----------|
| `estimateTestCount` | pytest: `def test_\w+`; jest/vitest/mocha/typescript: `\bit\(`; fallback: 1 for non-empty content |
| `parseTestOutput` | jest/vitest: `Tests: N passed, M failed`; pytest: `N passed, M failed`; generic fallback |
| `runIntegrationTests` | Writes all files with `recursive: true` mkdir; runs `npm test` default; 5-min timeout; 10 MB buffer; returns structured `TestRunResult` |

## Key Files
- `src/integrate/prompt-builder.ts`
- `src/integrate/test-runner.ts`

## Test Coverage
- `tests/integrate.prompt-builder.test.ts` — 49 scenarios covering:
  - `detectTestFramework`: jest/vitest/mocha from scripts/devDeps/dependencies, vitest priority over jest, pytest.ini, pyproject.toml [tool.pytest], fallback to npm, invalid package.json handling
  - `getChangedFileContents`: reads files, handles missing files with warning, deduplicates across workstreams, skips deleted files, empty changesMade
  - `buildIntegrationTestPrompt`: goal extraction (carry_forward.task_spec.goal → purpose → summary → "Unknown goal"), workstream section, plan items section, verification constraints section, changed files section, framework info, deterministic SHA-256 hash, framework override
  - `deriveFrameworkFromOverride`: all well-known frameworks, unknown fallback, python-language derivation for python-like names, whitespace trimming
- `tests/integrate.test-runner.test.ts` — 37 scenarios covering:
  - `estimateTestCount`: pytest pattern, jest pattern, vitest pattern, mocha pattern, unknown framework fallback, empty content
  - `parseTestOutput`: jest "Tests: N passed, M failed", jest passed-only, pytest "N passed, M failed", generic fallback
  - `runIntegrationTests`: writes files to disk, creates directories recursively, empty testFiles guard, test command execution, error handling

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — PASS *(pre-existing failure in `split.batch3-part4-polish-freeze-criteria.test.js` for missing `docs/S4-B3-Done/p4-done.md` is unrelated to Step 6 Batch 1)*

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 1 Part 3 prompt builder + test runner milestone is complete and verified.

## Follow-On
- Next Step 6 Batch 1 target: `forge_step6_batch1/part-4-integrate-cli-wiring.md`
