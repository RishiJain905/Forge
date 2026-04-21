# Step 7 Batch 3 Part 1 Done — GitHub Action Integration

## Implemented Spec
- `step7/tasks/batch_3/task_1_github_action.md`

## What Changed

### `.github/workflows/forge.yml` — NEW
- Forge Pipeline workflow demonstrating Forge usage in CI/CD
- Triggers: push to `[main, develop]`, pull_request to `[main]`
- Job: `forge` running on `ubuntu-latest`
- Steps:
  - `actions/checkout@v4` with `fetch-depth: 0`
  - `actions/setup-node@v4` with `node-version: "20"`
  - Install `@forge-cli/forge` globally via `npm install -g`
  - `forge doctor --checks node,git,npm,config`
  - `forge plan --repo . --output-dir .forge`
  - `forge execute --repo . --auto --output-dir .forge` with `OPENAI_API_KEY` from secrets
  - `forge integrate --repo . --output-dir .forge`
  - Upload artifacts via `actions/upload-artifact@v4` with name `forge-artifacts`
  - Artifact paths: `.forge/plan.json`, `.forge/execute.json`, `.forge/integrate.json`, and all `.forge/reports/*.md` files

### `.github/workflows/ci.yml` — MODIFY
- Added `push` trigger for branches `[main, develop]` (previously only `pull_request`)
- All existing behavior preserved: `validate` job, lint/typecheck/test/build/smoke steps, `timeout-minutes: 20`, concurrency block, artifact upload with `forge-build-*` naming
- `cache: npm` already present in setup-node, no change needed

### `docs/github-action.md` — NEW
- Usage documentation for using Forge in GitHub Actions CI
- Sections: Forge Pipeline Workflow, Reusable Action inputs/parameters, Usage Example, Environment Variables, Artifacts
- Notes that the actual `action.yml` composite action lives in a separate repo (`github.com/forge-cli/forge-action`)

### `tests/github-action.test.ts` — NEW
- 15 tests using `node:test` + `node:assert/strict` + `js-yaml`
- Validates YAML parsing, trigger branches, job structure, setup-node version, install step, doctor step, artifact upload naming
- Validates `ci.yml` structure, PR trigger, build/test/smoke steps, artifact naming
- Validates `docs/github-action.md` existence and content

### `package.json` — MODIFY
- Appended `&& node dist-tests/tests/github-action.test.js` to the `test` script chain

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `.github/workflows/test.yml` (NEW or MODIFY) | `.github/workflows/ci.yml` exists with mature pipeline | **Updated `ci.yml`** to add push triggers; preserved all existing behavior |
| `action.yml` composite action (create in repo) | Spec notes it belongs in separate repo | **Documented only** in `docs/github-action.md`; no `action.yml` created in this repo |
| Workflow commands with flags like `--spec` or `--model` | Live CLI has `--repo`, `--output-dir`, `--auto`, `--checks` | **Used real CLI flags** after verifying against `src/cli.ts` |
| `forge.yml` uses `plan --spec .forge/task-spec.yaml` | No `--spec` flag exists on plan command | **Removed `--spec`**; used `forge plan --repo . --output-dir .forge` |
| `execute --model openai/gpt-4o` | No `--model` flag exists on execute command | **Removed `--model`**; used `forge execute --repo . --auto --output-dir .forge` with `OPENAI_API_KEY` env |

## Verification

- `npm run build` — clean, no TS errors, shebang preserved
- `npm run typecheck` — passes
- `npm run smoke` — forge --version works, CLI entry intact
- `node dist-tests/tests/github-action.test.js` — **15/15 pass** (0 failures, 0 skipped)
- Full test chain: build gate passes; github-action tests pass at end of chain
- Workflow YAML verified structurally by tests (parses, triggers, jobs, steps)
- `forge.yml` does NOT reference non-existent CLI flags

## Non-Goals Preserved

- No actual `@forge-cli/forge-action` published to GitHub Marketplace
- No changes to existing Forge CLI commands (intake, plan, verify, split, execute, integrate)
- No GitHub-specific features added to CLI itself
- `release.yml` untouched (intentionally manual-only per existing config)
