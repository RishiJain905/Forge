import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
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

async function removeSpecInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function planArtifactPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "plan.json");
}

function planReportPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "reports", "plan-report.md");
}

function planDebugPath(repoRoot: string, fileName: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "debug", fileName);
}

async function writeTaskRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "package.json",
    JSON.stringify(
      {
        name: "forge-plan-debug-output",
        private: true,
        type: "module",
        scripts: {
          test: "node --test",
        },
      },
      null,
      2,
    ),
  );
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

type PlanDebugArtifact = {
  command: "forge plan";
  stage: "step2";
  outputRoot: string;
  files: {
    artifactPath: string | null;
    reportPath: string | null;
    debugArtifactPath: string;
    debugPlanItemsPath: string;
    debugDependenciesPath: string;
    debugConflictZonesPath: string;
    debugTestObligationsPath: string;
  };
  status: "ready" | "blocked" | "failed";
  plan_items: Array<{ id: string }>;
  dependency_graph: Array<{ planItemId: string; dependsOnPlanItemId: string }>;
  conflict_zones: Array<{ id: string; planItemIds: string[] }>;
  test_obligations: Array<{ planItemId: string; category: string }>;
  parallelization_signals: Array<{ planItemId: string; signal: string }>;
  carry_forward: {
    concerns: Array<{ id: string; planItemIds: string[] }>;
  };
  planning_readiness: {
    ready: boolean;
    blocking_issues: Array<{ code: string; message: string }>;
  };
  planning_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    planning_assist: {
      outcome: "not_attempted" | "no_suggestion" | "applied" | "ignored_only" | "failed";
      provider: string | null;
    };
  };
  planning_assist: {
    outcome: "not_attempted" | "no_suggestion" | "applied" | "ignored_only" | "failed";
    provider: string | null;
  };
};

await runScenario(
  "forge plan does not write planning debug artifacts when FORGE_PLAN_DEBUG is unset",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-debug-disabled-");

    try {
      await writeTaskRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      delete process.env.FORGE_PLAN_DEBUG;
      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(planReportPath(repoRoot)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json")), false);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-items.json")), false);
      assert.equal(await fileExists(planDebugPath(repoRoot, "dependencies.json")), false);
      assert.equal(await fileExists(planDebugPath(repoRoot, "conflict-zones.json")), false);
      assert.equal(await fileExists(planDebugPath(repoRoot, "test-obligations.json")), false);
    } finally {
      delete process.env.FORGE_PLAN_DEBUG;
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan writes planning debug artifacts when FORGE_PLAN_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-debug-enabled-");

    try {
      await writeTaskRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-items.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "dependencies.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "conflict-zones.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "test-obligations.json")), true);

      const debugArtifact = await readJsonFile<PlanDebugArtifact>(planDebugPath(repoRoot, "plan-debug.json"));

      assert.equal(debugArtifact.command, "forge plan");
      assert.equal(debugArtifact.stage, "step2");
      assert.equal(debugArtifact.outputRoot, join(repoRoot, ".forge"));
      assert.equal(debugArtifact.files.artifactPath, planArtifactPath(repoRoot));
      assert.equal(debugArtifact.files.reportPath, planReportPath(repoRoot));
      assert.equal(debugArtifact.files.debugArtifactPath, planDebugPath(repoRoot, "plan-debug.json"));
      assert.equal(debugArtifact.files.debugPlanItemsPath, planDebugPath(repoRoot, "plan-items.json"));
      assert.equal(debugArtifact.files.debugDependenciesPath, planDebugPath(repoRoot, "dependencies.json"));
      assert.equal(debugArtifact.files.debugConflictZonesPath, planDebugPath(repoRoot, "conflict-zones.json"));
      assert.equal(debugArtifact.files.debugTestObligationsPath, planDebugPath(repoRoot, "test-obligations.json"));
      assert.ok(debugArtifact.plan_items.length > 0);
      assert.ok(debugArtifact.dependency_graph.length > 0);
      assert.ok(debugArtifact.conflict_zones.length > 0);
      assert.ok(debugArtifact.test_obligations.length > 0);
      assert.ok(debugArtifact.parallelization_signals.length > 0);
      assert.equal(debugArtifact.planning_readiness.ready, true);
      assert.equal(debugArtifact.planning_diagnostics.usability_status, "actionable");
      assert.equal(debugArtifact.planning_diagnostics.planning_assist.outcome, "not_attempted");
      assert.equal(debugArtifact.planning_assist.outcome, "not_attempted");
    } finally {
      delete process.env.FORGE_PLAN_DEBUG;
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan writes debug artifacts to a custom repo-internal output root",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-debug-custom-root-");
    const outputDir = "custom-forge";

    try {
      await writeTaskRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--output-dir", outputDir, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(["--repo", repoRoot, "--output-dir", outputDir], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json", outputDir)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-items.json", outputDir)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "dependencies.json", outputDir)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "conflict-zones.json", outputDir)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "test-obligations.json", outputDir)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json")), false);
    } finally {
      delete process.env.FORGE_PLAN_DEBUG;
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps blocked runs debuggable when FORGE_PLAN_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-debug-blocked-");

    try {
      process.env.FORGE_PLAN_DEBUG = "1";
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(planResult.code, 0);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(planReportPath(repoRoot)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json")), true);

      const debugArtifact = await readJsonFile<PlanDebugArtifact>(planDebugPath(repoRoot, "plan-debug.json"));

      assert.equal(debugArtifact.status, "blocked");
      assert.equal(debugArtifact.planning_readiness.ready, false);
      assert.equal(debugArtifact.planning_diagnostics.usability_status, "upstream_blocked");
      assert.equal(debugArtifact.planning_diagnostics.planning_assist.outcome, "not_attempted");
      assert.ok(debugArtifact.plan_items.length > 0);
      assert.ok(debugArtifact.carry_forward.concerns.length > 0);
      assert.ok(
        debugArtifact.carry_forward.concerns.every((concern) => concern.planItemIds.length > 0),
      );
    } finally {
      delete process.env.FORGE_PLAN_DEBUG;
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan ignores debug-write failures after critical writes succeed",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-debug-write-failure-");

    try {
      await writeTaskRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      await mkdir(planDebugPath(repoRoot, "plan-items.json"), { recursive: true });

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(planReportPath(repoRoot)), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "plan-debug.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "dependencies.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "conflict-zones.json")), true);
      assert.equal(await fileExists(planDebugPath(repoRoot, "test-obligations.json")), true);
    } finally {
      delete process.env.FORGE_PLAN_DEBUG;
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
