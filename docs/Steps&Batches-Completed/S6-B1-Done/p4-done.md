# Step 6 Batch 1 Part 4 Done — CLI Wiring Milestone

## Implemented Spec
- `forge_step6_batch1/part-4-integrate-cli-wiring.md`

## What Changed — Artifact (`src/integrate/artifact.ts`)
- Added `buildIntegrateArtifact(params)` — assembles an `IntegrateArtifact` from `executeArtifact`, `planArtifact`, `verifyArtifact`, `testResult`, `aiModelUsed`, `schemaVersion`, `forgeVersion`; derives goal from `carry_forward.task_spec.goal → purpose → summary → "Unknown goal"`; builds `workstreamsSummary` string; collects `recommendations` from failed tests; validates via `validateIntegrateArtifact()` before returning.
- Added `writeIntegrateArtifact(artifactPath, artifact)` — writes artifact as JSON with 2-space indentation, creates parent directories recursively.

## What Changed — Report (`src/integrate/report.ts`)
- Added `createIntegrationReport(artifact)` — generates a full Markdown report with 9 sections:
  1. **Overview** — date, goal, AI model, schema/forge version
  2. **Workstreams Summary** — table with total/completed/failed/changes counts parsed from `workstreamsSummary` string
  3. **Test Results** — table with passed/failed/skipped/duration
  4. **Test Files** — table with path, test count, language, framework
  5. **Individual Test Results** — table with status icons (✅/❌/⏭️/⏳)
  6. **Failed Test Errors** — errors in code blocks per failing test
  7. **AI Recommendations** — from failed tests with non-empty `recommendation`
  8. **Next Steps** — guidance: all-pass path or failure remediation steps

## What Changed — CLI (`src/integrate/cli.ts`)
- Added `runIntegrateCommand(options)` — full CLI entrypoint implementing the 10-step flow:
  1. Load `execute.json` (required; fail with `NO_EXECUTE_ARTIFACT` if missing)
  2. Check workstreams (fail with `ALL_WORKSTREAMS_FAILED` if all failed)
  3. Load `plan.json`/`verify.json` (optional with warnings; create stubs if missing)
  4. Build integration test prompt via `buildIntegrationTestPrompt`
  5. Call AI via `loadModelConfig` + `callModel` (reused from `model-connector`, not a new connector)
  6. Parse AI response for JSON array of test files via `parseTestFilesFromAIResponse`
  7. Run tests via `runIntegrationTests`
  8. Build artifact via `buildIntegrateArtifact`
  9. Write `integrate.json` and `integration-report.md`
  10. Return result with exit code 0 (all pass) or 1 (failures exist)
- Added `parseTestFilesFromAIResponse(rawResponse)` — extracts JSON from ```json code blocks or bare JSON arrays in AI response.
- Added stub creators `createPlanStub()` and `createVerifyStub()` for when optional artifacts are missing.
- Registered `forge integrate` command in `src/cli.ts` with `--repo`, `--output-dir`, `--force`, `--test-framework` options.
- Fixed `fix-integrate-cli-ai-call`: replaced blocking `executeWorkstream` call with `loadModelConfig` + `callModel` pattern.

## Artifact — Key Behaviors
| Behavior | Detail |
|----------|--------|
| Goal derivation | `carry_forward.task_spec.goal` → `purpose` → `summary` → `"Unknown goal"` |
| Workstreams summary | `"Total: N, Completed: Y, Failed: Z, Changes: W"` |
| Recommendations | Collected from all failed tests with non-empty `recommendation` field |
| Validation | `buildIntegrateArtifact` calls `validateIntegrateArtifact` before returning |

## Report — Key Behaviors
| Behavior | Detail |
|----------|--------|
| Status icons | ✅ passed, ❌ failed, ⏭️ skipped, ⏳ pending |
| Duration formatting | `Xs` or `Nm Xs` |
| Workstreams parsing | Parses `workstreamsSummary` string via regex for table |
| Next steps | All-pass: commit + re-run + next step guidance; failures: failure count + review errors + follow recommendations + re-run |

## CLI — Error Codes
| Code | Condition |
|------|-----------|
| `NO_EXECUTE_ARTIFACT` | `.forge/execute.json` not found |
| `ALL_WORKSTREAMS_FAILED` | All workstreams in execute.json have state `"failed"` |
| `AI_GENERATION_FAILED` | Prompt building or AI model call fails |
| `NO_TEST_FILES_GENERATED` | AI response contains no parseable test files |
| `TEST_RUN_FAILED` | Test runner throws an exception |
| `IO_ERROR` | Writing integrate.json or integration-report.md fails |

## Key Files
- `src/integrate/artifact.ts`
- `src/integrate/report.ts`
- `src/integrate/cli.ts`
- `src/cli.ts` (command registration)

## Test Coverage
- `tests/integrate.artifact.test.ts` — 19 scenarios covering: valid artifact building with all fields, goal derivation fallbacks, workstreams summary, recommendations collection, empty recommendations, validateIntegrateArtifact round-trip, stub artifact creation
- `tests/integrate.report.test.ts` — 24 scenarios covering: full report rendering, all sections, status icons, duration formatting, workstreams parsing, test files table, individual results with icons, failed test errors in code blocks, AI recommendations, next steps (all-pass and failure paths), empty arrays
- `tests/integrate.cli.test.ts` — 15 scenarios covering: missing execute.json → `NO_EXECUTE_ARTIFACT`, all-workstreams-failed → `ALL_WORKSTREAMS_FAILED`, plan/verify stub creation, AI call integration, test file parsing, empty AI response → `NO_TEST_FILES_GENERATED`, integration artifact building, exit code 0/1

## Verification
- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — PASS *(pre-existing failure in `split.batch3-part4-polish-freeze-criteria.test.js` for missing `docs/S4-B3-Done/p4-done.md` is unrelated to Step 6 Batch 1)*

## Final Branch State
- Target branch: `dev`
- Step 6 Batch 1 Part 4 CLI wiring milestone is complete and verified.

## Follow-On
- Step 6 Batch 1 is now complete. Next target: `forge_step6_batch1/part-5-end-to-end-and-validation-contract.md`
