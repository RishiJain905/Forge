import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { persistIntakeOutputs } from "../src/intake/persistence.js";

async function createTempRoot(prefix = "forge-persistence-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runScenario(name: string, scenario: () => Promise<void>): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await runScenario(
  "persistIntakeOutputs bootstraps nested directories and writes critical files",
  async () => {
    const root = await createTempRoot();
    const artifactPath = join(root, ".forge", "intake.json");
    const reportPath = join(root, ".forge", "reports", "intake-report.md");

    try {
      await persistIntakeOutputs({
        criticalWrites: [
          {
            filePath: artifactPath,
            contents: '{"ok":true}\n',
          },
          {
            filePath: reportPath,
            contents: "# report\n",
          },
        ],
        debugWrites: null,
      });

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(await readFile(artifactPath, "utf8"), '{"ok":true}\n');
      assert.equal(await readFile(reportPath, "utf8"), "# report\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

await runScenario(
  "persistIntakeOutputs removes partial critical writes when a later critical write fails",
  async () => {
    const root = await createTempRoot();
    const artifactPath = join(root, ".forge", "intake.json");
    const failingPath = join(root, ".forge", "reports");

    try {
      await mkdir(failingPath, { recursive: true });

      await assert.rejects(
        persistIntakeOutputs({
          criticalWrites: [
            {
              filePath: artifactPath,
              contents: '{"status":"ok"}\n',
            },
            {
              filePath: failingPath,
              contents: "# this write should fail\n",
            },
          ],
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          String((error as { code: unknown }).code) === "PERSISTENCE_FAILED",
      );

      assert.equal(await fileExists(artifactPath), false);
      assert.equal(await fileExists(failingPath), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

await runScenario(
  "persistIntakeOutputs swallows debug-write failures after successful critical writes",
  async () => {
    const root = await createTempRoot();
    const artifactPath = join(root, ".forge", "intake.json");
    const reportPath = join(root, ".forge", "reports", "intake-report.md");
    const debugParentPath = join(root, ".forge", "debug");
    const debugPath = join(debugParentPath, "intake-debug.json");

    try {
      await mkdir(join(root, ".forge"), { recursive: true });
      await writeFile(debugParentPath, "not-a-directory\n", "utf8");

      await persistIntakeOutputs({
        criticalWrites: [
          {
            filePath: artifactPath,
            contents: '{"ok":true}\n',
          },
          {
            filePath: reportPath,
            contents: "# report\n",
          },
        ],
        debugWrites: [{
          filePath: debugPath,
          contents: '{"debug":true}\n',
        }],
      });

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(await fileExists(debugPath), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
