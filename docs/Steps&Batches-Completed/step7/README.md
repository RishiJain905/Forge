# Step 7 — Deploy: Package & Distribute Forge

## Overview

Step 7 packages and distributes Forge as an installable CLI tool (`@forgecli/forge`) so teams can run `npm install -g @forgecli/forge` or `npx @forgecli/forge` and use it immediately. This is the final step before V1 is complete.

## What This Step Does

- Configures `package.json` for npm publishing (`@forgecli/forge`)
- Adds `forge init` to create `.forge/` directory structure with config
- Adds `forge doctor` for pre-flight environment checks
- Adds `forge update` for self-update functionality
- Adds `forge config` for configuration management
- Adds environment variable support for CI/CD
- Adds GitHub Action workflow for CI
- Adds Dockerfile and Docker integration
- Establishes release process (versioning, changelog, publishing)

## Spec Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Architecture, batches, tasks, verification checklist |
| `progress.md` | Current batch/task status and commit history |

## Context Files (Read First)

- `src/cli.ts` — Existing CLI entry with Commander
- `src/index.ts` — Library entry point
- `package.json` — Current npm configuration
- `future_idea_implementation/step7-deploy.md` — Full design reference

## Batch Summary

### Batch 1: Core Packaging + CLI Foundation
| # | Task | Agent |
|---|------|-------|
| 1 | npm Packaging | package.json, bin entry, engines, exports, shebang CLI |
| 2 | forge init | `.forge/` directory, config.yaml, .forgeignore creation |
| 3 | forge doctor | Pre-flight checks (node, git, npm, network, config, permissions) |

### Batch 2: Update + Config + Env
| # | Task | Agent |
|---|------|-------|
| 1 | forge update | Self-update via `npm view @forgecli/forge version` |
| 2 | forge config | list/get/set/unset/edit with precedence chain |
| 3 | Env Variables | FORGE_* env var support for all config keys |

### Batch 3: CI/CD + Docker + Release
| # | Task | Agent |
|---|------|-------|
| 1 | GitHub Action | `.github/workflows/forge.yml` with forge commands |
| 2 | Docker | Dockerfile + docker-compose.yml |
| 3 | Release Process | Changelog, versioning, `npm publish --access public` |

## Quick Start

1. Read `SPEC.md` for full context
2. Read relevant source files to understand current structure
3. Implement batches and tasks in order (Batch 1 → 2 → 3)
4. Update tests in `tests/*.test.ts`
5. Verify against checklist in `SPEC.md`

## Completion

After all batches complete → Step 7 is complete and Forge V1 is frozen + published.
