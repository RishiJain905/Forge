# Task 3: Environment Variables

## Goal

Add first-class environment variable support so all Forge configuration can be set via `FORGE_*` environment variables for CI/CD, Docker, and scripted usage. Document all supported environment variables.

## Context

Read these first:
- `src/config.ts` — Config system (already has env override support)
- `src/update.ts` — Already uses FORGE_* pattern
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 219-246)

## What To Do

### 1. Extend `src/config.ts` env support

The env variable support should be comprehensive. Update `getEnvOverrides()` in `src/config.ts` to support all documented env vars:

```typescript
function getEnvOverrides(): Partial<ConfigValues> {
  const overrides: Partial<ConfigValues> = {};

  // Forge settings
  if (process.env.FORGE_LOG_LEVEL) {
    overrides.forge = overrides.forge || {};
    overrides.forge.log_level = process.env.FORGE_LOG_LEVEL;
  }
  if (process.env.FORGE_DEFAULT_MODEL) {
    overrides.forge = overrides.forge || {};
    overrides.forge.default_model = process.env.FORGE_DEFAULT_MODEL;
  }
  if (process.env.FORGE_NO_COLOR) {
    overrides.forge = overrides.forge || {};
    overrides.forge.log_level = process.env.FORGE_NO_COLOR === "true" ? "info" : overrides.forge?.log_level;
  }

  // Intake settings
  if (process.env.FORGE_INTAKE_DEFAULT_LLM_MODE) {
    overrides.intake = overrides.intake || {};
    overrides.intake.default_llm_mode = process.env.FORGE_INTAKE_DEFAULT_LLM_MODE;
  }

  // Execute settings
  if (process.env.FORGE_EXECUTE_PARALLEL !== undefined) {
    overrides.execute = overrides.execute || {};
    overrides.execute.parallel_workstreams = process.env.FORGE_EXECUTE_PARALLEL === "true";
  }
  if (process.env.FORGE_MAX_WORKSTREAMS) {
    overrides.execute = overrides.execute || {};
    overrides.execute.max_workstreams = parseInt(process.env.FORGE_MAX_WORKSTREAMS, 10);
  }
  if (process.env.FORGE_TIMEOUT_MS) {
    // Store in a way that can be used by execute
    process.env.FORGE_TIMEOUT_MS = process.env.FORGE_TIMEOUT_MS;
  }
  if (process.env.FORGE_DEFAULT_MODEL) {
    overrides.execute = overrides.execute || {};
    overrides.execute.default_model = process.env.FORGE_DEFAULT_MODEL;
  }

  // Integrate settings
  if (process.env.FORGE_INTEGRATE_AUTO_RUN !== undefined) {
    overrides.integrate = overrides.integrate || {};
    overrides.integrate.auto_run = process.env.FORGE_INTEGRATE_AUTO_RUN === "true";
  }
  if (process.env.FORGE_INTEGRATE_TEST_FRAMEWORK) {
    overrides.integrate = overrides.integrate || {};
    overrides.integrate.test_framework = process.env.FORGE_INTEGRATE_TEST_FRAMEWORK;
  }

  // Paths
  if (process.env.FORGE_CONFIG_PATH) {
    process.env.FORGE_CONFIG_PATH = process.env.FORGE_CONFIG_PATH;
  }
  if (process.env.FORGE_DATA_DIR) {
    process.env.FORGE_DATA_DIR = process.env.FORGE_DATA_DIR;
  }

  return overrides;
}
```

### 2. Create environment variable documentation

Add a comprehensive list of all environment variables to the README or create `docs/env-variables.md`:

```markdown
# Forge Environment Variables

Forge supports all configuration via environment variables for CI/CD, Docker, and scripted usage.

## AI Model Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_OPENAI_API_KEY` | OpenAI API key | — |
| `FORGE_ANTHROPIC_API_KEY` | Anthropic API key | — |
| `FORGE_BASE_URL` | Base URL for API proxy | `https://api.openai.com/v1` |
| `FORGE_MODEL` | Default model (e.g., `openai/gpt-4o`) | `openai/gpt-4o` |
| `FORGE_DEFAULT_MODEL` | Alias for FORGE_MODEL | `openai/gpt-4o` |

