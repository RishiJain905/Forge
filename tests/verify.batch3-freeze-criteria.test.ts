import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import type { VerifyArtifact } from "../src/verify/types.js";
import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
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

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function normalizeVerifyArtifact(artifact: VerifyArtifact): Omit<VerifyArtifact, "startedAt" | "finishedAt"> {
  const {
    startedAt,
    finishedAt,
    ...stableArtifact
  } = artifact;

  void startedAt;
  void finishedAt;

  return stableArtifact;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function assertNoStep3Markers(): Promise<void> {
  const repoRoot = process.cwd();
  const runtimeFiles = await collectFiles(join(repoRoot, "src", "verify"));
  const testFiles = await collectFiles(join(repoRoot, "tests"));
  const scannedFiles = [
    ...runtimeFiles,
    ...testFiles.filter((filePath) => /verify\./i.test(filePath)),
    join(repoRoot, "README.md"),
    join(repoRoot, "scripts", "smoke.mjs"),
  ];
  const offenders: string[] = [];
  const freezeMarkerPattern = new RegExp(["TO" + "DO", "FIX" + "ME", "XX" + "X"].join("|"));

  for (const filePath of scannedFiles) {
    const contents = await readTextFile(filePath);

    if (freezeMarkerPattern.test(contents)) {
      offenders.push(filePath);
    }
  }

  assert.deepEqual(offenders, [], `unexpected freeze markers found in Step 3 surface: ${offenders.join(", ")}`);
}

function verifyDebugPath(repoRoot: string, fileName: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "debug", fileName);
}

await runScenario(
  "forge verify satisfies the Batch 3 Part 1 finish line for a grounded spec run",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-freeze-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.verification_readiness.ready, true);
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
      assert.match(report, /Verification Readiness Status:\s+ready/i);
      assert.match(report, /Structural Verification Status:\s+passed/i);
      assert.match(report, /verify\.json and verify-report\.md remain the durable Step 3 outputs/i);
      assert.doesNotMatch(report, /Batch 2/i);
      assert.doesNotMatch(report, /later Step 3/i);

      const readme = await readTextFile(join(process.cwd(), "README.md"));
      const progress = await readTextFile(join(process.cwd(), "progress.md"));
      assert.match(readme, /Batch 3 Part 4/i);
      assert.match(readme, /frozen for V1 except for future bug fixes/i);
      assert.match(progress, /Batch 3\.04: `part-4-step3-polish-test-hardening-and-freeze-criteria\.md`/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps warning-heavy but usable handoffs coherent under the Batch 3 Part 1 finish line",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-freeze-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.verification_readiness.status, "ready_with_warnings");
      assert.ok(artifact.verification_readiness.warning_items.length > 0);
      assert.ok(artifact.verification_diagnostics.warning_items.length > 0);
      assert.match(report, /Verification Readiness Status:\s+ready_with_warnings/i);
      assert.match(report, /Verification Warning Items:\s+\d+/i);
      assert.match(report, /## Carry-Forward Context/);
      assert.match(report, /## Verification Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify stays deterministic across repeated warning-heavy runs and keeps freeze markers out of the Step 3 surface",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-freeze-repeat-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const firstRun = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(firstRun.code, 0, firstRun.stderr);
      const firstArtifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const firstReport = await readTextFile(verifyReportPath(repoRoot));

      const secondRun = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(secondRun.code, 0, secondRun.stderr);
      const secondArtifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const secondReport = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(firstArtifact.verification_readiness.status, "ready_with_warnings");
      assert.deepEqual(normalizeVerifyArtifact(firstArtifact), normalizeVerifyArtifact(secondArtifact));
      assert.equal(firstReport, secondReport);
      await assertNoStep3Markers();

      const readme = await readTextFile(join(process.cwd(), "README.md"));
      const progress = await readTextFile(join(process.cwd(), "progress.md"));
      assert.match(readme, /frozen for V1 except for future bug fixes/i);
      assert.match(progress, /Step 3 Batch 3 Part 4 is complete/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps debug artifacts usable under the Batch 3 Part 1 finish line",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-freeze-debug-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(await fileExists(verifyDebugPath(repoRoot, "verify-debug.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "verification-cases.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "structural-findings.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "state-models.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "tla-specs.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "tlc-results.json")), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "verification-readiness.json")), true);
      assert.match(report, /Debug files are optional internal mirrors and are only written when FORGE_VERIFY_DEBUG=1/i);
      assert.match(report, new RegExp(artifact.files.debugArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(report, /verify-debug\.json/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
