# Forge Step 7 — Deploy

> **Stage:** Post-Step 6 (v2 final step)
> **Purpose:** Package and distribute Forge as a installable tool so teams can run `npm install -g @forge-cli/forge` or `npx @forge-cli/forge` and use it immediately.

---

## Context

Forge is currently a repo you clone and run locally. For broader adoption — especially in teams — users need to be able to:

```bash
# Install globally
npm install -g @forge-cli/forge

# Or run without installing (npx)
npx @forge-cli/forge --version

# After install
forge --help
forge plan --prompt "Build a REST API"
forge execute
forge integrate
```

Step 7 is about making Forge a **first-class installable CLI package** — with proper versioning, changelog, deprecation handling, multi-platform support, and update notifications.

---

## What Step 7 Does

### 1. Package as npm Package

```json
{
  "name": "@forge-cli/forge",
  "version": "1.0.0",
  "description": "Reliability-first CLI for agentic software development",
  "main": "dist/index.js",
  "bin": {
    "forge": "./dist/cli.js"
  },
  "scripts": {
    "prepublishOnly": "npm run build",
    "postinstall": "forge --init 2>/dev/null || true"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "os": ["darwin", "linux", "win32"],
  "keywords": ["cli", "ai", "agentic", "development", "workflow", "forge"]
}
```

### 2. CLI Entry Point

The `forge` binary in `dist/cli.js` is a simple Node.js shebang wrapper:

```javascript
#!/usr/bin/env node
import "../dist/index.js";
```

```typescript
// src/index.ts (CLI entry, distinct from library entry)
import { runCli } from "./cli.js";

runCli();
```

The CLI is registered with Commander:

```typescript
// src/cli.ts — extended with forge init
program
  .name("forge")
  .description("Reliability-first CLI for agentic software development")
  .version(packageJson.version);

// ... all existing commands ...

program.parse(process.argv);
```

### 3. `forge init` — Repo Initialization

For repos that don't have Forge yet:

```bash
forge init                        # Interactive init
forge init --yes                  # Non-interactive, defaults
forge init --dir ./my-project     # Target specific directory
```

`forge init` creates the `.forge/` directory structure:

```
.forge/
├── config.yaml           # Forge configuration (gitignored by default)
├── forge.config.ts       # Optional: programmatic config in TypeScript
├── .forgeignore          # Files Forge should not touch
├── plan.json            # Created by forge plan
├── execute.json         # Created by forge execute
├── integrate.json        # Created by forge integrate
└── monitor/             # (optional) Created by forge monitor init
    └── config.yaml
```

Config file:

```yaml
# .forge/config.yaml
forge:
  version: "1.0.0"
  log_level: info  # debug | info | warn | error
  default_model: openai/gpt-4o
  
intake:
  default_llm_mode: auto
  
execute:
  parallel_workstreams: true
  max_workstreams: 10
  default_model: openai/gpt-4o

integrate:
  auto_run: true
  test_framework: auto  # auto-detect

monitor:
  enabled: false
  interval_minutes: 60
```

### 4. `forge update` — Self-Update

```bash
forge update              # Check for updates and prompt to install
forge update --dry-run   # Show what would be updated
forge update --yes       # Auto-update without prompting
```

```typescript
// src/update.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function checkForUpdate(): Promise<{
  current: string;
  latest: string;
  outdated: boolean;
}> {
  const current = packageJson.version;
  try {
    const { stdout } = await execAsync(
      `npm view @forge-cli/forge version`,
      { timeout: 10000 }
    );
    const latest = stdout.trim();
    return { current, latest, outdated: latest !== current };
  } catch {
    return { current, latest: current, outdated: false };
  }
}

export async function selfUpdate(): Promise<void> {
  const { outdated, latest } = await checkForUpdate();
  if (!outdated) {
    console.log("Forge is already up to date.");
    return;
  }
  console.log(`Updating Forge ${packageJson.version} → ${latest}...`);
  await execAsync(`npm install -g @forge-cli/forge@${latest}`);
  console.log("Update complete.");
}
```

### 5. `forge doctor` — Pre-Flight Checks

Before running a full pipeline, verify the environment:

```bash
forge doctor                    # Run all checks
forge doctor --fix             # Auto-fix what can be fixed
forge doctor --checks model,git # Run only specific checks
```

