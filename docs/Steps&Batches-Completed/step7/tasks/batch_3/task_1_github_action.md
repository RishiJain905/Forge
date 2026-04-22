# Task 1: GitHub Action Integration

## Goal

Add a proper GitHub Action workflow (`.github/workflows/forge.yml`) that demonstrates Forge usage in CI, and define the `@forgecli/forge-action` for reusable workflow steps.

## Context

Read these first:
- `.github/workflows/` — Existing CI workflows
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 248-310, 403-431)

## What To Do

### 1. Create `.github/workflows/forge.yml`

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
        run: npm install -g @forgecli/forge

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
            .forge/reports/plan-report.md
            .forge/reports/execute-report.md
            .forge/reports/integration-report.md
```

### 2. Create `.github/workflows/test.yml` (update existing or create)

If there's an existing test workflow, update it to use `forge` tooling. If not:

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Smoke test
        run: npm run smoke
```

### 3. Create `action.yml` for `@forgecli/forge-action`

This is the reusable action definition (for publishing to GitHub Marketplace or GitHub Actions marketplace):

```yaml
# action.yml (for the forge-action repository, not this repo)
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
          VERSION=$(npm view @forgecli/forge version)
        fi
        npx @forgecli/forge@$VERSION ${{ inputs.command }}

    - shell: bash
      if: ${{ inputs.token }}
      run: |
        git config --global url."https://${{ inputs.token }}@github.com/".insteadOf "https://github.com/"
```

Note: This `action.yml` is for documentation purposes — the actual `@forgecli/forge-action` would live in a separate repository at `github.com/forge-cli/forge-action`. Document it here for now.

### 4. Document usage

Add usage examples to the README or a docs file showing how teams can use the GitHub Action.

## Verification

- `.github/workflows/forge.yml` is valid YAML
- `.github/workflows/test.yml` passes linting (if actionlint is available)
- Workflows reference correct Forge commands
- Action definition is valid

## Files Created

- `.github/workflows/forge.yml` — NEW — Forge CI workflow
- `.github/workflows/test.yml` — NEW or MODIFY — Test workflow (if not existing)
- `docs/github-action.md` — NEW — Usage documentation for the action

## Non-Goals

- Do not actually publish `@forgecli/forge-action` to the GitHub Marketplace (that's a separate repo)
- Do not change the existing Forge CLI commands
- Do not add GitHub-specific features to the CLI itself
