import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { STEP2_ALLOWED_SIDE_EFFECTS } from "../src/plan/constants.js";
import { runPlanCommand } from "../src/plan/runner.js";
import type { PlanArtifact } from "../src/plan/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgeCli,
  runForgePlanBinary,
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
  await writeRepoFile(repoRoot, "src/app.ts", "export const app = true;\n");
  await writeRepoFile(
    repoRoot,
    "tests/app.test.ts",
    "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
  );
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

await runScenario(
  "forge plan satisfies the Batch 3 Part 1 finish line for a grounded spec run",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-b3-freeze-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = await runForgeCli(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const report = await readTextFile(join(repoRoot, ".forge", "reports", "plan-report.md"));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.ok(artifact.plan_items.length > 0);
      assert.ok(artifact.dependency_graph.length > 0);
      assert.ok(artifact.conflict_zones.length > 0);
      assert.ok(artifact.test_obligations.length > 0);
      assert.ok(artifact.parallelization_signals.length > 0);
      assert.ok(!/later Step 2 batches will populate/i.test(report));
      assert.ok(!STEP2_ALLOWED_SIDE_EFFECTS.some((entry) => /later Step 2 parts/i.test(entry)));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps warning-heavy but usable handoffs coherent under the Batch 3 Part 1 finish line",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-b3-freeze-warning-");

    try {
      const intakeResult = await runForgeCli(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const report = await readTextFile(join(repoRoot, ".forge", "reports", "plan-report.md"));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_intake.status, "warning");
      assert.equal(artifact.carry_forward.confidence.level, "low");
      assert.ok(artifact.carry_forward.concerns.length > 0);
      assert.match(report, /## Carry-Forward Context/);
      assert.match(report, /## Planning Readiness/);
      assert.match(report, /Planning Assist:\s+not used/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps debug and bounded assist usable under the Batch 3 Part 1 finish line",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-b3-freeze-assist-");
    const originalDebugEnv = process.env.FORGE_PLAN_DEBUG;

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const result = await runPlanCommand(
        { repo: repoRoot },
        repoRoot,
        {
          planningAssistHook: async ({ model }) => ({
            provider: "test-hook",
            planItemEdits: model.planItems.map((item) => ({
              id: item.id,
              title: `${item.title} (freeze)`,
            })),
            reportNotes: ["Planning assist stayed bounded to wording during the Batch 3 Part 1 finish-line run."],
          }),
        },
      );

      assert.equal(result.status, "ready");
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "plan-debug.json")), true);

      const report = await readTextFile(join(repoRoot, ".forge", "reports", "plan-report.md"));
      const debugArtifact = await readJsonFile<{
        planning_assist?: {
          attempted: boolean;
          used: boolean;
          provider: string | null;
        };
      }>(join(repoRoot, ".forge", "debug", "plan-debug.json"));

      assert.match(report, /Planning Assist:\s+used/);
      assert.match(report, /bounded to wording/i);
      assert.equal(debugArtifact.planning_assist?.attempted, true);
      assert.equal(debugArtifact.planning_assist?.used, true);
      assert.equal(debugArtifact.planning_assist?.provider, "test-hook");
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_PLAN_DEBUG;
      } else {
        process.env.FORGE_PLAN_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
