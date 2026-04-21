# Step 7 Batch 2 Part 2 Done — forge config

## Implemented Spec
- `step7/tasks/batch_2/task_2_forge_config.md`

## What Changed

### `src/config.ts` — NEW
- `resolveConfig(cwd?)` — returns `{ sources, values }` merging defaults with `.forge/config.yaml`
  - Sources track provenance per key ("default" or ".forge/config.yaml")
  - Defaults match `src/init.ts` DEFAULT_CONFIG structure
  - Uses `js-yaml.load()` to parse, `js-yaml.dump()` to serialize (repo already has js-yaml)
- `getConfigValue(key, cwd?)` — dot-notation lookup (e.g. `forge.log_level`)
  - Throws on empty key
  - Returns `undefined` for unknown keys
- `setConfigValue(key, value, cwd?)` — writes dot-path key to `.forge/config.yaml`
  - Creates nested objects for dot paths (`execute.max_workstreams`)
  - Auto-creates `.forge/` directory if missing
- `unsetConfigValue(key, cwd?)` — removes key from `.forge/config.yaml`
  - Throws if key or file does not exist
  - Uses true `delete` (not empty string)
- `openInEditor(cwd?)` — spawns `$EDITOR || "vi"` on config path via `spawn` with `stdio: "inherit"`
- Helper functions (private): `getValueByDotPath`, `setValueByDotPath`, `deleteValueByDotPath`, `deepMerge`, `collectSources`

### `src/cli.ts` — MODIFY
- Added `import { resolveConfig, getConfigValue, setConfigValue, unsetConfigValue, openInEditor } from "./config.js"`
- Added `program.command("config")` with options:
  - `--list` — list all config values with sources (default when no args provided)
  - `--get <key>` — get a specific value
  - `--set <key=value>` — set a value
  - `--unset <key>` — remove an override
  - `--edit` — open config in `$EDITOR`
- Action handler follows existing error pattern:
  - `try/catch`
  - On error: `process.stderr.write("Error: ...\n")`, `exitCode = 1`
  - `--list` is the default behavior when no flags are provided

### `tests/config.test.ts` — NEW
- **resolveConfig (2 tests)**
  - Returns defaults when no config file exists
  - Merges file values with defaults, tracking sources
- **getConfigValue (3 tests)**
  - Returns value for known dot key
  - Returns `undefined` for unknown key
  - Throws for empty key
- **setConfigValue (4 tests)**
  - Writes top-level key
  - Writes nested key with dot notation
  - Creates nested objects for dot paths
  - Throws for empty key
- **unsetConfigValue (3 tests)**
  - Removes key from config file
  - Throws when key does not exist
  - Throws when config file does not exist
- **CLI integration (7 tests)** via `spawnSync`
  - `forge config --list` lists default values, exits 0
  - `forge config` (no args) defaults to `--list`, exits 0
  - `forge config --get` returns a value, exits 0
  - `forge config --get unknown` exits 1
  - `forge config --set key=value` sets and persists
  - `forge config --unset` removes a value
  - `forge config --unset unknown` exits 1

### `package.json` — MODIFY
- Appended `&& node dist-tests/tests/config.test.js` to the `test` script chain
- Verified valid JSON via Python3

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `parse()` from `yaml` package | Repo has `js-yaml` as dependency | Used `js-yaml.load()` / `dump()` for consistency with doctor config check |
| `new Option()` in Commander | Existing CLI uses `.option()` | Used `.option()` for consistency |
| `process.exit(1)` on error | Existing commands use `exitCode = 1` + return | Followed repo convention |
| Tests use `vitest` + `expect()` | Repo uses `node:test` + `node:assert/strict` | Adapted to existing test framework |
| `unset` writes empty string | More correct to truly delete | Implemented `deleteValueByDotPath` to remove keys |

## Verification

- `npm run build` — clean, no TS errors
- `npm run typecheck` — passes
- `npm run smoke` — passes
- `npx tsc -p tsconfig.test.json && node dist-tests/tests/config.test.js` — 19/19 pass
- `node dist-tests/tests/update.test.js` — 5/5 pass
- `node dist-tests/tests/doctor.test.js` — 12/12 pass
- `node dist-tests/tests/init.test.js` — 10/10 pass
- `node dist-tests/tests/npm-packaging.test.js` — 15/15 pass
- Package.json is valid JSON

## Non-Goals Preserved

- Global user config (`~/.forge/config.yaml`) — not implemented
- Config schema validation — not implemented
- Environment variable overrides (`FORGE_*`) — deferred to Batch 2 Task 3
- CLI flags as highest-priority override — not implemented (only config file + defaults)
- No changes to runtime behavior of existing commands based on config values
