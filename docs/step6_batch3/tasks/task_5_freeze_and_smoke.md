# Step 6 Batch 3 — Task 5: Freeze & Smoke

## Owner

MiniMax

## Status

**Pending**

## Context

Finalize the Step 6 integrate surface, run smoke tests, and document the V1 freeze boundary.

## Implementation

### Phase A: Freeze Boundary Documentation

Create `docs/S6-B3-Done/FREEZE.md` documenting the V1 freeze:

```markdown
# Step 6 — INTEGRATE — V1 FROZEN

## Freeze Date

2025-04-19

## Scope

Step 6 `forge integrate` is frozen for V1. No new features will be added to integrate.
Future changes are limited to bug fixes only.

## What Was Shipped

### Batch 1 — Happy Path
- Core integrate CLI with `forge integrate` command
- TypeScript types (`src/integrate/types.ts`)
- Zod schemas (`src/integrate/schema.ts`)
- AI prompt builder (`src/integrate/prompt-builder.ts`)
- Test runner (`src/integrate/test-runner.ts`)
- Artifact builder and writer (`src/integrate/artifact.ts`)
- Human-readable report generator (`src/integrate/report.ts`)
- CLI wiring (`src/integrate/cli.ts`)

### Batch 2 — Hardening
- `--force` flag for re-running over existing integrate.json
- `--auto` flag for non-interactive CI/CD usage
- Robust JSON extraction from messy AI responses
- Error classification with retry logic (rate_limit, auth_failure, timeout, parse_error, api_error, context_overflow, unknown_error)
- Missing `plan.json` / `verify.json` stub handling
- Freeze criteria with `frozenAt` and `finalError` tracking
- Partial `execute.json` support (mixed completed/failed/partial workstreams)

### Batch 3 — Polish & Freeze
- `--delay` flag to override retry backoff
- `--json-only` flag to skip report generation
- `--max-retries` and `--max-duration` freeze criteria overrides
- `--max-concurrency` for parallel test execution
- `attemptCount` persistence in integrate.json
- Parallel test file writes and test execution
- Prompt builder performance optimizations (parallel file reads, glob-based test discovery)
- Context size warning for large prompts
- Color output control (--auto disables color)
- Staged progress output [1/5] through [5/5]
- Enhanced integration report with troubleshooting section
- Full smoke test verification

## V1 Non-Goals (Deferred to Future)

- Config file (`forge.yaml` or `.forge/config.yaml`) integration for integrate settings
- Multiple test framework support per project
- Custom test file naming patterns
- Integration with external CI dashboards
- Test result caching for unchanged workstreams
- Concurrent AI model calls for multi-framework test generation
- `--llm-mode` override for integrate prompt generation
- Per-workstream integration testing
- Integration with `forge monitor`

## Error Codes

| Code | Condition |
|------|-----------|
| `NO_EXECUTE_ARTIFACT` | execute.json not found |
| `NO_WORKSTREAMS` | execute.json has no workstreams |
| `ALL_WORKSTREAMS_FAILED` | All workstreams failed |
| `INTEGRATE_ALREADY_EXISTS` | integrate.json exists and --force not set |
| `PLAN_REQUIRED` | --auto mode but plan.json not found |
| `VERIFY_REQUIRED` | --auto mode but verify.json not found |
| `AI_RATE_LIMIT` | Rate limit error (after exhausting retries) |
| `AI_AUTH_FAILURE` | Auth error (not retryable) |
| `AI_TIMEOUT` | Timeout error (after exhausting retries) |
| `AI_PARSE_FAILURE` | Parse error (not retryable) |
| `AI_API_ERROR` | API error (after exhausting retries) |
| `AI_CONTEXT_OVERFLOW` | Context overflow (not retryable) |
| `AI_GENERATION_FAILED` | AI call failed |
| `NO_TEST_FILES_GENERATED` | AI returned empty test array |
| `TEST_RUN_FAILED` | Test runner crashed |
| `IO_ERROR` | File write error |
| `INTEGRATION_FROZEN` | Freeze criteria met, partial integration |
| `INTEGRATION_COMPLETE` | Integration succeeded |

## CLI Flags

```
forge integrate [options]

Options:
  --repo <path>              Repository root (default: current directory)
  --output-dir <path>        Output directory (default: .forge)
  --force                    Re-run even with existing integrate.json
  --auto                     Non-interactive mode: fail on any warning or error
  --json-only                Only write integrate.json, skip integration-report.md
  --test-framework <name>    Force a specific test framework
  --delay <seconds>          Override retry delay in seconds
  --max-retries <n>          Maximum retry attempts before freezing
  --max-duration <ms>       Maximum duration in ms before freezing
  --max-concurrency <n>     Max parallel test operations (default: 5)
  --no-color                 Disable color output
  -h, --help                 display help for command
```

## Artifact Schema

integrate.json schema version: `1.0.0`

See `src/integrate/schema.ts` for the full Zod schema definition.
```

### Phase B: Create `docs/S6-B3-Done/` Closeout Directory

