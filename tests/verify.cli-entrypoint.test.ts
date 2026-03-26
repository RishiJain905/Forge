import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  runForgeBinary,
  writeRepoFile,
} from "./support/forge-cli.js";

async function createTempWorkingDirectory(prefix = "forge-verify-entrypoint-cwd-"): Promise<string> {
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
  "forge verify runs from a non-repo working directory and stays minimal on stdout",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-entrypoint-");
    const cwd = await createTempWorkingDirectory();

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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        cwd,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], cwd);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], cwd);

      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assert.match(verifyResult.stdout, /Status:\s+ready/);
      assert.match(verifyResult.stdout, /Artifact:/);
      assert.match(verifyResult.stdout, /Report:/);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { recursive: true, force: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
