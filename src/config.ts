import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { load, dump } from "js-yaml";
import { spawn } from "node:child_process";

const DEFAULT_VALUES: Record<string, unknown> = {
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
};

function getValueByDotPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setValueByDotPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      !(part in current) ||
      typeof current[part] !== "object" ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function deleteValueByDotPath(
  obj: Record<string, unknown>,
  path: string,
): boolean {
  const parts = path.split(".");
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[parts[i]];
  }
  if (
    typeof current === "object" &&
    current !== null &&
    !Array.isArray(current)
  ) {
    const last = parts[parts.length - 1];
    if (last in current) {
      delete (current as Record<string, unknown>)[last];
      return true;
    }
  }
  return false;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMerge(
        target[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      target[key] = val;
    }
  }
}

function collectSources(
  obj: Record<string, unknown>,
  prefix: string,
  sourceName: string,
  sources: Record<string, string>,
): void {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val)
    ) {
      collectSources(val as Record<string, unknown>, path, sourceName, sources);
    } else {
      sources[path] = sourceName;
    }
  }
}

export interface ConfigResult {
  sources: Record<string, string>;
  values: Record<string, unknown>;
}

export function resolveConfig(cwd: string = process.cwd()): ConfigResult {
  const values: Record<string, unknown> = JSON.parse(
    JSON.stringify(DEFAULT_VALUES),
  );
  const sources: Record<string, string> = {};

  collectSources(values, "", "default", sources);

  const configPath = join(cwd, ".forge", "config.yaml");
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf8");
    const parsed = load(content) as Record<string, unknown> | null | undefined;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      deepMerge(values, parsed);
      // recompute sources: file overrides default keys
      const fileSources: Record<string, string> = {};
      collectSources(parsed, "", ".forge/config.yaml", fileSources);
      for (const key of Object.keys(fileSources)) {
        sources[key] = ".forge/config.yaml";
      }
    }
  }

  return { sources, values };
}

export function getConfigValue(
  key: string,
  cwd?: string,
): unknown {
  if (!key) {
    throw new Error("Config key must be non-empty.");
  }
  const { values } = resolveConfig(cwd);
  return getValueByDotPath(values, key);
}

export function setConfigValue(
  key: string,
  value: unknown,
  cwd?: string,
): void {
  if (!key) {
    throw new Error("Config key must be non-empty.");
  }
  const targetDir = cwd ?? process.cwd();
  const forgeDir = join(targetDir, ".forge");
  const configPath = join(forgeDir, "config.yaml");

  if (!existsSync(forgeDir)) {
    mkdirSync(forgeDir, { recursive: true });
  }

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf8");
    const parsed = load(content) as Record<string, unknown> | null | undefined;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed;
    }
  }

  setValueByDotPath(existing, key, value);
  writeFileSync(configPath, dump(existing), "utf8");
}

export function unsetConfigValue(key: string, cwd?: string): void {
  if (!key) {
    throw new Error("Config key must be non-empty.");
  }
  const targetDir = cwd ?? process.cwd();
  const configPath = join(targetDir, ".forge", "config.yaml");

  if (!existsSync(configPath)) {
    throw new Error("Key not found in config.");
  }

  const content = readFileSync(configPath, "utf8");
  const parsed = load(content) as Record<string, unknown> | null | undefined;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("Key not found in config.");
  }

  if (!deleteValueByDotPath(parsed, key)) {
    throw new Error("Key not found in config.");
  }

  writeFileSync(configPath, dump(parsed), "utf8");
}

export function openInEditor(cwd: string = process.cwd()): void {
  const configPath = join(cwd, ".forge", "config.yaml");
  const editor = process.env.EDITOR || "vi";
  spawn(editor, [configPath], { stdio: "inherit" });
}
