# Using Forge in GitHub Actions

This guide covers how to run Forge in GitHub Actions CI pipelines. Forge automates AI-driven development workflows—running it in CI lets you execute plans, verify outputs, and generate artifacts on every push or pull request.

> **Note:** The composite action itself (`action.yml`) lives in a separate repository at [github.com/forge-cli/forge-action](https://github.com/forge-cli/forge-action). This document describes how to *use* the action in your workflows.

---

## Forge Pipeline Workflow

A full CI pipeline that installs Forge, runs a command, and uploads the resulting artifacts is shown below.

**Example `.github/workflows/forge.yml`:**

```yaml
name: Forge Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Forge
        uses: forge-cli/forge-action@v1
        with:
          # Plan and later stages require prior artifacts (e.g. intake.json before plan).
          command: "doctor --checks node,git,npm && intake --prompt \"CI task\" --no-llm --json-only && plan && verify && split"
          version: "latest"
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Forge Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: forge-outputs
          path: .forge/
```

---

## Reusable Action

The `@forge-cli/forge-action` composite action installs Forge and runs the requested command.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `command` | yes | `--help` | Forge command to run |
| `version` | no | `latest` | Forge version tag |
| `token` | no | *(none)* | GitHub token for API access |

### Inputs Explained

- **`command`** — The exact CLI arguments passed to Forge. This can be a single subcommand (`doctor`, `plan`, `execute`) or a chain (`doctor && plan && execute`).
- **`version`** — The Forge release tag to install (e.g., `v1.2.3`). Defaults to `latest`.
- **`token`** — A GitHub personal access token or `GITHUB_TOKEN`. Required if your Forge workflow reads repository metadata, opens pull requests, or interacts with the GitHub API.

---

## Usage Example

A minimal workflow that runs a health check and exits:

```yaml
- uses: forge-cli/forge-action@v1
  with:
    command: "doctor --checks node,git,npm"
    version: "latest"
```

---

## Environment Variables

Forge respects the following environment variables. Set them via `env:` in your workflow or through repository secrets.

| Variable | Source | Purpose |
|----------|--------|---------|
| `FORGE_MODEL_PROVIDER` | Workflow `env:` | AI backend for **execute** / **integrate** (`openai`, `anthropic`, `google`, `ollama`, `glm`) |
| `FORGE_MODEL_NAME` | Workflow `env:` | Model id for that provider (e.g. `gpt-4o`) |
| `FORGE_MODEL_API_KEY` | Secret or `env:` | API key the execute connector reads (often the same value as your OpenAI/Anthropic secret) |
| `FORGE_MODEL_BASE_URL` | Optional `env:` | Override API base URL (provider-specific) |
| `FORGE_LOG_LEVEL` | Workflow `env:` | Log verbosity |
| Other `FORGE_*` | Workflow `env:` | Additional knobs mapped in `src/config.ts` (e.g. `FORGE_EXECUTE_PARALLEL`) |

`OPENAI_API_KEY` alone is **not** read by the execute AI connector; map it to `FORGE_MODEL_API_KEY` (and set provider/name) for `forge execute` / `forge integrate`.

**Example:**

```yaml
- uses: forge-cli/forge-action@v1
  env:
    FORGE_MODEL_PROVIDER: openai
    FORGE_MODEL_NAME: gpt-4o
    FORGE_MODEL_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    FORGE_LOG_LEVEL: debug
  with:
    command: "execute --auto"
```

---

## Artifacts

Forge writes outputs, logs, and generated files to the `.forge/` directory. Upload these as artifacts to inspect results, debug failures, or pass data between jobs.

```yaml
- name: Upload Forge outputs
  uses: actions/upload-artifact@v4
  with:
    name: forge-outputs
    path: .forge/
```

This ensures every CI run preserves the full context of what Forge produced, making it easy to audit AI-generated changes or troubleshoot pipeline issues.
