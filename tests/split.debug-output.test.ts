import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitBlockedItemsPath,
  splitDebugArtifactPath,
  splitMergeOrderPath,
  splitReportPath,
  splitStreamConstraintsPath,
  splitWorkstreamsPath,
  writeRepoFile,
} from "./support/forge-cli.js";

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

async function seedSpecRepo(repoRoot: string): Promise<void> {
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
}

async function removeUpstreamInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

await runScenario(
  "forge split does not write split debug artifacts when FORGE_SPLIT_DEBUG is unset",
  async () => {
    const repoRoot = await createTempRepo("forge-split-debug-disabled-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const result = runForgeSplitBinary(
        ["--repo", repoRoot],
        repoRoot,
        { FORGE_SPLIT_DEBUG: null },
      );

      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), false);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), false);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), false);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split writes split debug artifacts when FORGE_SPLIT_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo("forge-split-debug-enabled-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const result = runForgeSplitBinary(
        ["--repo", repoRoot],
        repoRoot,
        { FORGE_SPLIT_DEBUG: "1" },
      );

      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), true);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), true);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), true);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
