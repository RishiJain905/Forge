# Step 7 Batch 3 Part 2 Done — Docker Integration

## Implemented Spec
- `step7/tasks/batch_3/task_2_docker.md`

## What Changed

### `Dockerfile` — NEW
- Multi-stage build using `node:20-alpine`
- Stage 1 (builder): copies `package*.json`, runs `npm ci`, copies source, runs `npm run build`, then `npm prune --omit=dev`
- Stage 2 (runtime): installs `git` and `curl` via `apk add --no-cache`, copies `dist/`, `package.json`, and `node_modules` from builder
- Creates non-root user `forge` (uid 1001) with group `forge` (gid 1001)
- `USER forge`, `WORKDIR /home/forge`
- `ENTRYPOINT ["node", "/app/dist/src/index.js"]`

### `docker-compose.yml` — NEW
- Service `forge` with image `forge:latest`, build context `.`
- Volume mounts: `.:/repo` (host repo), `forge-data:/home/forge/.forge` (persisted config)
- Environment: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `FORGE_MODEL`, `FORGE_LOG_LEVEL`, `FORGE_EXECUTE_PARALLEL`, `FORGE_MAX_WORKSTREAMS`
- `working_dir: /repo`, default `command: --help`

### `.dockerignore` — NEW
- Excludes `.git/`, `node_modules/`, `dist/`, `.forge/`, IDE artifacts, OS files, test files, coverage, docs, and `*.md`

### `docker/Makefile` — NEW
- `build`: `docker build -t forge:latest ..`
- `run`: runs container with volume mounts and env passthrough for generic commands
- `build-and-plan`: builds then runs `forge plan --repo /repo --output-dir /repo/.forge`
- `clean`: removes image and named volume

### `docs/docker.md` — NEW
- Usage documentation covering Quick Start, Docker Compose, Environment Variables, Volume Mapping, Makefile Targets, Security, and Non-Goals

### `tests/docker.test.ts` — NEW
- 16 tests using `node:test` + `node:assert/strict`
- Validates Dockerfile: node:20-alpine, multi-stage build, correct entrypoint (`dist/src/index.js`), non-root user, no `.forge/` copied, no hardcoded API keys, git installed
- Validates .dockerignore: required exclusions present
- Validates docker-compose.yml: valid YAML, forge service with volumes/environment/working_dir, forge:latest image, .forge volume, API key env vars
- Validates docker/Makefile: build target with docker build
- Validates docs/docker.md: exists with build instructions

### `package.json` — MODIFY
- Appended `&& node dist-tests/tests/docker.test.js` to the `test` script chain

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `ENTRYPOINT ["node", "dist/cli.js"]` | Actual built CLI is `dist/src/index.js` | **Used `dist/src/index.js`** matching `package.json` `bin.forge` |
| `plan --spec .forge/task-spec.yaml` | No `--spec` flag on plan command | **Used `plan --repo /repo --output-dir /repo/.forge`** |
| `environment: - OPENAI_API_KEY=***` | Placeholder leaked API key pattern | **Fixed to `${OPENAI_API_KEY}`** env var reference post-delegation |
| `docker-compose.yml` includes `FORGE_OPENAI_API_KEY` | Standard CLI reads `OPENAI_API_KEY` directly | **Used `OPENAI_API_KEY`** for model keys, `FORGE_*` for config overrides (consistent with config system from Batch 2 Task 3) |

## Verification

- `npm run build` — clean, no TS errors
- `npm run typecheck` — passes
- `npm run smoke` — forge --version works
- `node dist-tests/tests/docker.test.js` — **16/16 pass** (0 failures, 0 skipped)
- Docker build attempted but blocked by environment permissions (Docker socket not accessible from agent process); all structural validation passes via tests

## Non-Goals Preserved

- No OpenAI/Anthropic API keys baked into image
- Forge does NOT run as root in container (non-root `forge` user)
- `.forge/` not copied into image (excluded via .dockerignore; uses volume for persistence)
- No pre-built image pushed to Docker Hub
