import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import type { PlanArtifact } from "../src/plan/types.js";
import {
  PLAN_DEPENDENCY_TYPES,
  PLAN_ITEM_CATEGORIES,
  PLAN_ITEM_REQUIRED_FIELDS,
  PLAN_PARALLELIZATION_SIGNALS,
  PLAN_RISK_LEVELS,
  PLAN_TEST_OBLIGATION_CATEGORIES,
  PLAN_VERIFICATION_TARGET_CATEGORIES,
  STEP2_BOUNDARY_POLICY,
} from "../src/plan/constants.js";
import { PLAN_ARTIFACT_TOP_LEVEL_KEYS } from "../src/plan/schema.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
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
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function normalizePlanArtifact(artifact: PlanArtifact): Omit<PlanArtifact, "startedAt" | "finishedAt"> {
  const {
    startedAt,
    finishedAt,
    ...stableArtifact
  } = artifact;

  void startedAt;
  void finishedAt;

  return stableArtifact;
}

function planArtifactPath(repoRoot: string): string {
  return join(repoRoot, ".forge", "plan.json");
}

function planReportPath(repoRoot: string): string {
  return join(repoRoot, ".forge", "reports", "plan-report.md");
}

function assertExport(
  value: Record<string, unknown>,
  exportName: string,
): void {
  assert.equal(
    typeof value[exportName],
    "function",
    `expected ${exportName} to be exported`,
  );
}

