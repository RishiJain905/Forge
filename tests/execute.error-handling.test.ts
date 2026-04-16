import assert from "node:assert/strict";
import { describe, it } from "node:test";
import os from "node:os";
import path from "node:path";
import fsSync from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mkdtempSync = fsSync.mkdtempSync;
const rmSync = fsSync.rmSync;
const fs = fsSync.promises;
const systemTmpdir = os.tmpdir();

// Helper: create a temp dir with a minimal split.json
function makeTmpWithSplit(workstreams: Array<{
  id: string;
  title: string;
  mergeOrderRequirements?: string[];
}>): string {
  const dir = mkdtempSync(path.join(systemTmpdir, "forge-exec-"));
  const forgeDir = path.join(dir, ".forge");
  fsSync.mkdirSync(forgeDir, { recursive: true });

  const splitArtifact = {
    schemaVersion: "1.0.0",
    command: "forge split",
    stage: "step4",
    status: "ready",
    purpose: "test",
    repoRoot: dir,
    requestedOutputRoot: null,
    outputRoot: forgeDir,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: forgeDir,
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: {
      artifactPath: null,
      reportPath: null,
      debugArtifactPath: "",
      debugWorkstreamsPath: "",
      debugMergeOrderPath: "",
    },
    summary: {
      totalWorkstreams: workstreams.length,
      safeParallelGroups: 1,
      sequentialGroups: 0,
      mergeOrderGroups: workstreams.some(
        (w) => (w.mergeOrderRequirements?.length ?? 0) > 0,
      )
        ? 1
        : 0,
    },
    workstreams: workstreams.map((ws) => ({
      id: ws.id,
      title: ws.title,
      description: `Workstream ${ws.id}`,
      category: "safe_parallel",
      sourcePlanItemIds: [],
      sourceVerificationCaseIds: [],
      sourceFindingIds: [],
      likelyAffectedPaths: [],
      streamDependencies: [],
      mergeOrderRequirements: ws.mergeOrderRequirements ?? [],
      constraints: [],
      blockedReason: null,
    })),
  };

  fsSync.writeFileSync(
    path.join(forgeDir, "split.json"),
    JSON.stringify(splitArtifact, null, 2),
  );
  return dir;
}