Checks:
| Check | What It Verifies |
|-------|-----------------|
| `node` | Node.js >= 18 installed |
| `git` | Git is installed and repo is a git repo |
| `npm` | npm is available |
| `network` | Can reach AI model endpoints |
| `config` | `.forge/config.yaml` is valid YAML |
| `permissions` | Can write to `.forge/` directory |
| `git-clean` | Working tree is clean (warns if not) |
| `model` | AI model credentials are configured |

### 6. `forge config` — Configuration Management

```bash
forge config --list                # Show current config
forge config --get execute.model   # Get specific value
forge config --set execute.model=anthropic/claude-opus-4  # Set value
forge config --unset execute.model # Remove override
forge config --edit                # Open in $EDITOR
```

Config precedence (highest to lowest):
1. CLI flags (`--model gpt-4o`)
2. `.forge/config.yaml` (repo-local)
3. `~/.forge/config.yaml` (global user config)
4. Environment variables (`FORGE_DEFAULT_MODEL`)
5. Defaults in code

### 7. Environment Variables

For CI/CD and containerized environments:

```bash
# AI Model Configuration
FORGE_OPENAI_API_KEY=sk-...
FORGE_ANTHROPIC_API_KEY=sk-ant-...
FORGE_BASE_URL=https://api.openai.com/v1  # For proxies
FORGE_MODEL=openai/gpt-4o

# Execution
FORGE_EXECUTE_PARALLEL=true
FORGE_MAX_WORKSTREAMS=10
FORGE_TIMEOUT_MS=300000

# Logging
FORGE_LOG_LEVEL=debug
FORGE_NO_COLOR=false

# Paths
FORGE_CONFIG_PATH=./.forge/config.yaml
FORGE_DATA_DIR=./.forge

# Telemetry (for Learn)
FORGE_LEARN_ENABLED=true
FORGE_LEARN_ENDPOINT=https://learn.forge.dev/ingest
```

### 8. GitHub Action Integration

A proper GitHub Action for CI:

```yaml
# .github/workflows/forge.yml
name: Forge Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install Forge
        run: npm install -g @forge-cli/forge

      - name: Forge Doctor
        run: forge doctor --checks node,git,npm,config

      - name: Forge Plan
        run: |
          forge plan \
            --spec .forge/task-spec.yaml \
            --output-dir .forge

      - name: Forge Execute
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          forge execute \
            --repo . \
            --auto \
            --model openai/gpt-4o

      - name: Forge Integrate
        run: |
          forge integrate \
            --repo . \
            --output-dir .forge

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: forge-artifacts
          path: |
            .forge/plan.json
            .forge/execute.json
            .forge/integrate.json
            .forge/integration-report.md
```

### 9. Docker Integration

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
ENTRYPOINT ["node", "dist/cli.js"]
```

```bash
# Build and run
docker build -t forge .
docker run --rm \
  -v $(pwd):/repo \
  -e FORGE_OPENAI_API_KEY \
  forge plan --repo /repo --prompt "Add user auth"
```

### 10. Release Process

#### Versioning

Forge follows **Semantic Versioning**:
- `1.0.0` — Initial stable release
- `1.1.0` — Minor: new features, backwards compatible
- `2.0.0` — Major: breaking changes

#### Changelog

```bash
forge changelog                # Generate from git commits
forge changelog --format md   # Markdown format
forge changelog --since 1.0.0 # From specific version
```

```markdown
# Changelog

## [1.1.0] - 2025-05-01

### Added
- `forge doctor` command for pre-flight environment checks
- `forge config` for configuration management
- `forge update` for self-update functionality
- Docker support

### Changed
- `forge integrate` now auto-detects Jest and Vitest

### Fixed
- Fixed race condition in parallel workstream execution
```

#### Publishing

```bash
# Dry run first
npm publish --dry-run

# Build
npm run build

# Publish to npm (requires OTP)
npm publish --access public

