import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
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

function extractLevelTwoHeadings(report: string): string[] {
  return report
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("## "));
}

const REQUIRED_HEADINGS = [
  "## Overview",
  "## Purpose",
  "## Source Plan",
  "## Verification Target Contract",
  "## Formal Lane Contract",
  "## Verification Targets",
  "## Verification Cases",
  "## Structural Verification",
  "## Formal Verification",
  "## Findings",
  "## Constraints",
  "## Carry-Forward Context",
  "## Verification Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Failure",
  "## Summary",
] as const;

await runScenario(
  "forge verify report stays aligned with the artifact and renders the frozen heading order",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-report-");

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

      const artifactPath = verifyArtifactPath(repoRoot);
      const reportPath = verifyReportPath(repoRoot);
      const artifact = await readJsonFile<Record<string, any>>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(extractLevelTwoHeadings(report).join("|"), [...REQUIRED_HEADINGS].join("|"));
      assert.equal(report.includes("# Forge Verify Report"), true);
      assert.equal(report.includes(artifactPath), true);
      assert.equal(report.includes(reportPath), true);
      assert.equal(report.includes(String(artifact.command)), true);
      assert.equal(report.includes(String(artifact.status)), true);
      assert.equal(report.includes(String(artifact.summary)), true);
      assert.equal(report.includes(String(artifact.source_plan.command)), true);
      assert.equal(report.includes(String(artifact.verification_readiness.status)), true);
      assert.equal(report.includes("Verification Readiness"), true);
      assert.equal(report.includes("Verification Cases"), true);
      assert.ok(Array.isArray(artifact.verification_targets));
      assert.ok(Array.isArray(artifact.verification_cases));
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
      assert.match(report, /Risk Sources:/);
      assert.match(report, /Target ID:/);
      assert.match(report, /Lanes:\s+structural|Lanes:\s+formal/i);
      assert.doesNotMatch(report, /deferred in Part 2/i);
      assert.doesNotMatch(report, /in Part 2/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify report keeps blocked fallback output coherent across overview, readiness, failure, and summary",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-report-blocked-");
    const blockedOutputDir = join("..", "forge-verify-report-fallback");

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

      const verifyResult = runForgeVerifyBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );

      assert.notEqual(verifyResult.code, 0);
      assert.match(verifyResult.stderr, /OUTPUT_ROOT_FALLBACK/);

      const artifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        summary: string;
        failure: { code: string; message: string; fallbackReason?: string } | null;
        verification_readiness: {
          ready: boolean;
          status: "ready" | "ready_with_warnings" | "blocked";
          summary: string;
          warning_items: Array<{ code: string; message: string }>;
          blocking_issues: Array<{ code: string; message: string }>;
          partial_output: { code: string; message: string; fallbackReason?: string } | null;
          constraining_concern_ids: string[];
          recommended_user_actions: string[];
        };
      }>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.match(report, /Verification Readiness/);
      assert.match(report, /Failure/);
      assert.match(report, /Summary/);
      assert.match(report, /OUTPUT_ROOT_FALLBACK/);
      assert.match(report, /default \.forge output root|unsafe/i);
      assert.match(report, new RegExp(artifact.verification_readiness.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
