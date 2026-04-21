import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "node:test";

import { resolveConfig } from "../src/config.js";
import { runForgeBinary } from "./support/forge-cli.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..");
const forgeEntrypoint = resolve(projectRoot, "dist", "src", "index.js");

const ALL_FORGE_ENV_KEYS = [
  "FORGE_LOG_LEVEL",
  "FORGE_DEFAULT_MODEL",
  "FORGE_MODEL",
  "FORGE_NO_COLOR",
  "FORGE_INTAKE_DEFAULT_LLM_MODE",
  "FORGE_EXECUTE_PARALLEL",
  "FORGE_MAX_WORKSTREAMS",
  "FORGE_EXECUTE_DEFAULT_MODEL",
  "FORGE_INTEGRATE_AUTO_RUN",
  "FORGE_INTEGRATE_TEST_FRAMEWORK",
];

function saveForgeEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ALL_FORGE_ENV_KEYS) {
    const val = process.env[key];
    saved[key] = val;
  }
  return saved;
}

function restoreForgeEnv(saved: Record<string, string | undefined>): void {
  for (const key of ALL_FORGE_ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

describe("resolveConfig env overrides", () => {
  let testDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-env-test-"));
    savedEnv = saveForgeEnv();
  });

  afterEach(async () => {
    restoreForgeEnv(savedEnv);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("overrides forge.log_level with FORGE_LOG_LEVEL", () => {
    process.env.FORGE_LOG_LEVEL = "debug";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.log_level, "debug");
  });

  it("parses FORGE_EXECUTE_PARALLEL=false as boolean false", () => {
    process.env.FORGE_EXECUTE_PARALLEL = "false";
    const { values } = resolveConfig(testDir);
    const exec = values.execute as Record<string, unknown>;
    assert.equal(exec.parallel_workstreams, false);
  });

  it("parses FORGE_EXECUTE_PARALLEL=true as boolean true", () => {
    process.env.FORGE_EXECUTE_PARALLEL = "true";
    const { values } = resolveConfig(testDir);
    const exec = values.execute as Record<string, unknown>;
    assert.equal(exec.parallel_workstreams, true);
  });

  it("parses FORGE_MAX_WORKSTREAMS as number", () => {
    process.env.FORGE_MAX_WORKSTREAMS = "25";
    const { values } = resolveConfig(testDir);
    const exec = values.execute as Record<string, unknown>;
    assert.equal(exec.max_workstreams, 25);
  });

  it("sets forge.default_model via FORGE_MODEL alias", () => {
    process.env.FORGE_MODEL = "anthropic/claude-3-opus";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.default_model, "anthropic/claude-3-opus");
  });

  it("sets forge.default_model via FORGE_DEFAULT_MODEL when FORGE_MODEL absent", () => {
    process.env.FORGE_DEFAULT_MODEL = "google/gemini-1.5-pro";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.default_model, "google/gemini-1.5-pro");
  });

  it("gives FORGE_MODEL priority over FORGE_DEFAULT_MODEL", () => {
    process.env.FORGE_DEFAULT_MODEL = "google/gemini-1.5-pro";
    process.env.FORGE_MODEL = "anthropic/claude-3-opus";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.default_model, "anthropic/claude-3-opus");
  });

  it("tracks source as env:FORGE_LOG_LEVEL when env is set", () => {
    process.env.FORGE_LOG_LEVEL = "trace";
    const { sources } = resolveConfig(testDir);
    assert.equal(sources["forge.log_level"], "env:FORGE_LOG_LEVEL");
  });

  it("tracks source as env:FORGE_MAX_WORKSTREAMS for number envs", () => {
    process.env.FORGE_MAX_WORKSTREAMS = "99";
    const { sources } = resolveConfig(testDir);
    assert.equal(sources["execute.max_workstreams"], "env:FORGE_MAX_WORKSTREAMS");
  });

  it("ignores unknown env vars without crashing", () => {
    process.env.FORGE_UNKNOWN_VAR = "something";
    (process.env as Record<string, string>)['FORGE_WEIRD'] = "true";
    assert.doesNotThrow(() => resolveConfig(testDir));
    // cleanup
    delete process.env.FORGE_UNKNOWN_VAR;
    delete (process.env as Record<string, string>)['FORGE_WEIRD'];
  });

  it("parses FORGE_NO_COLOR=true as boolean and adds forge.no_color", () => {
    process.env.FORGE_NO_COLOR = "true";
    const { values, sources } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.no_color, true);
    assert.equal(sources["forge.no_color"], "env:FORGE_NO_COLOR");
  });

  it("parses FORGE_NO_COLOR=false as boolean", () => {
    process.env.FORGE_NO_COLOR = "false";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.no_color, false);
  });

  it("leaves defaults intact when no env vars are set", () => {
    const { values, sources } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    assert.equal(forge.log_level, "info");
    assert.equal(forge.no_color, false);
    assert.equal(forge.default_model, "openai/gpt-4o");
    assert.equal(sources["forge.log_level"], "default");
    assert.equal(sources["forge.no_color"], "default");
  });

  it("overrides FORGE_DEFAULT_MODEL even when FORGE_MODEL is empty string", () => {
    process.env.FORGE_DEFAULT_MODEL = "a";
    process.env.FORGE_MODEL = "";
    const { values } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    // empty string is a valid string env value
    assert.equal(forge.default_model, "");
  });

  it("handles multiple env vars simultaneously", () => {
    process.env.FORGE_LOG_LEVEL = "warn";
    process.env.FORGE_EXECUTE_PARALLEL = "false";
    process.env.FORGE_MAX_WORKSTREAMS = "3";
    process.env.FORGE_INTEGRATE_AUTO_RUN = "false";
    const { values, sources } = resolveConfig(testDir);
    const forge = values.forge as Record<string, unknown>;
    const exec = values.execute as Record<string, unknown>;
    const integrate = values.integrate as Record<string, unknown>;
    assert.equal(forge.log_level, "warn");
    assert.equal(exec.parallel_workstreams, false);
    assert.equal(exec.max_workstreams, 3);
    assert.equal(integrate.auto_run, false);
    assert.equal(sources["forge.log_level"], "env:FORGE_LOG_LEVEL");
    assert.equal(sources["execute.parallel_workstreams"], "env:FORGE_EXECUTE_PARALLEL");
    assert.equal(sources["execute.max_workstreams"], "env:FORGE_MAX_WORKSTREAMS");
    assert.equal(sources["integrate.auto_run"], "env:FORGE_INTEGRATE_AUTO_RUN");
  });
});

describe("forge config CLI with env overrides", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-env-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("forge config --list shows env source for overridden keys", () => {
    const result = runForgeBinary(
      ["config", "--list"],
      testDir,
      { FORGE_LOG_LEVEL: "debug" },
    );
    assert.equal(result.code, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("env:FORGE_LOG_LEVEL"),
      `stdout did not include env source: ${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes("debug"),
      `stdout did not include overridden value: ${result.stdout}`,
    );
  });

  it("forge config --get with env override returns correct value", () => {
    const result = runForgeBinary(
      ["config", "--get", "forge.log_level"],
      testDir,
      { FORGE_LOG_LEVEL: "trace" },
    );
    assert.equal(result.code, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("trace"),
      `stdout did not include trace: ${result.stdout}`,
    );
  });

  it("forge config --get with FORGE_MODEL alias resolves correctly", () => {
    const result = runForgeBinary(
      ["config", "--get", "forge.default_model"],
      testDir,
      { FORGE_MODEL: "perplexity/sonar" },
    );
    assert.equal(result.code, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("perplexity/sonar"),
      `stdout did not include expected model: ${result.stdout}`,
    );
  });
});
