import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  FORGE_PLAN_STAGE,
  PLAN_DEPENDENCY_TYPES,
  PLAN_ITEM_CATEGORIES,
  PLAN_ITEM_REQUIRED_FIELDS,
  PLAN_PARALLELIZATION_SIGNALS,
  PLAN_RISK_LEVELS,
  PLAN_TEST_OBLIGATION_CATEGORIES,
  PLAN_VERIFICATION_TARGET_CATEGORIES,
} from "../src/plan/constants.js";
import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
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
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

const REQUIRED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_intake",
  "plan_item_contract",
  "plan_items",
  "dependency_graph",
  "conflict_zones",
  "test_obligations",
  "parallelization_signals",
  "carry_forward",
  "planning_readiness",
  "failure",
] as const;

type PlanArtifact = {
  schemaVersion: string;
  command: "forge plan";
  stage: typeof FORGE_PLAN_STAGE;
  status: "ready" | "blocked" | "failed";
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: {
    mode: string;
    repoReadOnlyOutsideOutputRoot: boolean;
    allowedRoot: string;
    allowedSideEffects: string[];
    deferredCapabilities: string[];
    disallowedCapabilities: string[];
  };
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: string[];
  source_intake: {
    artifactPath: string;
    command: string;
    status: string;
    summary: string;
    readyForPlanning: boolean;
  };
  plan_item_contract: {
    requiredFields: string[];
    categories: string[];
    dependencyTypes: string[];
    riskLevels: string[];
    testObligationCategories: string[];
    verificationCategories: string[];
    parallelizationSignals: string[];
  };
  plan_items: unknown[];
  dependency_graph: Array<{
    planItemId: string;
    dependsOnPlanItemId: string;
    type: string;
    reason: string;
  }>;
  conflict_zones: Array<{
    id: string;
    title: string;
    reason: string;
    paths: string[];
    planItemIds: string[];
    riskLevel: string;
  }>;
  test_obligations: unknown[];
  parallelization_signals: unknown[];
  carry_forward: {
    task_spec: IntakeArtifact["task_spec"];
    repo_context: IntakeArtifact["repo_context"];
    candidate_targets: IntakeArtifact["candidate_targets"];
    risk_analysis: IntakeArtifact["risk_analysis"];
    initial_verification_targets: IntakeArtifact["initial_verification_targets"];
    ambiguities: string[];
    warnings: string[];
    confidence: IntakeArtifact["confidence"];
    next_step_readiness: IntakeArtifact["next_step_readiness"];
    concerns: Array<{
      id: string;
      source: string;
      code: string | null;
      message: string;
      planItemIds: string[];
      effects: string[];
      status: "carried_forward";
    }>;
  };
  planning_readiness: IntakeArtifact["next_step_readiness"];
  failure: { code: string; message: string } | null;
};

