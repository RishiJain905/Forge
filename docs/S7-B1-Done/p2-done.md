# Step 7 Batch 1 Part 2 Done — forge init

## Implemented Spec
- `step7/tasks/batch_1/task_2_forge_init.md`
- Deferred items from `step7/tasks/batch_1/task_1_npm_packaging.md`

## What Changed

### src/init.ts — NEW
- `initForge(options)` creates `.forge/` directory with `config.yaml`, `.forgeignore`, `reports/`, and `debug/`
- With `--yes`, also creates `forge.config.ts` (plain default export, no `defineConfig` import)
- Throws if `.forge/` exists without `--force`
- Supports `--dir <path>` to initialize in a different directory

### src/cli.ts — MODIFY
- Added `forge init` Commander subcommand with `--dir`, `--yes`, `--force` options
- Added `forge --version` flag via `.version(packageJson.version)` (deferred from Task 1)
- Added package.json import for version number (reads `../../package.json` relative to `dist/src/`)

### package.json — MODIFY
- Added `postinstall` script: `forge --init 2>/dev/null || true` (deferred from Task 1)
- Added `init.test.js` to the default `npm test` script chain

### tests/init.test.ts — NEW
- 13 tests total:
  - 8 unit tests for `initForge` (directory creation, config.yaml content, .forgeignore content, duplicate handling, --force overwrite, --yes forge.config.ts, cwd default)
  - 4 CLI integration tests for `forge init` command (via `spawnSync` + package entrypoint)
  - 1 test for `forge --version` output

### tests/npm-packaging.test.ts — MODIFY
- Added `postinstall` script assertion test (16 total, was 15)

### scripts/smoke.mjs — MODIFY
- Added `forge --version` verification step at the top of the smoke script

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| Test uses `vitest` | All tests use `node:test` + `node:assert/strict` | Use `node:test` — no vitest dependency |
| `defineConfig` import in `forge.config.ts` | Library doesn't export `defineConfig` | Use plain default export object |
| `initForge` throws on error | Pipeline commands return result objects | Keep throw pattern — init is not a pipeline stage |
| `console.log` for init output | Pipeline commands use `formatXxxCommandOutput` | Direct console output is appropriate for init |

## Deferred Items Completed

### postinstall script (from Task 1)
- Added `"postinstall": "forge --init 2>/dev/null || true"` to `package.json`
- Test added: `tests/npm-packaging.test.ts` verifies postinstall script present and matches `/forge.*--init/`

### --version flag (from Task 1)
- Added `.version(packageJson.version)` to Commander program in `src/cli.ts`
- Added package.json read via `readFileSync` with correct relative path (`../../package.json` from `dist/src/`)
- Smoke test checks `forge --version` outputs `1.0.0`

## Verification
- `npm run build` — clean
- `npm run typecheck` — no type errors
- `npm test` (init tests) — 13/13 pass
- `npm test` (npm-packaging tests) — 16/16 pass (including postinstall)
- `npm run smoke` — PASS with `forge --version` check
- `forge init --dir <path>` — creates valid `.forge/` structure
- `forge init --yes` — creates `forge.config.ts`
- `forge init --force` — overwrites existing `.forge/`
- `forge --version` — prints `1.0.0`

## Non-Goals Preserved
- No automatic `forge --init` beyond postinstall (silent, non-blocking)
- No config.yaml schema validation during init (done in forge doctor)
- No creation of plan.json, execute.json, integrate.json during init