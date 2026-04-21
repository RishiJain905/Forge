# Forge Environment Variables

Forge CLI supports a `FORGE_*` environment variable namespace for overriding default and per-repo configuration values.

Priority from lowest to highest:
1. Hard-coded defaults
2. `.forge/config.yaml`
3. `FORGE_*` environment variables

## Quick Reference

| Variable | Type | Default | Key |
|----------|------|---------|-----|
| `FORGE_LOG_LEVEL` | string | `info` | `forge.log_level` |
| `FORGE_DEFAULT_MODEL` | string | `openai/gpt-4o` | `forge.default_model` |
| `FORGE_MODEL` | string | `openai/gpt-4o` | `forge.default_model` |
| `FORGE_NO_COLOR` | boolean | `false` | `forge.no_color` |
| `FORGE_INTAKE_DEFAULT_LLM_MODE` | string | `auto` | `intake.default_llm_mode` |
| `FORGE_EXECUTE_PARALLEL` | boolean | `true` | `execute.parallel_workstreams` |
| `FORGE_MAX_WORKSTREAMS` | number | `10` | `execute.max_workstreams` |
| `FORGE_EXECUTE_DEFAULT_MODEL` | string | `openai/gpt-4o` | `execute.default_model` |
| `FORGE_INTEGRATE_AUTO_RUN` | boolean | `true` | `integrate.auto_run` |
| `FORGE_INTEGRATE_TEST_FRAMEWORK` | string | `auto` | `integrate.test_framework` |

### Boolean parsing

`FORGE_NO_COLOR` follows presence semantics: any non-empty value disables color.  
For all other boolean variables, set to `"true"` to enable. Any other value (including `"false"`) is treated as `false`.

### Number parsing
Supplied as a decimal string (e.g. `"25"`) and parsed with `parseInt(value, 10)`. Non-numeric strings coerce to `NaN`.

## AI Model

- **`FORGE_LOG_LEVEL`** — Log verbosity (`debug`, `info`, `warn`, `error`).
- **`FORGE_DEFAULT_MODEL`** — Default model for all steps unless overridden.
- **`FORGE_MODEL`** — Alias for `forge.default_model`. Takes priority over `FORGE_DEFAULT_MODEL` when both are set.

## Execution

- **`FORGE_EXECUTE_PARALLEL`** — Enable or disable parallel workstream execution.
- **`FORGE_MAX_WORKSTREAMS`** — Cap the maximum number of concurrent workstreams.
- **`FORGE_EXECUTE_DEFAULT_MODEL`** — Model specifically used in the execute stage.

## Logging

- **`FORGE_NO_COLOR`** — Any non-empty value disables ANSI color codes in CLI output.

## Intake

- **`FORGE_INTAKE_DEFAULT_LLM_MODE`** — Intake LLM assistance mode (`auto`, `enabled`, `disabled`).

## Integrate

- **`FORGE_INTEGRATE_AUTO_RUN`** — Enable or disable auto-run of integration tests.
- **`FORGE_INTEGRATE_TEST_FRAMEWORK`** — Override the auto-detected test framework (e.g. `jest`, `vitest`, `pytest`).

## Usage Examples

### Local shell

```bash
FORGE_LOG_LEVEL=debug forge config --list
FORGE_MODEL=anthropic/claude-3-opus forge execute --auto
```

### Docker

```dockerfile
ENV FORGE_LOG_LEVEL=warn
ENV FORGE_MAX_WORKSTREAMS=20
ENV FORGE_NO_COLOR=true
CMD ["forge", "execute", "--auto"]
```

### GitHub Actions

```yaml
- name: Run Forge
  env:
    FORGE_LOG_LEVEL: debug
    FORGE_MODEL: openai/gpt-4o
    FORGE_EXECUTE_PARALLEL: "true"
    FORGE_MAX_WORKSTREAMS: 5
  run: forge execute --auto
```

### CI/CD shell

```bash
#!/usr/bin/env bash
export FORGE_NO_COLOR=true
export FORGE_MAX_WORKSTREAMS=4
export FORGE_INTEGRATE_AUTO_RUN=false
forge integrate
```

## Notes

- Unknown `FORGE_*` variables are ignored and do not cause runtime errors.
- Environment variable sources are surfaced by `forge config --list` as `env:FORGE_VAR_NAME`.
