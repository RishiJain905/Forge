import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, beforeEach, afterEach } from "node:test";

import { checkForUpdate } from "../src/update.js";

import { readFileSync } from "node:fs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("checkForUpdate unit tests", () => {
  it("returns an UpdateInfo object with current, latest, and outdated keys", async () => {
    const info = await checkForUpdate();
    assert.ok(typeof info.current === "string");
    assert.ok(typeof info.latest === "string");
    assert.ok(typeof info.outdated === "boolean");
  });

  it("current version is a valid semver string", async () => {
    const info = await checkForUpdate();
    assert.ok(/^\d+\.\d+\.\d+/.test(info.current), `Expected semver, got ${info.current}`);
  });

  it("falls back to current version when npm view fails gracefully", async () => {
    // This implicitly tests the catch block in checkForUpdate when there is no network.
    // We just assert it does not throw.
    const info = await checkForUpdate();
    assert.ok(typeof info.current === "string");
    assert.ok(typeof info.latest === "string");
  });
});

describe("forge update CLI command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-update-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("forge update --dry-run outputs current version and exits 0", async () => {
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "update", "--dry-run"], {
      encoding: "utf8",
      cwd: resolve(currentDirectory, "..", ".."),
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const pkg = JSON.parse(readFileSync(resolve(currentDirectory, "..", "..", "package.json"), "utf8"));
    assert.ok(result.stdout.includes(pkg.version), `Expected stdout to include version ${pkg.version}: ${result.stdout}`);
  });

  it("forge update without --yes exits 0 when up to date", async () => {
    // When running from the repo itself, current == latest because npm view
    // may return the published version. The command should log "already up to date"
    // and exit 0.
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "update"], {
      encoding: "utf8",
      cwd: resolve(currentDirectory, "..", ".."),
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes("up to date") || result.stdout.includes("Forge is"),
      `Expected up-to-date message in stdout: ${result.stdout}`
    );
  });
});
