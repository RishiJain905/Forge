import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  writeRepoFile,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  status: "success" | "warning" | "failed";
  input_mode?: "spec" | "prompt";
  next_step_readiness?: {
    blocking_issues?: Array<{
      code?: string;
    }>;
  };
}

async function createTempWorkingDirectory(prefix = "forge-entrypoint-cwd-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
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
  "forge intake runs the packaged entrypoint from a non-repo working directory in spec mode",
  async () => {
    const repoRoot = await createTempRepo();
    const cwd = await createTempWorkingDirectory();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update app behavior",
          "",
          "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/app.ts` is updated",
          "- `tests/app.test.ts` stays aligned",
        ].join("\n"),
      );

      const result = await runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        cwd,
      );

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status: success/);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "spec");
      assert.match(report, /Forge Intake Report/);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

await runScenario(
  "forge intake returns a warning for a weak spec while still persisting outputs",
  async () => {
    const repoRoot = await createTempRepo();
    const cwd = await createTempWorkingDirectory();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update app behavior",
          "",
          "Revise `src/app.ts`.",
        ].join("\n"),
      );

      const result = await runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        cwd,
      );

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status: warning/);
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(artifact.status, "warning");
      assert.equal(artifact.input_mode, "spec");
      assert.match(report, /Forge Intake Report/);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

await runScenario(
  "forge intake reports a missing spec path as a failed run and persists the failed artifact",
  async () => {
    const repoRoot = await createTempRepo();
    const cwd = await createTempWorkingDirectory();
    const specPath = join(repoRoot, "missing-task.md");

    try {
      const result = await runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        cwd,
      );

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Status: failed/);
      assert.match(result.stderr, /INPUT_VALIDATION_FAILED/);
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(artifact.status, "failed");
      assert.equal(artifact.input_mode ?? null, null);
      assert.ok(
        artifact.next_step_readiness?.blocking_issues?.some((issue) => issue.code === "SPEC_READ_FAILED"),
      );
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