## Execution

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_EXECUTE_PARALLEL` | Enable parallel workstreams | `true` |
| `FORGE_MAX_WORKSTREAMS` | Max parallel workstreams | `10` |
| `FORGE_TIMEOUT_MS` | Execution timeout in ms | `300000` |

## Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_LOG_LEVEL` | Log level: `debug\|info\|warn\|error` | `info` |
| `FORGE_NO_COLOR` | Disable color output | `false` |

## Paths

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_CONFIG_PATH` | Path to config file | `.forge/config.yaml` |
| `FORGE_DATA_DIR` | Forge data directory | `.forge` |

## Intake

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_INTAKE_DEFAULT_LLM_MODE` | Default LLM mode | `auto` |

## Integrate

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGE_INTEGRATE_AUTO_RUN` | Auto-run tests after generation | `true` |
| `FORGE_INTEGRATE_TEST_FRAMEWORK` | Test framework: `auto\|jest\|vitest\|mocha` | `auto` |

## Debug

| Variable | Description |
|----------|-------------|
| `FORGE_INTAKE_DEBUG=1` | Emit intake debug artifacts |
| `FORGE_PLAN_DEBUG=1` | Emit plan debug artifacts |
| `FORGE_VERIFY_DEBUG=1` | Emit verify debug artifacts |
| `FORGE_SPLIT_DEBUG=1` | Emit split debug artifacts |
| `FORGE_EXECUTE_DEBUG=1` | Emit execute debug artifacts |
| `FORGE_INTEGRATE_DEBUG=1` | Emit integrate debug artifacts |

## Usage Examples

### Docker

```bash
docker run --rm \
  -v $(pwd):/repo \
  -e FORGE_OPENAI_API_KEY \
  -e FORGE_MODEL=openai/gpt-4o \
  forge plan --repo /repo --prompt "Add user auth"
```

### GitHub Actions

```yaml
- name: Forge Plan
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    FORGE_MODEL: openai/gpt-4o
    FORGE_LOG_LEVEL: debug
  run: forge plan --spec .forge/task-spec.yaml
```

### CI/CD

```bash
export FORGE_OPENAI_API_KEY="$OPENAI_API_KEY"
export FORGE_EXECUTE_PARALLEL=true
export FORGE_MAX_WORKSTREAMS=5
forge execute --auto
```
```

### 3. Ensure env vars are documented in CLI help

Check that all env vars are mentioned in relevant command help output.

### 4. Add tests

```typescript
// tests/config-env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("environment variable support", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("FORGE_LOG_LEVEL overrides log_level", () => {
    process.env.FORGE_LOG_LEVEL = "debug";
    const { sources } = resolveConfig();
    expect(sources["forge.log_level"]).toMatch(/env:|default/);
  });

  it("FORGE_EXECUTE_PARALLEL sets parallel_workstreams", () => {
    process.env.FORGE_EXECUTE_PARALLEL = "false";
    const { values } = resolveConfig();
    expect(values.execute?.parallel_workstreams).toBe(false);
  });

  it("FORGE_MAX_WORKSTREAMS sets max_workstreams", () => {
    process.env.FORGE_MAX_WORKSTREAMS = "5";
    const { values } = resolveConfig();
    expect(values.execute?.max_workstreams).toBe(5);
  });

  it("FORGE_MODEL sets default_model", () => {
    process.env.FORGE_MODEL = "anthropic/claude-opus-4";
    const { values } = resolveConfig();
    expect(values.forge?.default_model).toBe("anthropic/claude-opus-4");
  });
});
```

## Verification

- All documented `FORGE_*` env vars are read by the config system
- Env vars take precedence over `.forge/config.yaml`
- `forge config --list` shows `env:KEY` as source for env-var values
- Tests pass: `npm test`

## Files Modified

- `src/config.ts` — MODIFY — extend env override coverage
- `docs/env-variables.md` — NEW — env var documentation (or add to existing docs)

## Non-Goals

- Do not change runtime behavior of commands to read env vars directly (use the config system)
- Do not add new env vars not documented in the spec
- Do not implement env var validation (warn on unknown vars instead)
