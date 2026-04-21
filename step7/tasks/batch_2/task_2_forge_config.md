# Task 2: forge config

## Goal

Add the `forge config` command for configuration management — list all config values with their sources, get specific values, set/unset overrides, and open config in `$EDITOR`.

## Context

Read these first:
- `src/cli.ts` — Existing CLI entry with Commander
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 202-218)
- `src/init.ts` — Default config structure

## What To Do

### 1. Create `src/config.ts`

```typescript
// src/config.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "yaml";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ConfigValues {
  forge?: {
    version?: string;
    log_level?: string;
    default_model?: string;
  };
  intake?: {
    default_llm_mode?: string;
  };
  execute?: {
    parallel_workstreams?: boolean;
    max_workstreams?: number;
    default_model?: string;
  };
  integrate?: {
    auto_run?: boolean;
    test_framework?: string;
  };
  monitor?: {
    enabled?: boolean;
    interval_minutes?: number;
  };
}

export interface ResolvedConfig {
  sources: Record<string, string>; // key -> source description
  values: ConfigValues;
}

const CONFIG_DEFAULTS: ConfigValues = {
  forge: {
    version: "1.0.0",
    log_level: "info",
    default_model: "openai/gpt-4o",
  },
  intake: {
    default_llm_mode: "auto",
  },
  execute: {
    parallel_workstreams: true,
    max_workstreams: 10,
    default_model: "openai/gpt-4o",
  },
  integrate: {
    auto_run: true,
    test_framework: "auto",
  },
  monitor: {
    enabled: false,
    interval_minutes: 60,
  },
};

function getEnvOverrides(): Partial<ConfigValues> {
  const overrides: Partial<ConfigValues> = {};

  if (process.env.FORGE_LOG_LEVEL) {
    overrides.forge = overrides.forge || {};
    overrides.forge.log_level = process.env.FORGE_LOG_LEVEL;
  }
  if (process.env.FORGE_DEFAULT_MODEL) {
    overrides.forge = overrides.forge || {};
    overrides.forge.default_model = process.env.FORGE_DEFAULT_MODEL;
  }
  if (process.env.FORGE_EXECUTE_PARALLEL !== undefined) {
    overrides.execute = overrides.execute || {};
    overrides.execute.parallel_workstreams = process.env.FORGE_EXECUTE_PARALLEL === "true";
  }
  if (process.env.FORGE_MAX_WORKSTREAMS) {
    overrides.execute = overrides.execute || {};
    overrides.execute.max_workstreams = parseInt(process.env.FORGE_MAX_WORKSTREAMS, 10);
  }
  // ... other env vars

  return overrides;
}

function loadYamlConfig(configPath: string): Partial<ConfigValues> {
  if (!existsSync(configPath)) return {};
  try {
    return parse(readFileSync(configPath, "utf8")) as Partial<ConfigValues>;
  } catch {
    return {};
  }
}

export function resolveConfig(): ResolvedConfig {
  const sources: Record<string, string> = {};
  const defaults = JSON.parse(JSON.stringify(CONFIG_DEFAULTS)) as ConfigValues; // deep clone
  const merged: ConfigValues = {};

  // Start with defaults
  for (const [section, fields] of Object.entries(defaults)) {
    merged[section as keyof ConfigValues] = { ...fields as object };
    for (const [key] of Object.entries(fields as object)) {
      sources[`${section}.${key}`] = "default";
    }
  }

  // Repo-local config (.forge/config.yaml) — highest priority after env
  const repoConfigPath = resolve(process.cwd(), ".forge/config.yaml");
  const repoConfig = loadYamlConfig(repoConfigPath);
  if (repoConfigPath && existsSync(repoConfigPath)) {
    for (const [section, fields] of Object.entries(repoConfig)) {
      for (const [key, value] of Object.entries(fields as object)) {
        if (value !== undefined) {
          (merged[section as keyof ConfigValues] as Record<string, unknown>)[key] = value;
          sources[`${section}.${key}`] = `.forge/config.yaml`;
        }
      }
    }
  }

  // Env vars — highest priority
  const envOverrides = getEnvOverrides();
  for (const [section, fields] of Object.entries(envOverrides)) {
    for (const [key, value] of Object.entries(fields as object)) {
      if (value !== undefined) {
        (merged[section as keyof ConfigValues] as Record<string, unknown>)[key] = value;
        sources[`${section}.${key}`] = `env:${key.toUpperCase()}`;
      }
    }
  }

  return { sources, values: merged };
}

export function getConfigValue(key: string): { value: unknown; source: string } | null {
  const { sources, values } = resolveConfig();
  const [section, ...rest] = key.split(".");
  const fieldKey = rest.join(".");

  const sectionData = values[section as keyof ConfigValues];
  if (!sectionData) return null;

  const value = (sectionData as Record<string, unknown>)[fieldKey];
  if (value === undefined) return null;

  return { value, source: sources[key] || "default" };
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const configPath = resolve(process.cwd(), ".forge/config.yaml");

  // Ensure .forge directory exists
  const forgeDir = resolve(process.cwd(), ".forge");
  if (!existsSync(forgeDir)) {
    throw new Error(".forge/ directory does not exist. Run 'forge init' first.");
  }

  // Load existing config or create new
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      // ignore parse errors, start fresh
    }
  }

  // Set the value using dot notation
  const parts = key.split(".");
  let current: Record<string, unknown> = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;

  // Write back as YAML
  const yamlStr = Object.entries(config)
    .map(([k, v]) => `${k}:\n${objectToYaml(v as Record<string, unknown>, 2)}`)
    .join("\n");

  writeFileSync(configPath, yamlStr, "utf8");
}

export async function unsetConfigValue(key: string): Promise<void> {
  await setConfigValue(key, "");
}

export async function openInEditor(): Promise<void> {
  const configPath = resolve(process.cwd(), ".forge/config.yaml");
  const editor = process.env.EDITOR || "vi";
  await execAsync(`${editor} "${configPath}"`);
}

// Helper to convert object to YAML string without requiring yaml package serialize
function objectToYaml(obj: Record<string, unknown>, indent: number): string {
  const spaces = "  ".repeat(indent);
  return Object.entries(obj)
    .map(([key, value]) => {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${objectToYaml(value as Record<string, unknown>, indent + 1)}`;
      }
      return `${spaces}${key}: ${value}`;
    })
    .join("\n");
}
```

### 2. Add to CLI

```typescript
// src/cli.ts
import { resolveConfig, getConfigValue, setConfigValue, unsetConfigValue, openInEditor } from "./config.js";

