# Step 7 Batch 2 Part 3 Done — Environment Variable Support

## Implemented Spec
- `step7/tasks/batch_2/task_3_env_variables.md`

## What Changed

### `src/config.ts` — MODIFY
- Added `forge.no_color: false` to `DEFAULT_VALUES`
- Added `ENV_VAR_MAP` — declarative mapping of all supported `FORGE_*` env vars to config keys and types:
  | Env Var | Config Key | Type |
  |---------|------------|------|
  | `FORGE_LOG_LEVEL` | `forge.log_level` | string |
  | `FORGE_DEFAULT_MODEL` | `forge.default_model` | string |
  | `FORGE_MODEL` | `forge.default_model` | string |
  | `FORGE_NO_COLOR` | `forge.no_color` | boolean |
  | `FORGE_INTAKE_DEFAULT_LLM_MODE` | `intake.default_llm_mode` | string |
  | `FORGE_EXECUTE_PARALLEL` | `execute.parallel_workstreams` | boolean |
  | `FORGE_MAX_WORKSTREAMS` | `execute.max_workstreams` | number |
  | `FORGE_EXECUTE_DEFAULT_MODEL` | `execute.default_model` | string |
  | `FORGE_INTEGRATE_AUTO_RUN` | `integrate.auto_run` | boolean |
  | `FORGE_INTEGRATE_TEST_FRAMEWORK` | `integrate.test_framework` | string |
- Added `parseEnvValue(type, value)` — parses booleans (`value === "true"`), numbers (`parseInt`), strings (as-is)
- Added `getEnvOverrides()` — reads `process.env` via `ENV_VAR_MAP`, returns nested override object via `setValueByDotPath()`
  - `FORGE_MODEL` takes priority over `FORGE_DEFAULT_MODEL` when both are set
- Extended `resolveConfig()` to merge env overrides after `.forge/config.yaml` with **highest precedence**
- Source tracking: `sources["section.key"] = "env:FORGE_VAR_NAME"`
- Config precedence (highest to lowest):
  1. `FORGE_*` environment variables
  2. `.forge/config.yaml`
  3. Hard-coded defaults

### `tests/config-env.test.ts` — NEW (18 tests)
- **resolveConfig env overrides (15 tests)**
  - `FORGE_LOG_LEVEL` overrides default
  - `FORGE_EXECUTE_PARALLEL=false` parses boolean `false`
  - `FORGE_EXECUTE_PARALLEL=true` parses boolean `true`
  - `FORGE_MAX_WORKSTREAMS` parses number `25`
  - `FORGE_MODEL` alias sets `forge.default_model`
  - `FORGE_DEFAULT_MODEL` sets value when `FORGE_MODEL` absent
  - `FORGE_MODEL` priority over `FORGE_DEFAULT_MODEL`
  - Source tracking shows `env:FORGE_LOG_LEVEL`, `env:FORGE_MAX_WORKSTREAMS`
  - Unknown env vars are ignored without crashing
  - `FORGE_NO_COLOR=true/false` parses boolean, adds `forge.no_color`
  - Defaults intact when no env vars set
  - Handles empty string env values (valid string)
  - Handles multiple simultaneous env var overrides
- **CLI integration (3 tests)** via `runForgeBinary` with `envOverrides`
  - `forge config --list` shows `env:FORGE_LOG_LEVEL` source
  - `forge config --get` with env override returns correct value
  - `FORGE_MODEL` alias resolves correctly via CLI
- Env var safety: `saveForgeEnv()` / `restoreForgeEnv()` helpers save and restore all 10 known `FORGE_*` keys before/after each test

### `docs/env-variables.md` — NEW
- Quick reference table (all 10 vars, type, default, config key)
- Boolean and number parsing notes
- Sections: AI Model, Execution, Logging, Intake, Integrate
- Usage examples: Local shell, Docker, GitHub Actions, CI/CD shell
- Notes on unknown vars and `forge config --list` source display

### `package.json` — MODIFY
- Appended `&& node dist-tests/tests/config-env.test.js` to `test` chain via Python3 JSON manipulation

## Spec vs Live Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| Inline `getEnvOverrides()` with manual `if` chains | `config.ts` already has `setValueByDotPath()` helper | Used a declarative `ENV_VAR_MAP` + `parseEnvValue()` + `setValueByDotPath()` — DRY and extensible |
| `process.env = { ...originalEnv }` in tests | `process.env` assignment is a shallow struct copy, not safe for all vars | Used explicit `saveForgeEnv()` / `restoreForgeEnv()` helpers per key |
| `FORGE_MODEL` alias | Spec says it maps to `forge.default_model` | Implemented with priority over `FORGE_DEFAULT_MODEL` — `FORGE_MODEL` processed last in map, OR explicit skip of `FORGE_DEFAULT_MODEL` when `FORGE_MODEL` exists |
| `FORGE_NO_COLOR` | Not in existing defaults | Added `forge.no_color: false` to `DEFAULT_VALUES` — forward-compatible |
| Tests use `vitest` + `expect()` | Repo uses `node:test` + `node:assert/strict` | Adapted to existing test framework |

## Verification

- `npm run build` — clean, no TS errors
- `npm run typecheck` — passes
- `npm run smoke` — passes
- `npx tsc -p tsconfig.test.json && node dist-tests/tests/config-env.test.js` — 18/18 pass
- `node dist-tests/tests/config.test.js` — 19/19 pass
- `node dist-tests/tests/update.test.js` — 5/5 pass
- `node dist-tests/tests/doctor.test.js` — 12/12 pass
- `node dist-tests/tests/init.test.js` — 10/10 pass
- Package.json is valid JSON

## Non-Goals Preserved

- No env var validation (unknown vars are silently ignored)
- No runtime behavior changes in existing commands (env vars feed into config system only)
- No new env vars outside the spec
- Debug vars (`FORGE_INTAKE_DEBUG`, etc.) documented in docs but not implemented as config keys (no corresponding config values yet)
- Global user config (`~/.forge/config.yaml`) — not implemented