Create `docs/S6-B3-Done/` with:
- `p1-done.md` — Task 1 (Open Questions) closeout
- `p2-done.md` — Task 2 (Parallel Test Execution) closeout
- `p3-done.md` — Task 3 (Prompt Builder Polish) closeout
- `p4-done.md` — Task 4 (CLI Output Polish) closeout
- `p5-done.md` — Task 5 (Freeze + Smoke) closeout
- `FREEZE.md` — V1 freeze boundary documentation
- `progress.md` — Final progress state

### Phase C: Run Full Verification

```bash
npm run typecheck   # TypeScript type check
npm run build      # Production build
npm run test       # All tests
npm run smoke      # Smoke test suite
```

### Phase D: Add Integrate Smoke to `scripts/smoke.mjs`

Add an integrate-specific smoke scenario:

```javascript
// In scripts/smoke.mjs, add integrate smoke:

async function smokeIntegrate() {
  const repoRoot = process.cwd();

  console.log("SMOKE: forge integrate");

  // Create a minimal execute.json if it doesn't exist
  const executePath = path.join(repoRoot, ".forge", "execute.json");
  if (!fs.existsSync(executePath)) {
    console.log("SKIP: execute.json not found (run forge execute first)");
    return;
  }

  // Run integrate with --force
  const result = await runForge(["integrate", "--repo", repoRoot, "--force"]);

  // Verify integrate.json is created
  const integratePath = path.join(repoRoot, ".forge", "integrate.json");
  if (!fs.existsSync(integratePath)) {
    throw new Error("integrate.json not created");
  }

  // Verify integration-report.md is created
  const reportPath = path.join(repoRoot, ".forge", "integration-report.md");
  if (!fs.existsSync(reportPath)) {
    throw new Error("integration-report.md not created");
  }

  // Verify integrate.json is valid JSON
  const artifact = JSON.parse(fs.readFileSync(integratePath, "utf-8"));

  // Verify attemptCount is present
  if (typeof artifact.attemptCount !== "number") {
    throw new Error("attemptCount missing from integrate.json");
  }

  console.log("PASS: forge integrate smoke");
}
```

### Phase E: Update Root `progress.md`

Add Batch 3 completion entries to the root `progress.md`:

```markdown
- Step 6 Batch 3 Part 1, including the explicit Batch 3 freeze goal and finish-line metadata, all 5 open questions answered definitively in code, stronger do-not-touch boundary policy, and tighter goal-and-boundaries coverage while keeping the public integrate surface stable.
- Step 6 Batch 3 Part 2, including parallel test file writes and parallel test execution for large suites, concurrent file reads in the prompt builder, glob-based existing test discovery, and a dedicated parallel execution regression suite while keeping the public integrate surface stable.
- Step 6 Batch 3 Part 3, including context size warnings for large prompts, file cap at 20 changed files with overflow note, staged progress output [1/5] through [5/5], color output control, enhanced error suggestions, and stronger output polish coverage while keeping the public integrate surface stable.
- Step 6 Batch 3 Part 4, including the explicit freeze boundary documentation, full V1 freeze sign-off, updated progress.md, and confirmation that Step 6 integrate is frozen for V1 except future bug fixes.
- Step 6 Batch 3 is complete and Step 6 integrate is frozen for V1.
```

Add to "Next" section:
```markdown
- Step 6 Batch 3 is complete and frozen for V1.
- Next major target: Step 7 deploy.
```

## Test Coverage

Create `tests/integrate.batch3-freeze-criteria.test.ts`:

```typescript
describe("Step 6 Batch 3 — Freeze & Smoke", () => {
  it("freeze boundary documentation exists", () => {
    // Verify FREEZE.md exists in docs/S6-B3-Done/
  });

  it("all 5 Batch 3 tasks are complete in progress.md", () => {
    // Verify all 5 tasks are marked complete
  });

  it("all integrate tests pass", async () => {
    // Run all integrate tests
    // Verify all pass
  });

  it("smoke test passes with integrate", async () => {
    // Run smoke with integrate
    // Verify pass
  });
});
```

## Files Created/Modified

- `docs/S6-B3-Done/FREEZE.md` — V1 freeze boundary documentation
- `docs/S6-B3-Done/p1-done.md` — Task 1 closeout
- `docs/S6-B3-Done/p2-done.md` — Task 2 closeout
- `docs/S6-B3-Done/p3-done.md` — Task 3 closeout
- `docs/S6-B3-Done/p4-done.md` — Task 4 closeout
- `docs/S6-B3-Done/p5-done.md` — Task 5 closeout
- `docs/S6-B3-Done/progress.md` — Final progress state
- `scripts/smoke.mjs` — Add integrate smoke scenario
- `tests/integrate.batch3-freeze-criteria.test.ts` — Freeze regression suite
- `progress.md` (root) — Update Step 6 Batch 3 entries

## Verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions)
- [ ] `npm run smoke` — PASS
- [ ] `docs/S6-B3-Done/FREEZE.md` exists with full freeze documentation
- [ ] All 5 tasks marked complete in `step6_batch3/progress.md`
- [ ] `step6_batch3/progress.md` commit history is complete
- [ ] Root `progress.md` updated with Step 6 Batch 3 entries
- [ ] All closeout docs in `docs/S6-B3-Done/`
