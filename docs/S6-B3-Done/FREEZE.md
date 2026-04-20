# Step 6 — INTEGRATE — V1 FROZEN

## Freeze Date

2025-04-20

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