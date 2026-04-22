# Step 7 Batch 1 Part 1 Done — npm Packaging

## Implemented Spec
- `step7/tasks/batch_1/task_1_npm_packaging.md`

## What Changed

### package.json Updates
- Renamed package from `forge-cli` to `@forgecli/forge`
- Bumped version from `0.1.0` to `1.0.0`
- Added `main`: `dist/src/index.js`
- Kept `bin.forge`: `./dist/src/index.js` (matches real build output)
- Added `os`: `["darwin", "linux", "win32"]`
- Added `keywords`: `["cli", "ai", "agentic", "development", "workflow", "forge"]`
- Added `exports` map with main entry and package.json subpath
- Added `repository`: `{ "type": "git", "url": "https://github.com/RishiJain905/Forge" }`
- Added `license`: `"MIT"`
- Added `publishConfig`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }`
- Added `prepublishOnly` script: `npm run build`
- Updated `build` script: `tsc -p tsconfig.build.json && node scripts/fix-shebang.js`
- Kept `engines.node`: `>=20` (spec said >=18, live repo uses >=20 — kept stricter)

### scripts/fix-shebang.js — NEW
- Post-build safety net that prepends `#!/usr/bin/env node` to `dist/src/index.js` if missing
- Runs automatically as part of `npm run build`
- Idempotent — no-ops if shebang already present

### tests/npm-packaging.test.ts — NEW
- Dedicated test suite for npm packaging contract
- 15 tests covering: package name, version, bin entry, engines, os, keywords, exports, repository, license, publishConfig, type module, files, prepublishOnly, and shebang preservation
- Wired into default `npm test` gate

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `bin: ./dist/cli.js` | `bin: ./dist/src/index.js` | Keep live repo path (real build output) |
| `engines: >=18` | `engines: >=20` | Keep >=20 (stricter, already established) |
| Separate `dist/cli.js` wrapper | `src/index.ts` already has shebang | No wrapper needed, use fix-shebang.js as safety net |

## postinstall Script
- The spec references `postinstall: "forge --init 2>/dev/null || true"` but `forge init` does not exist yet (it is Batch 1 Task 2)
- Deferred: postinstall will be added when `forge init` is implemented

## Verification
- `npm run build` — clean with no TypeScript errors
- `npm run typecheck` — no type errors
- `npm test` — all tests pass including 15 new npm-packaging tests
- `npm run smoke` — all existing CLI behavior unchanged
- `npm publish --dry-run` — valid package structure, `@forgecli/forge@1.0.0`

## Non-Goals Preserved
- No changes to existing CLI commands (intake, plan, verify, split, execute, integrate)
- No changes to library entry point behavior
- No actual npm publish (only configured for publishing)