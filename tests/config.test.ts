import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  resolveConfig,
  getConfigValue,
  setConfigValue,
  unsetConfigValue,
} from "../src/config.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("resolveConfig", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("returns defaults when no config file exists", () => {
    const { values, sources } = resolveConfig(testDir);
    const v = values as Record<string, unknown>;
    assert.equal((v.forge as Record<string, unknown>).version, "1.0.0");
    assert.equal((v.forge as Record<string, unknown>).log_level, "info");
    assert.equal(
      (v.execute as Record<string, unknown>).parallel_workstreams,
      true,
    );
    assert.equal(sources["forge.version"], "default");
    assert.equal(sources["execute.max_workstreams"], "default");
  });

  it("merges file values with defaults", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(
      join(forgeDir, "config.yaml"),
      "forge:\n  log_level: debug\nexecute:\n  max_workstreams: 5\n",
      "utf8",
    );
    const { values, sources } = resolveConfig(testDir);
    const v = values as Record<string, unknown>;
    assert.equal((v.forge as Record<string, unknown>).log_level, "debug");
    assert.equal(
      (v.execute as Record<string, unknown>).max_workstreams,
      5,
    );
    assert.equal((v.forge as Record<string, unknown>).version, "1.0.0");
    assert.equal(sources["forge.log_level"], ".forge/config.yaml");
    assert.equal(sources["execute.max_workstreams"], ".forge/config.yaml");
    assert.equal(sources["forge.version"], "default");
  });
});

describe("getConfigValue", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("returns value for known dot key", () => {
    const value = getConfigValue("forge.version", testDir);
    assert.equal(value, "1.0.0");
  });

  it("returns undefined for unknown key", () => {
    const value = getConfigValue("forge.nonexistent", testDir);
    assert.equal(value, undefined);
  });

  it("throws for empty key", () => {
    assert.throws(() => getConfigValue("", testDir), /non-empty/);
  });
});

describe("setConfigValue", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("writes top-level key to .forge/config.yaml", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    setConfigValue("custom_key", "custom_value", testDir);
    const { values } = resolveConfig(testDir);
    assert.equal((values as Record<string, unknown>).custom_key, "custom_value");
  });

  it("writes nested key with dot notation", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    setConfigValue(
      "execute.default_model",
      "anthropic/claude-3",
      testDir,
    );
    const { values } = resolveConfig(testDir);
    const v2 = values as Record<string, unknown>;
    assert.equal(
      (v2.execute as Record<string, unknown>).default_model,
      "anthropic/claude-3",
    );
  });

  it("creates nested objects for dot paths", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    setConfigValue("a.b.c", "d", testDir);
    const { values } = resolveConfig(testDir);
    const v3 = values as Record<string, unknown>;
    assert.equal(
      ((v3.a as Record<string, unknown>).b as Record<string, unknown>).c,
      "d",
    );
  });

  it("throws for empty key", () => {
    assert.throws(() => setConfigValue("", "val"), /non-empty/);
  });
});

describe("unsetConfigValue", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("removes key from .forge/config.yaml", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(
      join(forgeDir, "config.yaml"),
      "forge:\n  log_level: debug\n",
      "utf8",
    );
    unsetConfigValue("forge.log_level", testDir);
    const { values } = resolveConfig(testDir);
    const v4 = values as Record<string, unknown>;
    assert.equal(
      (v4.forge as Record<string, unknown>).log_level,
      "info",
    ); // falls back to default
  });

  it("throws when key does not exist in config", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(join(forgeDir, "config.yaml"), "", "utf8");
    assert.throws(
      () => unsetConfigValue("forge.nonexistent", testDir),
      /not found/,
    );
  });

  it("throws when config file does not exist", () => {
    assert.throws(
      () => unsetConfigValue("forge.log_level", testDir),
      /not found/,
    );
  });
});

describe("forge config CLI", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-config-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  function run(args: string[], cwd?: string) {
    const entryPoint = resolve(
      currentDirectory,
      "..",
      "..",
      "dist",
      "src",
      "index.js",
    );
    return spawnSync(
      process.execPath,
      [entryPoint, "config", ...args],
      {
        encoding: "utf8",
        cwd: cwd ?? testDir,
      },
    );
  }

  it("forge config --list lists default values", () => {
    const result = run(["--list"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("forge.version"),
      `stdout: ${result.stdout}`,
    );
  });

  it("forge config (no args) defaults to --list", () => {
    const result = run([]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("forge.version"),
      `stdout: ${result.stdout}`,
    );
  });

  it("forge config --get returns a value", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(
      join(forgeDir, "config.yaml"),
      "forge:\n  log_level: debug\n",
      "utf8",
    );
    const result = run(["--get", "forge.log_level"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes("debug"), `stdout: ${result.stdout}`);
  });

  it("forge config --get unknown key exits 1", () => {
    const result = run(["--get", "forge.nonexistent"]);
    assert.equal(result.status, 1, `expected 1, got ${result.status}`);
  });

  it("forge config --set key=value sets a value", async () => {
    const result = run(["--set", "forge.log_level=warn"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const getResult = run(["--get", "forge.log_level"]);
    assert.ok(
      getResult.stdout.includes("warn"),
      `stdout: ${getResult.stdout}`,
    );
  });

  it("forge config --unset removes a value", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(
      join(forgeDir, "config.yaml"),
      "forge:\n  log_level: debug\n",
      "utf8",
    );
    const result = run(["--unset", "forge.log_level"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const getResult = run(["--get", "forge.log_level"]);
    assert.ok(
      getResult.stdout.includes("info"),
      `stdout after unset: ${getResult.stdout}`,
    );
  });

  it("forge config --unset unknown key exits 1", async () => {
    const forgeDir = join(testDir, ".forge");
    await mkdir(forgeDir, { recursive: true });
    await writeFile(
      join(forgeDir, "config.yaml"),
      "forge:\n  log_level: debug\n",
      "utf8",
    );
    const result = run(["--unset", "nonexistent.key"]);
    assert.equal(result.status, 1, `expected 1, got ${result.status}`);
  });
});
