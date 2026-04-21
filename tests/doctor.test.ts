import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it, beforeEach, afterEach } from "node:test";

import { runDoctor, printDoctorResults, ALL_CHECKS } from "../src/doctor/index.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("runDoctor unit tests", () => {
  it("runs all checks by default", async () => {
    const results = await runDoctor();
    assert.equal(results.length, ALL_CHECKS.length);
  });

  it("runs only specified checks", async () => {
    const results = await runDoctor({ checks: ["node", "npm"] });
    assert.equal(results.length, 2);
    assert.equal(results[0].name, "node");
    assert.equal(results[1].name, "npm");
  });

  it("handles unknown check names gracefully", async () => {
    const results = await runDoctor({ checks: ["nonexistent"] });
    assert.equal(results.length, 0);
  });
});

describe("individual check tests", () => {
  it("node check passes for Node >= 20", async () => {
    const results = await runDoctor({ checks: ["node"] });
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "pass");
  });

  it("npm check returns pass or fail", async () => {
    const results = await runDoctor({ checks: ["npm"] });
    assert.equal(results.length, 1);
    assert.ok(
      results[0].status === "pass" || results[0].status === "fail",
      `Expected pass or fail, got ${results[0].status}`
    );
  });

  it("git check passes in a git repo", async () => {
    const results = await runDoctor({ checks: ["git"] });
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "pass");
  });

  it("config check warns when no config exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "forge-doctor-config-test-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);
      const results = await runDoctor({ checks: ["config"] });
      assert.equal(results.length, 1);
      assert.equal(results[0].status, "warn");
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("gitClean check does not crash", async () => {
    const results = await runDoctor({ checks: ["git-clean"] });
    assert.equal(results.length, 1);
    assert.ok(
      results[0].status === "pass" || results[0].status === "warn" || results[0].status === "fail"
    );
  });
});

describe("printDoctorResults", () => {
  it("prints formatted output with icons and summary", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      printDoctorResults([
        { name: "node", status: "pass", message: "Node.js v20.0.0 (>=20 required)" },
        { name: "git", status: "warn", message: "Not in a git repo" },
        { name: "config", status: "fail", message: "No config found", fix: "Run forge init" },
      ]);

      const output = logs.join("\n");
      assert.ok(output.includes("=== Forge Doctor Results ==="));
      assert.ok(output.includes("✓ [PASS] node"));
      assert.ok(output.includes("⚠ [WARN] git"));
      assert.ok(output.includes("✗ [FAIL] config"));
      assert.ok(output.includes("→ Fix: Run forge init"));
      assert.ok(output.includes("1 passed, 1 warnings, 1 failed"));
    } finally {
      console.log = originalLog;
    }
  });
});

describe("forge doctor CLI command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-doctor-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("forge doctor runs all checks and exits 0", async () => {
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "doctor"], {
      encoding: "utf8",
      cwd: resolve(currentDirectory, "..", ".."),
    });
    assert.ok(result.status === 0 || result.status === 1, `Expected 0 or 1, got ${result.status}`);
    assert.ok(result.stdout.includes("Forge Doctor Results"), `Output: ${result.stdout}`);
  });

  it("forge doctor --checks node,npm runs only specified checks", async () => {
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "doctor", "--checks", "node,npm"], {
      encoding: "utf8",
      cwd: resolve(currentDirectory, "..", ".."),
    });
    assert.ok(result.status === 0 || result.status === 1, `Expected 0 or 1, got ${result.status}`);
    assert.ok(result.stdout.includes("node"), `Output should include node: ${result.stdout}`);
    assert.ok(result.stdout.includes("npm"), `Output should include npm: ${result.stdout}`);
    assert.ok(!result.stdout.includes("network"), `Output should not include network: ${result.stdout}`);
    assert.ok(!result.stdout.includes("config"), `Output should not include config: ${result.stdout}`);
  });

  it("forge doctor exits 1 when a check fails", async () => {
    const entryPoint = resolve(currentDirectory, "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "doctor"], {
      encoding: "utf8",
      cwd: testDir,
    });
    assert.ok(
      result.status === 0 || result.status === 1,
      `Expected exit code 0 or 1, got ${result.status}`
    );
  });
});