import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, beforeEach, afterEach } from "node:test";

import { initForge } from "../src/init.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("forge init", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-init-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("creates .forge/ directory structure with config.yaml and .forgeignore", async () => {
    await initForge({ dir: testDir });

    assert.equal(existsSync(join(testDir, ".forge")), true);
    assert.equal(existsSync(join(testDir, ".forge", "config.yaml")), true);
    assert.equal(existsSync(join(testDir, ".forge", ".forgeignore")), true);
    assert.equal(existsSync(join(testDir, ".forge", "reports")), true);
    assert.equal(existsSync(join(testDir, ".forge", "debug")), true);
  });

  it("creates config.yaml with valid content", async () => {
    await initForge({ dir: testDir });

    const config = await readFile(join(testDir, ".forge", "config.yaml"), "utf8");
    assert.ok(config.includes("forge:"));
    assert.ok(config.includes("version:"));
    assert.ok(config.includes("intake:"));
    assert.ok(config.includes("execute:"));
    assert.ok(config.includes("integrate:"));
  });

  it("creates .forgeignore with standard patterns", async () => {
    await initForge({ dir: testDir });

    const ignore = await readFile(join(testDir, ".forge", ".forgeignore"), "utf8");
    assert.ok(ignore.includes("node_modules/"));
    assert.ok(ignore.includes("dist/"));
  });

  it("throws when .forge/ already exists without --force", async () => {
    await initForge({ dir: testDir });

    await assert.rejects(
      () => initForge({ dir: testDir }),
      { message: /already exists/ },
    );
  });

  it("overwrites existing .forge/ with --force", async () => {
    await initForge({ dir: testDir });

    // Should not throw
    await initForge({ dir: testDir, force: true });

    // Verify it still has valid content after overwrite
    const config = await readFile(join(testDir, ".forge", "config.yaml"), "utf8");
    assert.ok(config.includes("forge:"));
  });

  it("creates forge.config.ts with --yes", async () => {
    await initForge({ dir: testDir, yes: true });

    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), true);
    const configTs = await readFile(join(testDir, ".forge", "forge.config.ts"), "utf8");
    // Should NOT import defineConfig (doesn't exist yet in the library)
    assert.equal(configTs.includes("defineConfig"), false);
    // Should have a default export
    assert.ok(configTs.includes("export default"));
  });

  it("does not create forge.config.ts without --yes", async () => {
    await initForge({ dir: testDir });

    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), false);
  });

  it("uses current working directory when dir is not specified", async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      await initForge({});
      assert.equal(existsSync(join(testDir, ".forge")), true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("forge init CLI command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-init-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("forge init --dir <path> creates .forge/ via CLI", async () => {
    const result = spawnSync(process.execPath, [
      resolve(currentDirectory, "..", "..", "dist", "src", "index.js"),
      "init", "--dir", testDir,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(testDir, ".forge", "config.yaml")), true);
  });

  it("forge init exits 1 when .forge/ exists without --force", async () => {
    await initForge({ dir: testDir });
    const result = spawnSync(process.execPath, [
      resolve(currentDirectory, "..", "..", "dist", "src", "index.js"),
      "init", "--dir", testDir,
    ], { encoding: "utf8" });
    assert.equal(result.status, 1);
  });

  it("forge init --force succeeds when .forge/ exists", async () => {
    await initForge({ dir: testDir });
    const result = spawnSync(process.execPath, [
      resolve(currentDirectory, "..", "..", "dist", "src", "index.js"),
      "init", "--dir", testDir, "--force",
    ], { encoding: "utf8" });
    assert.equal(result.status, 0);
  });

  it("forge init --yes creates forge.config.ts", async () => {
    const result = spawnSync(process.execPath, [
      resolve(currentDirectory, "..", "..", "dist", "src", "index.js"),
      "init", "--dir", testDir, "--yes",
    ], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), true);
  });
});

describe("forge --version", () => {
  it("forge --version prints the package version", async () => {
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "--version"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    const pkg = JSON.parse(readFileSync(resolve(currentDirectory, "..", "..", "package.json"), "utf8"));
    assert.equal(result.stdout.trim(), pkg.version);
  });
});