program
  .command("config")
  .description("Show or modify Forge configuration")
  .addOption(
    new Option("--list").description("List all config values with sources")
  )
  .addOption(
    new Option("--get <key>").description("Get a specific config value")
  )
  .addOption(
    new Option("--set <key>=<value>").description("Set a config value")
  )
  .addOption(
    new Option("--unset <key>").description("Remove a config override")
  )
  .addOption(
    new Option("--edit").description("Open config in $EDITOR")
  )
  .action(async (options) => {
    if (options.list) {
      const { sources, values } = resolveConfig();
      console.log("\n=== Forge Configuration ===\n");
      for (const [key, source] of Object.entries(sources)) {
        const [section, ...rest] = key.split(".");
        const fieldKey = rest.join(".");
        const value = (values[section as keyof typeof values] as Record<string, unknown>)?.[fieldKey];
        console.log(`${key} = ${JSON.stringify(value)} (${source})`);
      }
      return;
    }

    if (options.get) {
      const result = getConfigValue(options.get);
      if (!result) {
        console.error(`Config key '${options.get}' not found.`);
        process.exit(1);
      }
      console.log(`${result.value}`);
      return;
    }

    if (options.set) {
      const [key, ...valueParts] = options.set.split("=");
      const value = valueParts.join("=");
      await setConfigValue(key.trim(), value.trim());
      console.log(`Set ${key} = ${value}`);
      return;
    }

    if (options.unset) {
      await unsetConfigValue(options.unset);
      console.log(`Unset ${options.unset}`);
      return;
    }

    if (options.edit) {
      await openInEditor();
      return;
    }

    // No option specified — show help
    program.commands.find((c) => c.name() === "config")?.outputHelp();
  });
```

### 3. Add tests

```typescript
// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { resolveConfig, getConfigValue } from "../src/config.js";

describe("forge config", () => {
  it("resolveConfig returns values with sources", () => {
    const { sources, values } = resolveConfig();
    expect(sources).toBeDefined();
    expect(values).toBeDefined();
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it("getConfigValue returns value and source for known keys", () => {
    const result = getConfigValue("forge.log_level");
    expect(result).not.toBeNull();
    expect(result?.source).toBeDefined();
  });

  it("getConfigValue returns null for unknown keys", () => {
    const result = getConfigValue("nonexistent.key");
    expect(result).toBeNull();
  });

  it("defaults are set when no config file exists", () => {
    const { values } = resolveConfig();
    expect(values.forge?.log_level).toBeDefined();
  });
});
```

## Verification

- `forge config --list` shows all config values with sources
- `forge config --get forge.log_level` returns the value
- `forge config --set forge.log_level=debug` updates config file
- `forge config --unset forge.log_level` removes the override
- `forge config --edit` opens in $EDITOR
- Tests pass: `npm test`

## Config Precedence (highest to lowest)

1. CLI flags (`--model gpt-4o`)
2. `.forge/config.yaml` (repo-local)
3. `~/.forge/config.yaml` (global user config) — future
4. Environment variables (`FORGE_*`)
5. Defaults in code

## Files Created/Modified

- `src/config.ts` — NEW — Config management
- `src/cli.ts` — MODIFY — add config command
- `tests/config.test.ts` — NEW — config tests

## Non-Goals

- Global user config (`~/.forge/config.yaml`) is not implemented in this task
- Config schema validation is not implemented in this task
- Do not change the runtime behavior of existing commands based on config values yet (that comes in later steps or as a follow-up)