await runScenario(
  "Gate 1 - contract stays frozen across the plan handoff and main artifact shape",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-p5-gate1-");

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

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      await removeSpecInputs(repoRoot);

      const inputModule = await import("../src/plan/input.js");
      const runnerModule = await import("../src/plan/runner.js");
      const plannerModule = await import("../src/plan/planner.js");
      const artifactModule = await import("../src/plan/artifact.js");
      const reportModule = await import("../src/plan/report.js");
      const schemaModule = await import("../src/plan/schema.js");

      assertExport(inputModule, "resolvePlanFoundationInput");
      assertExport(runnerModule, "buildPlanFoundation");
      assertExport(runnerModule, "runPlanFoundation");
      assertExport(runnerModule, "runPlanCommand");
      assertExport(plannerModule, "buildPlanModel");
      assertExport(artifactModule, "createPlanArtifact");
      assertExport(reportModule, "createPlanReport");
      assertExport(schemaModule, "validatePlanFoundationResult");
      assertExport(schemaModule, "validatePlanArtifact");
      assertExport(schemaModule, "validatePlanItem");

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));

      assert.deepEqual(Object.keys(artifact).sort(), [...PLAN_ARTIFACT_TOP_LEVEL_KEYS].sort());
      assert.equal(artifact.command, "forge plan");
      assert.equal(artifact.stage, "step2");
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_intake.artifactPath, join(repoRoot, ".forge", "intake.json"));
      assert.equal(artifact.purpose, STEP2_BOUNDARY_POLICY.purpose);
      assert.deepEqual(artifact.plan_item_contract.requiredFields, [...PLAN_ITEM_REQUIRED_FIELDS]);
      assert.deepEqual(artifact.plan_item_contract.categories, [...PLAN_ITEM_CATEGORIES]);
      assert.deepEqual(artifact.plan_item_contract.dependencyTypes, [...PLAN_DEPENDENCY_TYPES]);
      assert.deepEqual(artifact.plan_item_contract.riskLevels, [...PLAN_RISK_LEVELS]);
      assert.deepEqual(artifact.plan_item_contract.testObligationCategories, [...PLAN_TEST_OBLIGATION_CATEGORIES]);
      assert.deepEqual(artifact.plan_item_contract.verificationCategories, [...PLAN_VERIFICATION_TARGET_CATEGORIES]);
      assert.deepEqual(artifact.plan_item_contract.parallelizationSignals, [...PLAN_PARALLELIZATION_SIGNALS]);
      assert.ok(artifact.plan_items.length > 0);
      assert.ok(artifact.dependency_graph.length > 0);
      assert.ok(artifact.conflict_zones.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 2 - plan items and dependencies stay deterministic for the same intake artifact",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-p5-gate2-");

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

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const firstRun = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(firstRun.code, 0, firstRun.stderr);
      const firstArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const firstReport = await readTextFile(planReportPath(repoRoot));

      const firstStable = normalizePlanArtifact(firstArtifact);

      const secondRun = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(secondRun.code, 0, secondRun.stderr);
      const secondArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const secondReport = await readTextFile(planReportPath(repoRoot));

      const secondStable = normalizePlanArtifact(secondArtifact);

      assert.deepEqual(firstStable, secondStable);
      assert.equal(firstReport, secondReport);
      assert.deepEqual(
        firstArtifact.plan_items.map((item) => item.id),
        secondArtifact.plan_items.map((item) => item.id),
      );
      assert.deepEqual(
        firstArtifact.dependency_graph,
        secondArtifact.dependency_graph,
      );
      assert.deepEqual(
        firstArtifact.conflict_zones,
        secondArtifact.conflict_zones,
      );
      assert.deepEqual(
        firstArtifact.test_obligations,
        secondArtifact.test_obligations,
      );
      assert.deepEqual(
        firstArtifact.parallelization_signals,
        secondArtifact.parallelization_signals,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 3 - conflict zones and carried-forward concerns remain visible on warning and blocked runs",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-p5-gate3-");

    try {
      const warningResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(warningResult.code, 0, warningResult.stderr);
      await removeSpecInputs(repoRoot);

      const warningPlan = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(warningPlan.code, 0, warningPlan.stderr);

      const warningArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));

      assert.equal(warningArtifact.status, "ready");
      assert.equal(warningArtifact.source_intake.status, "warning");
      assert.equal(warningArtifact.source_intake.readyForPlanning, true);
      assert.ok(warningArtifact.conflict_zones.length > 0);
      assert.ok(warningArtifact.test_obligations.length > 0);
      assert.ok(warningArtifact.parallelization_signals.length > 0);
      assert.ok(warningArtifact.carry_forward.ambiguities.length > 0);
      assert.ok(warningArtifact.carry_forward.warnings.length > 0);
      assert.equal(warningArtifact.carry_forward.confidence.level, "low");
      assert.ok(warningArtifact.carry_forward.concerns.length > 0);
      assert.ok(
        warningArtifact.carry_forward.concerns.some((concern) => concern.source === "low_confidence"),
        "expected warning-grade output to preserve the low-confidence concern source",
      );

      const blockedRepoRoot = await createTempRepo("forge-plan-p5-gate3-blocked-");

      try {
        const blockedResult = runForgeBinary(
          ["intake", "--repo", blockedRepoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
          blockedRepoRoot,
        );
        assert.equal(blockedResult.code, 1);

        const blockedPlan = runForgePlanBinary(["--repo", blockedRepoRoot], blockedRepoRoot);
        assert.notEqual(blockedPlan.code, 0);

        const blockedArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(blockedRepoRoot));

        assert.equal(blockedArtifact.status, "blocked");
        assert.equal(blockedArtifact.source_intake.status, "failed");
        assert.equal(blockedArtifact.source_intake.readyForPlanning, false);
        assert.equal(blockedArtifact.planning_readiness.ready, false);
        assert.ok(blockedArtifact.plan_items.length > 0);
        assert.ok(blockedArtifact.dependency_graph.length > 0);
        assert.ok(blockedArtifact.conflict_zones.length > 0);
        assert.ok(blockedArtifact.test_obligations.length > 0);
        assert.ok(blockedArtifact.parallelization_signals.length > 0);
        assert.equal(blockedArtifact.carry_forward.confidence.level, "low");
        assert.ok(blockedArtifact.carry_forward.concerns.length > 0);
        assert.ok(
          blockedArtifact.carry_forward.concerns.some((concern) => concern.source === "readiness_blocker"),
          "expected blocked output to preserve readiness-blocker concern provenance",
        );
        assert.ok(
          blockedArtifact.plan_items.some((item) => item.parallelization.signal === "serial_only"),
          "expected blocked work to retain at least one serial_only signal",
        );
        const concernPlanItemIds = new Set(
          blockedArtifact.carry_forward.concerns.flatMap((concern) => concern.planItemIds),
        );
        assert.ok(
          blockedArtifact.plan_items.every((item) => concernPlanItemIds.has(item.id)),
          "expected blocked-run plan items to retain carried-forward concern mapping",
        );
      } finally {
        await disposeTempRepo(blockedRepoRoot);
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 4 - artifact and report stay coherent for the same planning run",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-p5-gate4-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.files.artifactPath, planArtifactPath(repoRoot));
      assert.equal(artifact.files.reportPath, planReportPath(repoRoot));
      assert.ok(report.includes("## Plan Items"));
      assert.ok(report.includes("## Dependencies"));
      assert.ok(report.includes("## Conflict Zones"));
      assert.ok(report.includes("## Test Obligations"));
      assert.ok(report.includes("## Parallelization"));
      assert.ok(report.includes("## Carry-Forward Context"));
      assert.ok(report.includes("## Planning Readiness"));
      assert.ok(report.includes(artifact.summary));
      assert.ok(report.includes(artifact.source_intake.summary));
      assert.ok(report.includes(artifact.files.artifactPath ?? ""));
      assert.ok(report.includes(artifact.files.reportPath ?? ""));
      assert.ok(artifact.plan_items.some((item) => report.includes(item.id)));
      assert.ok(artifact.conflict_zones.some((zone) => report.includes(zone.id)));
      const carriedForwardEvidence =
        artifact.carry_forward.concerns[0]?.id
        ?? artifact.carry_forward.ambiguities[0]
        ?? artifact.carry_forward.warnings[0];
      assert.ok(carriedForwardEvidence);
      assert.ok(report.includes(carriedForwardEvidence));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 5 - forge plan runs from persisted Step 1 output and writes durable files",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-p5-gate5-");

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

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(planReportPath(repoRoot)), true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
