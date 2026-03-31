import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  status: "ready" | "blocked" | "failed";
  outputRoot: string;
  requestedOutputRoot: string | null;
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  source_verify: {
    artifactPath: string;
  };
  source_plan: {
    artifactPath: string;
  };
};

async function createTempWorkingDirectory(prefix = "forge-split-entrypoint-cwd-"): Promise<string> {
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
  "forge split runs the packaged entrypoint from a non-repo working directory and stays minimal on stdout",
  async () => {
    const repoRoot = await createTempRepo("forge-split-entrypoint-");
    const cwd = await createTempWorkingDirectory();
    const specPath = join(repoRoot, "task.md");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", specPath], cwd);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], cwd);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], cwd);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const result = runForgeSplitBinary(["--repo", repoRoot], cwd);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status:\s+ready/);
      assert.match(result.stdout, /Artifact:/);
      assert.match(result.stdout, /Report:/);
      assertForgeSplitOutputHasNoReportHeadings(result);

      const artifactPath = splitArtifactPath(repoRoot);
      const reportPath = splitReportPath(repoRoot);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<SplitArtifact>(artifactPath);

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.outputRoot, join(repoRoot, ".forge"));
      assert.equal(artifact.requestedOutputRoot, null);
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.equal(artifact.source_verify.artifactPath, join(repoRoot, ".forge", "verify.json"));
      assert.equal(artifact.source_plan.artifactPath, join(repoRoot, ".forge", "plan.json"));
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { recursive: true, force: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