# Tag
git tag v1.1.0
git push origin v1.1.0
```

### 11. Installation Modes

| Method | Command | Best For |
|--------|---------|----------|
| Global npm | `npm install -g @forge-cli/forge` | Individual developers |
| npx (no install) | `npx @forge-cli/forge <cmd>` | One-off usage |
| Project local | `npm install --save-dev @forge-cli/forge` | Teams with locked versions |
| Docker | `docker run --rm forge <cmd>` | CI/CD, containers |
| GitHub Action | `uses: forge-cli/forge-action@v1` | GitHub CI |
| Homebrew | `brew install forge-cli/tap/forge` | macOS developers |

### 12. `@forge-cli/forge-action` — GitHub Action

```yaml
# github.com/forge-cli/forge-action
name: Forge CLI
description: Run Forge CLI in your workflow
inputs:
  command:
    description: "Forge command to run"
    required: true
    default: "--help"
  version:
    description: "Forge version (tag)"
    required: false
    default: "latest"
  token:
    description: "GitHub token for API access"
    required: false
runs:
  using: composite
  steps:
    - shell: bash
      run: |
        VERSION=${{ inputs.version }}
        if [ "$VERSION" = "latest" ]; then
          VERSION=$(npm view @forge-cli/forge version)
        fi
        npx @forge-cli/forge@$VERSION ${{ inputs.command }}
```

---

## Architecture

### Directory Structure (Post-Step 7)

```
forge/
├── src/
│   ├── cli.ts          # Main CLI entry with Commander
│   ├── index.ts        # Library entry (for programmatic use)
│   ├── doctor.ts       # Pre-flight checks
│   ├── update.ts       # Self-update logic
│   ├── config.ts       # Config management
│   ├── init.ts         # forge init
│   ├── changelog.ts    # Changelog generation
│   ├── doctor/
│   │   ├── checks.ts   # Check registry
│   │   ├── node.ts     # Node version check
│   │   ├── git.ts      # Git check
│   │   ├── npm.ts      # npm check
│   │   ├── network.ts  # Network connectivity
│   │   └── config.ts   # Config validity
│   ├── execute/        # (existing)
│   ├── integrate/      # (existing)
│   ├── plan/           # (existing)
│   ├── verify/         # (existing)
│   ├── split/          # (existing)
│   ├── intake/         # (existing)
│   ├── monitor/        # (future_idea_implementation)
│   └── learn/          # (future_idea_implementation)
├── dist/               # Compiled output
├── scripts/
│   ├── build.sh        # Production build
│   ├── publish.sh      # npm publish wrapper
│   └── release.sh      # Tag + changelog + publish
├── .github/
│   └── workflows/
│       ├── test.yml    # CI on every PR
│       ├── release.yml  # Publish on tag
│       └── forge.yml   # Forge action definition
├── Dockerfile
├── docker-compose.yml
├── package.json
├── CHANGELOG.md
└── README.md
```

### Package Exports

```json
{
  "name": "@forge-cli/forge",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./cli": {
      "import": "./dist/cli.js",
      "types": "./dist/cli.d.ts"
    },
    "./package.json": "./package.json"
  }
}
```

---

## CLI Surface (Step 7 Commands)

```
forge --version              # Show version
forge --help                 # Show all commands
forge init [--dir <path>] [--yes]   # Initialize .forge/
forge doctor [--fix] [--checks x,y] # Pre-flight checks
forge update [--dry-run] [--yes]    # Self-update
forge config --list          # Show config
forge config --get <key>     # Get value
forge config --set <key>=<val>  # Set value
forge config --unset <key>   # Remove override
forge config --edit          # Open in $EDITOR
forge changelog [--since v1.0.0] [--format md]
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
- `npx @forge-cli/forge --version` — Works without installing

---

## Non-Goals

- **Not a hosted service** — Forge remains a local CLI tool
- **Not a web dashboard** — Use external tools for visualization
- **Not a replacement for CI/CD** — Integrate with existing CI, don't replace it
- **Not a cloud execution platform** — All AI execution happens in the user's environment

---

## Open Questions

1. Should `@forge-cli/forge` publish to both `npm` and `GitHub Packages`?
2. Should there be a `forge login` for storing AI credentials encrypted locally?
3. Should Forge support auto-update notifications (like `npm` does)?
4. Should there be a `forge shell` command for interactive REPL-style usage?
5. Should `forge upgrade` handle migrating config between major versions?
6. Should the GitHub Action support `cache: true` for npm dependency caching?
7. What is the minimum Node.js version? (currently 18)
