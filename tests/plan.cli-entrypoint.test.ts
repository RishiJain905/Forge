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

async function createTempWorkingDirectory(prefix = "forge-plan-entrypoint-cwd-"): Promise<string> {
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
  "forge plan runs the packaged entrypoint from a non-repo working directory",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-entrypoint-");
    const cwd = await createTempWorkingDirectory();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update app and helper behavior",
          "",
          "Revise `src/app.ts` and `src/helper.ts`, and keep `tests/app.test.ts` and `tests/helper.test.ts` aligned.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/app.ts` is updated",
          "- `src/helper.ts` is updated",
          "- `tests/app.test.ts` stays aligned",
          "- `tests/helper.test.ts` stays aligned",
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "src/helper.ts", "export const helper = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/helper.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );

      const intakeResult = await runForgeBinary(["intake", "--repo", repoRoot, "--spec", specPath], cwd);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = await runForgeBinary(["plan", "--repo", repoRoot], cwd);
      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);

      const artifactPath = join(repoRoot, ".forge", "plan.json");
      const reportPath = join(repoRoot, ".forge", "reports", "plan-report.md");
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        plan_items: Array<{ category: string; likelyAffectedPaths: string[] }>;
      }>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.status, "ready");
      assert.ok(
        artifact.plan_items.filter((item) => item.category === "implementation").length >= 2,
        "expected multiple implementation plan items from the packaged entrypoint path",
      );
      assert.match(report, /Forge Plan Report/);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
