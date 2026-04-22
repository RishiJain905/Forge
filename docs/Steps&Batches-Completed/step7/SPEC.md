# Step 7 — Deploy: Package & Distribute Forge as an Installable CLI

## Goal

Package Forge as a first-class installable CLI (`@forgecli/forge`) so teams can run `npm install -g @forgecli/forge` or `npx @forgecli/forge` and use it immediately. After Step 7, Forge has proper versioning, init, doctor, update, config, Docker, GitHub Actions, and release tooling.

---

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

---

## What This Step Is NOT

- A hosted service or web dashboard
- A replacement for CI/CD — integrate with existing CI
- A cloud execution platform — all AI execution happens locally
- A redesign of existing Steps 1-6 behavior

---

## Context Files (Read First)

- `src/cli.ts` — Existing CLI entry with Commander
- `src/index.ts` — Library entry point
- `package.json` — Current npm configuration
- `future_idea_implementation/step7-deploy.md` — Full design reference

---

## Architecture

### Where Step 7 Fits

```
forge intake / forge plan / forge verify / forge split / forge execute / forge integrate
                                                                                ↓
                                          Package as @forgecli/forge
                                                       ↓
                              forge init / forge doctor / forge update / forge config
                                                       ↓
                                         V1 FROZEN + PUBLISHED
```

### File Structure

```
step7/
├── SPEC.md              — This file
├── README.md            — Step 7 index
├── progress.md          — Progress tracking
└── tasks/
    ├── batch_1/
    │   ├── task_1_npm_packaging.md        — npm package.json, bin entry, engines, exports
    │   ├── task_2_forge_init.md           — forge init command, config.yaml, .forgeignore
    │   └── task_3_forge_doctor.md          — forge doctor pre-flight checks
    ├── batch_2/
    │   ├── task_1_forge_update.md          — Self-update via npm view
    │   ├── task_2_forge_config.md          — Config management (list/get/set/unset/edit)
    │   └── task_3_env_variables.md         — Environment variable support
    └── batch_3/
        ├── task_1_github_action.md         — GitHub Action workflow
        ├── task_2_docker.md                — Dockerfile + docker-compose
        └── task_3_release_process.md       — Versioning, changelog, publishing

src/
├── cli.ts               MODIFY — add init, doctor, update, config commands
├── index.ts             MODIFY — library entry point
├── doctor.ts            NEW — forge doctor checks
├── update.ts            NEW — self-update logic
├── config.ts            NEW — config management
├── init.ts              NEW — forge init
├── doctor/
│   ├── index.ts         NEW — check registry
│   ├── node.ts          NEW — Node >=18 check
│   ├── git.ts           NEW — git installed + repo check
│   ├── npm.ts           NEW — npm available check
│   ├── network.ts       NEW — AI endpoint reachability
│   └── config.ts        NEW — .forge/config.yaml validity

.github/
└── workflows/
    ├── test.yml         MODIFY — existing CI
    └── forge-action.yml NEW — Forge action definition

Dockerfile               NEW
docker-compose.yml       NEW
```

---

## Batches

### Batch 1: Core Packaging + CLI Foundation
| # | Task | Description |
|---|------|-------------|
| 1 | npm Packaging | package.json, bin entry, engines, exports, shebang CLI |
| 2 | forge init | `.forge/` directory, config.yaml, .forgeignore creation |
| 3 | forge doctor | Pre-flight checks (node, git, npm, network, config, permissions) |

### Batch 2: Update + Config + Env
| # | Task | Description |
|---|------|-------------|
| 1 | forge update | Self-update via `npm view @forgecli/forge version` |
| 2 | forge config | list/get/set/unset/edit with precedence chain |
| 3 | Env Variables | FORGE_* env var support for all config keys |

### Batch 3: CI/CD + Docker + Release
| # | Task | Description |
|---|------|-------------|
| 1 | GitHub Action | `.github/workflows/forge.yml` with forge commands |
| 2 | Docker | Dockerfile + docker-compose.yml |
| 3 | Release Process | Changelog, versioning, `npm publish --access public` |

---

## CLI Surface (Step 7 Commands)

```
forge --version              # Show version
forge --help                 # Show all commands
forge init [--dir <path>] [--yes]              # Initialize .forge/
forge doctor [--fix] [--checks x,y]            # Pre-flight checks
forge update [--dry-run] [--yes]                # Self-update
forge config --list                            # Show config
forge config --get <key>                       # Get value
forge config --set <key>=<val>                 # Set value
forge config --unset <key>                     # Remove override
forge config --edit                            # Open in $EDITOR
```

---

## Verification

- `npm run build` — Produces clean `dist/` with no TypeScript errors
- `npm publish --dry-run` — Passes without errors
- `forge --version` — Prints correct version
- `forge --help` — Shows all commands with descriptions
- `forge init` — Creates valid `.forge/config.yaml`
- `forge doctor` — All checks pass on clean environment
- `forge update --dry-run` — Reports current vs latest version
- `forge config --list` — Shows all config values with sources
- GitHub Action `forge-action` — Works in a real workflow
- Docker build + run — Works in a container
- `npx @forgecli/forge --version` — Works without installing

---

## Non-Goals

- **Not a hosted service** — Forge remains a local CLI tool
- **Not a web dashboard** — Use external tools for visualization
- **Not a replacement for CI/CD** — Integrate with existing CI, don't replace it
- **Not a cloud execution platform** — All AI execution happens in the user's environment