// Helper: run forge execute and capture exit code + stderr + stdout
function runForgeExecute(
  dir: string,
  input = "exit\n",
): { exitCode: number; stderr: string; stdout: string } {
  // Use absolute path to the CLI from the worktree (tests are run from worktree root)
  const worktreeRoot = path.resolve(__dirname, "..");
  const cliPath = path.join(worktreeRoot, "dist", "src", "index.js");
  try {
    const out = execSync(`node ${cliPath} execute`, {
      cwd: dir,
      input,
      timeout: 5000,
      encoding: "utf8",
    });
    return { exitCode: 0, stderr: "", stdout: out as string };
  } catch (err: unknown) {
    const execErr = err as {
      status?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: execErr.status ?? 1,
      stderr: execErr.stderr ?? "",
      stdout: execErr.stdout ?? "",
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Missing split.json
// ──────────────────────────────────────────────────────────────────────────────

describe("Missing split.json", () => {
  it("exits with code 1 when split.json does not exist", () => {
    const dir = mkdtempSync(path.join(systemTmpdir, "forge-exec-missing-"));
    try {
      const result = runForgeExecute(dir);
      assert.strictEqual(
        result.exitCode,
        1,
        `Expected exit code 1, got ${result.exitCode}`,
      );
      assert.ok(
        result.stderr.includes("split.json") ||
          result.stderr.includes("not found"),
        `Expected error about split.json. Got: ${result.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Corrupt split.json
// ──────────────────────────────────────────────────────────────────────────────

describe("Corrupt split.json", () => {
  it("exits with code 1 when split.json is invalid JSON", () => {
    const dir = mkdtempSync(path.join(systemTmpdir, "forge-exec-corrupt-"));
    try {
      const forgeDir = path.join(dir, ".forge");
      fsSync.mkdirSync(forgeDir, { recursive: true });
      fsSync.writeFileSync(
        path.join(forgeDir, "split.json"),
        "{ this is not json }",
      );

      const result = runForgeExecute(dir);
      assert.strictEqual(
        result.exitCode,
        1,
        `Expected exit code 1, got ${result.exitCode}`,
      );
      assert.ok(
        result.stderr.includes("invalid") ||
          result.stderr.includes("Unexpected") ||
          result.stderr.includes("JSON"),
        `Expected error about invalid JSON. Got: ${result.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Write failures — make output dir read-only
// ──────────────────────────────────────────────────────────────────────────────

describe("Write failures", () => {
  it("exits with code 1 when execute.json cannot be written", () => {
    const workstreams = [{ id: "ws-1", title: "Test WS" }];
    const dir = makeTmpWithSplit(workstreams);
    try {
      const forgeDir = path.join(dir, ".forge");
      // Make .forge dir read-only so writeExecuteArtifact fails
      fsSync.chmodSync(forgeDir, 0o555);

      const result = runForgeExecute(dir);
      assert.strictEqual(
        result.exitCode,
        1,
        `Expected exit code 1, got ${result.exitCode}`,
      );
      assert.ok(
        result.stderr.includes("Error") ||
          result.stderr.includes("permission") ||
          result.stderr.includes("write") ||
          result.stderr.includes("EACCES"),
        `Expected error about write failure. Got: ${result.stderr}`,
      );
    } finally {
      try {
        fsSync.chmodSync(path.join(dir, ".forge"), 0o755);
      } catch {
        // ignore
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Exit code semantics — all completed
// ──────────────────────────────────────────────────────────────────────────────

describe("Exit code semantics — all completed", () => {
  it("exits with code 0 when all workstreams are completed", () => {
    const workstreams = [
      { id: "ws-1", title: "WS1" },
      { id: "ws-2", title: "WS2" },
    ];
    const dir = makeTmpWithSplit(workstreams);
    try {
      const result = runForgeExecute(
        dir,
        "run 1\ndone 1\nrun 2\ndone 2\nexit\n",
      );
      assert.strictEqual(
        result.exitCode,
        0,
        `Expected exit code 0, got ${result.exitCode}. stderr: ${result.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Exit code semantics — some failed
// ──────────────────────────────────────────────────────────────────────────────

describe("Exit code semantics — some failed", () => {
  it("exits with code 1 when any workstream failed", () => {
    const workstreams = [
      { id: "ws-1", title: "WS1" },
      { id: "ws-2", title: "WS2" },
    ];
    const dir = makeTmpWithSplit(workstreams);
    try {
      const result = runForgeExecute(
        dir,
        "run 1\nfail 1\nrun 2\ndone 2\nexit\n",
      );
      assert.strictEqual(
        result.exitCode,
        1,
        `Expected exit code 1, got ${result.exitCode}. stderr: ${result.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Exit code semantics — blocked workstreams
// ──────────────────────────────────────────────────────────────────────────────

describe("Exit code semantics — blocked workstreams", () => {
  it("exits with code 2 when workstreams remain queued on exit", () => {
    const workstreams = [
      { id: "ws-1", title: "WS1" },
      { id: "ws-2", title: "WS2", mergeOrderRequirements: ["ws-1"] },
    ];
    const dir = makeTmpWithSplit(workstreams);
    try {
      // ws-1 never completes; ws-2 is blocked by merge order — exit while ws-2 is queued
      const result = runForgeExecute(dir, "run 1\nexit\n");
      assert.strictEqual(
        result.exitCode,
        2,
        `Expected exit code 2, got ${result.exitCode}. stderr: ${result.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Invalid state transitions
// ──────────────────────────────────────────────────────────────────────────────

describe("Invalid state transitions", () => {
  it("'done' on queued workstream shows error but does not crash", () => {
    const workstreams = [{ id: "ws-1", title: "WS1" }];
    const dir = makeTmpWithSplit(workstreams);
    try {
      const result = runForgeExecute(dir, "done 1\nexit\n");
      // Should not crash — stdout should mention invalid transition
      assert.ok(
        result.exitCode === 0 ||
          result.exitCode === 1 ||
          result.exitCode === 2,
        `Process should exit cleanly, got ${result.exitCode}`,
      );
      assert.ok(
        (result.stdout ?? "").includes("Invalid transition") ||
          (result.stdout ?? "").includes("cannot complete") ||
          (result.stdout ?? "").includes("queued"),
        `Expected error about invalid transition. Got: ${result.stdout}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
