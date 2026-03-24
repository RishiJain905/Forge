import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runPlanCommand } from "../src/plan/runner.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
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

await runScenario(
  "runPlanCommand blocks a structurally valid intake handoff that has no actionable planning signal",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-runner-thin-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifactPath = join(repoRoot, ".forge", "intake.json");
      const intakeArtifact = await readJsonFile<Record<string, unknown>>(intakeArtifactPath);
      const taskSpec = {
        ...(intakeArtifact.task_spec as Record<string, unknown>),
        explicit_requirements: [],
        acceptance_criteria: [],
        implementation_necessities: [],
      };

      await writeFile(
        intakeArtifactPath,
        `${JSON.stringify(
          {
            ...intakeArtifact,
            task_spec: taskSpec,
            candidate_targets: [],
            initial_verification_targets: [],
            next_step_readiness: {
              ...(intakeArtifact.next_step_readiness as Record<string, unknown>),
              ready: true,
              blocking_issues: [],
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = await runPlanCommand({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.equal(result.outputRoot, join(repoRoot, ".forge"));
      assert.equal(await fileExists(join(repoRoot, ".forge", "plan.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "reports", "plan-report.md")), true);

      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        planning_readiness: { ready: boolean; blocking_issues: Array<{ code: string; message: string }> };
        summary: string;
        plan_items: unknown[];
      }>(join(repoRoot, ".forge", "plan.json"));

      assert.equal(planArtifact.status, "blocked");
      assert.equal(planArtifact.planning_readiness.ready, false);
      assert.ok(planArtifact.planning_readiness.blocking_issues.some((issue) => issue.code === "PLAN_INPUT_TOO_WEAK"));
      assert.match(planArtifact.summary, /non-actionable|not actionable|insufficient/i);
      assert.deepEqual(planArtifact.plan_items, []);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
