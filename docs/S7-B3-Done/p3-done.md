# Step 7 Batch 3 Part 3 Done — Release Process

## Implemented Spec
- `step7/tasks/batch_3/task_3_release_process.md`

## What Changed

### `CHANGELOG.md` — NEW
- Keep a Changelog format with SemVer reference
- Initial V1.0.0 entry dated 2026-04-21 listing all major features:
  - Core workflow: intake, plan, verify, split, execute, integrate
  - Step 7: init, doctor, update, config, env vars, Docker, GitHub Actions, npm packaging

### `scripts/release.sh` — NEW
- Bash script accepting `patch|minor|major` (default: patch)
- Pre-flight: checks clean working tree (uncommitted or staged changes block)
- Reads current version, bumps via `npm version --no-git-tag-version`
- Runs `npm run build` (prepublishOnly handles dist via `files: ["dist"]`)
- Updates CHANGELOG date on the latest version header
- Commits `package.json` + `package-lock.json` + `CHANGELOG.md`
- Creates git tag `vX.Y.Z`
- **Does NOT push or publish** — prints clear manual next steps
- Warns about npm account + 2FA requirements

### `scripts/changelog.sh` — NEW
- Generates changelog entry from `git log --oneline`
- Optional `since_ref` argument scopes to commits since a given ref

### `scripts/publish.sh` — NEW
- Pre-publish readiness check
- Verifies `npm whoami` (catches not-logged-in)
- Runs `npm publish --dry-run --access public`
- Prints instructions for real publish

### `docs/release-process.md` — NEW
- Versioning (SemVer), Pre-Release Checklist, Release Steps (patch/minor/major)
- Manual Release fallback steps
- npm Account Requirements, Post-Publish Verification

### `docs/NPM-TODO.md` — NEW
- Step-by-step manual checklist for publishing to npm
- Covers: npm signup, 2FA setup, organization creation, login verification, pre-flight checks, version decision, dry-run, publish, verify, GitHub Release creation
- Troubleshooting section for common errors

### `tests/release-process.test.ts` — NEW
- 15 tests using `node:test` + `node:assert/strict`
- Validates: CHANGELOG exists with proper format and V1 entry
- Validates: all 3 scripts exist and are executable
- Validates: scripts contain expected commands (`npm version`, `npm publish --dry-run`)
- Validates: docs exist with release/vocabulary content
- Validates: package.json has `release`, `changelog`, `publish:dry` scripts

### `package.json` — MODIFY
- Added to `scripts`:
  - `"release": "bash scripts/release.sh"`
  - `"changelog": "bash scripts/changelog.sh"`
  - `"publish:dry": "bash scripts/publish.sh"`
- Appended `&& node dist-tests/tests/release-process.test.js` to test chain

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `git add dist/` in release.sh | `dist/` is `.gitignore`-d intentionally | **Removed from git commit** — `files: ["dist"]` + `prepublishOnly` handles build output at publish time |
| `npm shrinkwrap` | `package-lock.json` is already tracked in git | **Not needed** — package-lock is sufficient |
| Auto-publish on tag | Non-goal says no CI publishing | **Leave `.github/workflows/release.yml` disabled** — manual release per non-goal |
| Version in release.sh defaults to patch | Good default for post-V1 releases | **Kept `patch` as default** with explicit `patch|minor|major` args |

## Verification

- `npm run build` — clean
- `npm run typecheck` — pass
- `npm run smoke` — pass
- `node dist-tests/tests/release-process.test.js` — **15/15 pass**, 0 failures
- `npm publish --dry-run` — passes (already verified on live repo prior to task)

## Non-Goals Preserved

- No actual npm publish during task execution (only dry-run infrastructure)
- No GitHub Releases auto-created (manual step)
- No CI/CD automatic publishing (release.yml stays manual-only)
