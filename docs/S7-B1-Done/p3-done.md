# Step 7 Batch 1 Part 3 Done — forge doctor

## Implemented Spec
- `step7/tasks/batch_1/task_3_forge_doctor.md`

## What Changed

### src/doctor/index.ts — NEW
- `CheckResult` interface: `{ name, status: "pass"|"warn"|"fail", message, fix? }`
- `Check` interface: `{ name, run(): Promise<CheckResult>, autoFix?: () => Promise<void> }`
- `DoctorOptions` interface: `{ fix?: boolean, checks?: string[] }`
- `ALL_CHECKS` array: 7 checks in order (node, git, npm, network, config, permissions, gitClean)
- `runDoctor(options)`: filters checks by name, runs sequentially, supports `--fix` autoFix invocation
- `printDoctorResults(results)`: formats icon + status + message + fix, prints summary counts

### src/doctor/node.ts — NEW
- `nodeCheck`: checks `process.version` major against >=20 threshold (repo convention, not >=18)
- Pass: `Node.js vXX.YY.ZZ (>=20 required)`, Fail: version too old with install fix

### src/doctor/git.ts — NEW
- `gitCheck`: runs `git --version` (5s timeout), checks `.git` directory existence
- Pass: git version in repo, Warn: git installed but not in repo, Fail: git not installed

### src/doctor/npm.ts — NEW
- `npmCheck`: runs `npm --version` (5s timeout)
- Pass: npm version available, Fail: npm not installed

### src/doctor/network.ts — NEW
- `networkCheck`: checks reachability of OpenAI and Anthropic API endpoints via curl
- Pass: at least 1/2 endpoints reachable, Warn: none reachable

### src/doctor/config.ts — NEW
- `configCheck`: checks `.forge/config.yaml` and `forge.config.ts` existence
- Validates YAML with `js-yaml` `load()` (NOT `yaml` package — see spec decisions below)
- Pass: valid config found, Warn: no config, Fail: invalid YAML syntax

### src/doctor/permissions.ts — NEW
- `permissionsCheck`: checks write access to `.forge/` directory
- Pass: writable or doesn't exist yet, Fail: not writable

### src/doctor/gitClean.ts — NEW
- `gitCleanCheck`: runs `git status --porcelain` (5s timeout)
- Pass: clean working tree, Warn: dirty tree with file count, Warn: cannot determine

### src/cli.ts — MODIFY
- Added import: `runDoctor`, `printDoctorResults` from `./doctor/index.js`
- Added `forge doctor` command with `--fix` and `--checks <list>` options
- Uses `exitCode = 1` pattern (NOT `process.exit()`) on failures, matching existing CLI convention

### package.json — MODIFY
- Added `js-yaml` to dependencies (v4.1.1 with built-in TypeScript types)
- Added `doctor.test.js` to the default `npm test` script chain

### tests/doctor.test.ts — NEW
- 12 tests total across 4 suites:
  - runDoctor unit tests (3): all checks default, filtered checks, unknown check names
  - individual check tests (5): node >=20, npm pass/fail, git in repo, config warn, gitClean no-crash
  - printDoctorResults test (1): formatted output with icons and summary
  - forge doctor CLI command (3): runs all checks exit 0, --checks filtering, exit 1 on failure

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| Node >=18 threshold | Repo uses `engines.node >=20` | Use >=20 to match repo convention |
| Test uses `vitest` | All tests use `node:test` + `node:assert/strict` | Use `node:test` — no vitest dependency |
| `yaml` package for config parsing | `yaml` is NOT installed | Use `js-yaml` (already added as dependency) |
| `config.ts` uses `parse` from `"yaml"` | N/A | Use `load` from `"js-yaml"` instead |
| `git.ts` references `join(cwd, ".git")` but doesn't import `join` | Missing import | Added `join` import from `node:path` |
| `process.exit()` in CLI action | Existing CLI uses `exitCode` variable pattern | Use `exitCode = 1` instead of `process.exit()` |
| `config.ts` checks `.forge/config.yaml` then `forge.config.ts` | Matches `forge init` behavior | Kept as specified |

## Verification
- `npm run build` — clean, no TS errors
- `npm run typecheck` — passes
- `npm test` (doctor tests) — 12/12 pass
- `npm run smoke` — PASS (forge intake → plan → verify → split → init → doctor)
- `forge doctor` — runs all 7 checks with formatted output
- `forge doctor --checks node,npm` — runs only specified checks
- `forge doctor` exits 0 when no failures, exits 1 when any check fails

## Non-Goals Preserved
- No auto-fix implementation for all checks (autoFix infrastructure exists but only `--fix` flag wired; no checks implement autoFix yet)
- No changes to existing CLI commands
- Config check warns instead of failing when no config exists