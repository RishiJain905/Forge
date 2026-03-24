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

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "src", "helper.ts"), { force: true });
  await rm(join(repoRoot, "tests", "helper.test.ts"), { force: true });
}

function assertMinimalPlanOutput(output: string): void {
  assert.equal(output.includes("# Forge Plan Report"), false);
  assert.equal(output.includes("## Plan Items"), false);
  assert.equal(output.includes("## Source Intake"), false);
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
      await removePlanningInputs(repoRoot);

      const planResult = await runForgeBinary(["plan", "--repo", repoRoot], cwd);
      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);
      assert.match(planResult.stdout, /Summary:/);
      assert.match(planResult.stdout, /Output root:/);
      assert.match(planResult.stdout, /Artifact:/);
      assert.match(planResult.stdout, /Report:/);
      assertMinimalPlanOutput(planResult.stdout);

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
      assert.match(report, /## Plan Items/);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

await runScenario(
  "forge plan preserves warning-heavy but usable intake handoffs in the packaged CLI path",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-entrypoint-warning-");
    const cwd = await createTempWorkingDirectory();

    try {
      const intakeResult = await runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix"],
        cwd,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      const planResult = await runForgeBinary(["plan", "--repo", repoRoot], cwd);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);
      assertMinimalPlanOutput(planResult.stdout);

      const artifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        source_intake: { status: string; readyForPlanning: boolean };
        carry_forward: { warnings: unknown[]; ambiguities: unknown[]; confidence: { level: string } };
      }>(join(repoRoot, ".forge", "plan.json"));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_intake.status, "warning");
      assert.equal(artifact.source_intake.readyForPlanning, true);
      assert.equal(artifact.carry_forward.confidence.level, "low");
      assert.ok(artifact.carry_forward.warnings.length > 0);
      assert.ok(artifact.carry_forward.ambiguities.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

await runScenario(
  "forge plan writes blocked outputs for a failed-but-persisted intake handoff in the packaged CLI path",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-entrypoint-blocked-");
    const cwd = await createTempWorkingDirectory();

    try {
      const intakeResult = await runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        cwd,
      );

      assert.equal(intakeResult.code, 1);
      await removePlanningInputs(repoRoot);

      const planResult = await runForgeBinary(["plan", "--repo", repoRoot], cwd);

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /Status:\s+blocked/);
      assertMinimalPlanOutput(planResult.stderr);

      const artifactPath = join(repoRoot, ".forge", "plan.json");
      const reportPath = join(repoRoot, ".forge", "reports", "plan-report.md");
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        planning_readiness: { ready: boolean; blocking_issues: Array<{ code: string; message: string }> };
        failure: null;
      }>(artifactPath);

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.ok(
        artifact.planning_readiness.blocking_issues.some((issue) => issue.code === "LOW_CONFIDENCE_ESCALATED"),
      );
      assert.equal(artifact.failure, null);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

await runScenario(
  "forge plan fails without durable outputs when the packaged CLI cannot find intake.json",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-entrypoint-missing-");
    const cwd = await createTempWorkingDirectory();

    try {
      await removePlanningInputs(repoRoot);

      const planResult = await runForgeBinary(["plan", "--repo", repoRoot], cwd);

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /PLAN_INPUT_MISSING|intake\.json/i);
      assert.equal(await fileExists(join(repoRoot, ".forge", "plan.json")), false);
      assert.equal(await fileExists(join(repoRoot, ".forge", "reports", "plan-report.md")), false);
      assert.equal(planResult.stderr.includes("# Forge Plan Report"), false);
      assert.equal(planResult.stderr.includes("## Plan Items"), false);
    } finally {
      await disposeTempRepo(repoRoot);
      await rm(cwd, { force: true, recursive: true });
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