await runScenario(
  "forge plan exposes the exact top-level plan artifact keys and frozen contract arrays",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-artifact-schema-");
    const specPath = join(repoRoot, "task.md");

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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);

      const artifactPath = join(repoRoot, ".forge", "plan.json");
      const artifact = await readJsonFile<PlanArtifact>(artifactPath);
      const intakeArtifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));

      assert.deepEqual(Object.keys(artifact).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());
      assert.equal(artifact.command, "forge plan");
      assert.equal(artifact.stage, FORGE_PLAN_STAGE);
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_intake.artifactPath, join(repoRoot, ".forge", "intake.json"));
      assert.equal(artifact.source_intake.command, intakeArtifact.command);
      assert.equal(artifact.source_intake.status, intakeArtifact.status);
      assert.equal(artifact.source_intake.summary, intakeArtifact.summary);
      assert.equal(artifact.source_intake.readyForPlanning, true);
      assert.equal(artifact.planning_readiness.ready, true);
      assert.deepEqual(artifact.plan_item_contract.requiredFields, [...PLAN_ITEM_REQUIRED_FIELDS]);
      assert.deepEqual(artifact.plan_item_contract.categories, [...PLAN_ITEM_CATEGORIES]);
      assert.deepEqual(artifact.plan_item_contract.dependencyTypes, [...PLAN_DEPENDENCY_TYPES]);
      assert.deepEqual(artifact.plan_item_contract.riskLevels, [...PLAN_RISK_LEVELS]);
      assert.deepEqual(
        artifact.plan_item_contract.testObligationCategories,
        [...PLAN_TEST_OBLIGATION_CATEGORIES],
      );
      assert.deepEqual(
        artifact.plan_item_contract.verificationCategories,
        [...PLAN_VERIFICATION_TARGET_CATEGORIES],
      );
      assert.deepEqual(
        artifact.plan_item_contract.parallelizationSignals,
        [...PLAN_PARALLELIZATION_SIGNALS],
      );
      assert.ok(artifact.plan_items.length > 0, "expected populated plan items");
      assert.ok(artifact.dependency_graph.length > 0, "expected explicit dependency graph");
      assert.ok(artifact.conflict_zones.length > 0, "expected visible conflict zones");
      assert.ok(
        artifact.plan_items.every((item) => {
          const planItem = item as {
            id: string;
            title: string;
            description: string;
            category: string;
            sourceRequirements: string[];
            likelyAffectedPaths: string[];
            dependencies: Array<{ planItemId: string; type: string; reason: string }>;
            riskLevel: string;
            testObligations: Array<{ category: string; reason: string }>;
            verificationRelevance: { relevant: boolean; categories: string[]; notes: string[] };
            parallelization: { signal: string; reason: string };
          };

          return (
            planItem.id.length > 0 &&
            planItem.title.length > 0 &&
            planItem.description.length > 0 &&
            planItem.category.length > 0 &&
            planItem.sourceRequirements.length > 0 &&
            planItem.likelyAffectedPaths.length > 0 &&
            Array.isArray(planItem.dependencies) &&
            Array.isArray(planItem.testObligations) &&
            typeof planItem.verificationRelevance.relevant === "boolean" &&
            Array.isArray(planItem.verificationRelevance.categories) &&
            Array.isArray(planItem.verificationRelevance.notes) &&
            planItem.parallelization.signal.length > 0 &&
            planItem.parallelization.reason.length > 0
          );
        }),
      );
      assert.ok(
        artifact.dependency_graph.every(
          (edge) =>
            artifact.plan_items.some((item) => (item as { id: string }).id === edge.planItemId) &&
            artifact.plan_items.some((item) => (item as { id: string }).id === edge.dependsOnPlanItemId),
        ),
      );
      assert.ok(
        artifact.conflict_zones.every((zone) =>
          zone.planItemIds.every((planItemId) =>
            artifact.plan_items.some((item) => (item as { id: string }).id === planItemId),
          ),
        ),
      );
      assert.ok(artifact.test_obligations.length > 0, "expected top-level aggregated test obligations");
      assert.ok(artifact.parallelization_signals.length > 0, "expected top-level aggregated parallelization signals");
      assert.deepEqual(artifact.carry_forward.task_spec, intakeArtifact.task_spec);
      assert.deepEqual(artifact.carry_forward.repo_context, intakeArtifact.repo_context);
      assert.deepEqual(artifact.carry_forward.candidate_targets, intakeArtifact.candidate_targets);
      assert.deepEqual(artifact.carry_forward.risk_analysis, intakeArtifact.risk_analysis);
      assert.deepEqual(
        artifact.carry_forward.initial_verification_targets,
        intakeArtifact.initial_verification_targets,
      );
      assert.deepEqual(artifact.carry_forward.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(artifact.carry_forward.warnings, intakeArtifact.warnings);
      assert.deepEqual(artifact.carry_forward.confidence, intakeArtifact.confidence);
      assert.deepEqual(artifact.carry_forward.next_step_readiness, intakeArtifact.next_step_readiness);
      assert.ok(Array.isArray(artifact.carry_forward.concerns));
      assert.ok(
        artifact.test_obligations.every((entry) =>
          artifact.plan_items.some((item) => (item as { id: string }).id === (entry as { planItemId: string }).planItemId),
        ),
      );
      assert.ok(
        artifact.parallelization_signals.every((entry) =>
          artifact.plan_items.some((item) => (item as { id: string }).id === (entry as { planItemId: string }).planItemId),
        ),
      );
      assert.equal(artifact.failure, null);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
