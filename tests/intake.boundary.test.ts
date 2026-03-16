import assert from "node:assert/strict";
import { symlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeCli,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  command: string;
  stage: string;
  status: "success" | "warning" | "failed";
  purpose: string;
  outputRoot: string;
  requestedOutputRoot?: string | null;
  writePolicy: {
    mode?: string;
    repoReadOnlyOutsideOutputRoot?: boolean;
  };
  failure?: {
    code?: string;
    message?: string;
  };
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
  "forge intake creates default .forge outputs and records boundary metadata",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(["intake", "--repo", repoRoot], repoRoot);

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.command, "forge intake");
      assert.equal(artifact.stage, "step1");
      assert.equal(artifact.status, "success");
      assert.match(artifact.purpose, /foundation|boundary|intake/i);
      assert.equal(artifact.outputRoot, resolve(repoRoot, ".forge"));
      assert.equal(artifact.writePolicy.repoReadOnlyOutsideOutputRoot, true);
      assert.match(report, /deferred|later step|forge plan|forge verify/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario("forge intake honors a repo-internal custom output root", async () => {
  const repoRoot = await createTempRepo();
  const customOutputDir = ".forge-custom";

  try {
    const result = await runForgeCli(
      ["intake", "--repo", repoRoot, "--output-dir", customOutputDir],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const customArtifactPath = join(repoRoot, customOutputDir, "intake.json");
    const customReportPath = join(repoRoot, customOutputDir, "reports", "intake-report.md");

    assert.equal(await fileExists(customArtifactPath), true);
    assert.equal(await fileExists(customReportPath), true);
    assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), false);

    const artifact = await readJsonFile<IntakeArtifact>(customArtifactPath);

    assert.equal(artifact.status, "success");
    assert.equal(artifact.outputRoot, resolve(repoRoot, customOutputDir));
    assert.ok(
      artifact.requestedOutputRoot === customOutputDir ||
        artifact.requestedOutputRoot === resolve(repoRoot, customOutputDir),
      `unexpected requestedOutputRoot: ${artifact.requestedOutputRoot ?? "null"}`,
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario(
  "forge intake rejects a relative output root that escapes the repo and falls back to .forge",
  async () => {
    const repoRoot = await createTempRepo();
    const escapedOutputDir = ["..", "outside-root"].join(sep);
    const escapedArtifactPath = resolve(repoRoot, escapedOutputDir, "intake.json");

    try {
      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--output-dir", escapedOutputDir],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "escaped path should fail");

      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const fallbackReportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      assert.equal(await fileExists(fallbackArtifactPath), true);
      assert.equal(await fileExists(fallbackReportPath), true);
      assert.equal(await fileExists(escapedArtifactPath), false);

      const artifact = await readJsonFile<IntakeArtifact>(fallbackArtifactPath);

      assert.equal(artifact.status, "failed");
      assert.match(artifact.failure?.message ?? result.stderr, /outside|escape|repo/i);
      assert.equal(artifact.outputRoot, resolve(repoRoot, ".forge"));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake rejects an absolute output root outside the repo boundary",
  async () => {
    const repoRoot = await createTempRepo();
    const externalRoot = await createTempRepo("forge-external-");

    try {
      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--output-dir", externalRoot],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "external output root should fail");

      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const externalArtifactPath = join(externalRoot, "intake.json");

      assert.equal(await fileExists(fallbackArtifactPath), true);
      assert.equal(await fileExists(externalArtifactPath), false);

      const artifact = await readJsonFile<IntakeArtifact>(fallbackArtifactPath);

      assert.equal(artifact.status, "failed");
      assert.match(artifact.failure?.message ?? result.stderr, /outside|escape|repo/i);
    } finally {
      await disposeTempRepo(repoRoot);
      await disposeTempRepo(externalRoot);
    }
  },
);

await runScenario(
  "forge intake rejects a repo-local symlinked output root that resolves outside the repo",
  async () => {
    const repoRoot = await createTempRepo();
    const externalRoot = await createTempRepo("forge-external-");
    const symlinkName = ".forge-link";
    const symlinkPath = join(repoRoot, symlinkName);

    try {
      await symlink(externalRoot, symlinkPath, "junction");

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--output-dir", symlinkName],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "symlinked output root should fail");

      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const externalArtifactPath = join(externalRoot, "intake.json");

      assert.equal(await fileExists(fallbackArtifactPath), true);
      assert.equal(await fileExists(externalArtifactPath), false);

      const artifact = await readJsonFile<IntakeArtifact>(fallbackArtifactPath);

      assert.equal(artifact.status, "failed");
      assert.match(artifact.failure?.message ?? result.stderr, /outside|repo|symlink/i);
      assert.equal(artifact.outputRoot, resolve(repoRoot, ".forge"));
    } finally {
      await disposeTempRepo(repoRoot);
      await disposeTempRepo(externalRoot);
    }
  },
);

await runScenario(
  "forge intake persists a failed artifact and report when the requested output root cannot be written",
  async () => {
    const repoRoot = await createTempRepo();
    const blockedOutputPath = join(repoRoot, "blocked-output");

    try {
      await writeFile(blockedOutputPath, "not a directory", "utf8");

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--output-dir", "blocked-output"],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "blocked output root should fail");

      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const fallbackReportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      assert.equal(await fileExists(fallbackArtifactPath), true);
      assert.equal(await fileExists(fallbackReportPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(fallbackArtifactPath);
      const report = await readTextFile(fallbackReportPath);

      assert.equal(artifact.status, "failed");
      assert.match(artifact.failure?.message ?? result.stderr, /write|directory|output/i);
      assert.match(report, /failed|error/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
