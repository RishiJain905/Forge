# Step 7 Batch 2 Part 1 Done — forge update

## Implemented Spec
- `step7/tasks/batch_2/task_1_forge_update.md`

## What Changed

### `src/update.ts` — NEW
- `UpdateInfo` interface: `{ current: string; latest: string; outdated: boolean }`
- `checkForUpdate()`: Runs `npm view @forgecli/forge version` with 10-second timeout
  - Resolves `package.json` via `__dirname` (consistent with existing CLI entrypoint, not `process.cwd()`)
  - On `npm view` failure, gracefully returns `{ current, latest: current, outdated: false }`
- `selfUpdate(yes)`: 
  - If up to date: prints "Forge is already up to date." with current version
  - If outdated and no `--yes`: prints upgrade notice and exits cleanly
  - If outdated and `--yes`: runs `npm install -g @forgecli/forge@${latest}`
  - Any install failure is thrown with a descriptive message (caught by CLI handler)

### `src/cli.ts` — MODIFY
- Added `import { checkForUpdate, selfUpdate } from "./update.js"`
- Added `program.command("update")` with:
  - `.description("Check for updates and update Forge to the latest version")`
  - `.option("--dry-run", "Show what would be updated without installing")`
  - `.option("--yes", "Update without prompting")`
- Action handler follows existing error-handling pattern:
  - `try/catch`
  - On error: `process.stderr.write("Error: ${message}\n")`, `exitCode = 1`
- `--dry-run` path calls `checkForUpdate()` directly and prints version info

### `tests/update.test.ts` — NEW
- **Unit tests (3)** — `checkForUpdate` via `node:test` + `node:assert/strict`
  - Returns structured `{ current, latest, outdated }` result
  - `current` is a valid semver string
  - Gracefully falls back when network is unavailable
- **CLI tests (2)** — `spawnSync` via compiled `dist/src/index.js`
  - `forge update --dry-run` exits 0 and outputs current version
  - `forge update` exits 0 with up-to-date message

### `package.json` — MODIFY
- Appended `&& node dist-tests/tests/update.test.js` to the `test` script chain
- Test chain validated: builds cleanly, all tests pass

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `getPackageVersion()` reads `process.cwd()/package.json` | Existing CLI uses `join(__dirname, "..", "..", "package.json")` | Used `__dirname` path for reliability across cwd changes |
| `process.exit(1)` on failure | Existing commands use `exitCode = 1` + return | Followed repo convention (`exitCode = 1`, `stderr.write`) |
| Tests use `vitest` + `expect()` | Repo uses `node:test` + `node:assert/strict` | Adapted to existing test framework |

## Verification

- `npm run build` — clean, no TS errors, shebang preserved
- `npm run typecheck` — passes
- `npm run smoke` — forge --version works, CLI entry intact
- `npx tsc -p tsconfig.test.json && node dist-tests/tests/update.test.js` — 5/5 pass
- `forge update --dry-run` — outputs version info, exits 0
- `forge update` — outputs "up to date", exits 0
- `forge update --yes` — handled in code (not executed globally in tests)

## Non-Goals Preserved

- No auto-update without user consent (only with `--yes`)
- No rollback support
- No mid-session update (takes effect on next invocation)
- No changes to existing Forge stages (intake, plan, verify, split, execute, integrate)
