import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { resolvePlanFoundationInput } from "../src/plan/input.js";
import { buildPlanItemFoundations, buildPlanModel } from "../src/plan/planner.js";
import { buildPlanFoundation } from "../src/plan/runner.js";
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

type PlanDependency = {
  planItemId: string;
  type: "hard" | "soft" | "sequencing" | "interface_first";
  reason: string;
};

type PlanTestObligation = {
  category: string;
  reason: string;
};

type PlanItem = {
  id: string;
  title: string;
  description: string;
  category: "implementation" | "test" | "interface" | "config" | "documentation" | "foundation";
  sourceRequirements: string[];
  likelyAffectedPaths: string[];
  dependencies: PlanDependency[];
  riskLevel: "low" | "medium" | "high";
  testObligations: PlanTestObligation[];
  verificationRelevance: {
    relevant: boolean;
    categories: string[];
    notes: string[];
  };
  parallelization: {
    signal: "serial_only" | "safe_parallel" | "parallel_after_dependency" | "risky_shared" | "protected_merge_order";
    reason: string;
  };
};

type PlanDependencyGraphEntry = {
  planItemId: string;
  dependsOnPlanItemId: string;
  type: PlanDependency["type"];
  reason: string;
};

type PlanConflictZone = {
  id: string;
  title: string;
  reason: string;
  paths: string[];
  planItemIds: string[];
  riskLevel: "low" | "medium" | "high";
};

type PlanArtifact = {
  status: "ready" | "blocked" | "failed";
  planning_readiness: {
    ready: boolean;
    blocking_issues: Array<{ code: string; message: string }>;
    recommended_user_actions: string[];
  };
  plan_items: PlanItem[];
  dependency_graph: PlanDependencyGraphEntry[];
  conflict_zones: PlanConflictZone[];
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
  };
};

async function loadPlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

async function writeSpecAndRunIntake(repoRoot: string, specLines: string[], specPath = join(repoRoot, "task.md")): Promise<void> {
  await writeRepoFile(repoRoot, "task.md", specLines.join("\n"));

  const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", specPath], repoRoot);
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  await removeSpecInputs(repoRoot);
}

await runScenario(
  "buildPlanItemFoundations preserves multi-source requirement traces for a targeted surface",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-foundation-traces-");

    try {
      await writeSpecAndRunIntake(repoRoot, [
        "# Update app behavior",
        "",
        "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` is updated",
        "- `tests/app.test.ts` stays aligned",
      ]);

      const resolvedInput = await resolvePlanFoundationInput({ repo: repoRoot }, repoRoot);
      const foundation = buildPlanFoundation({
        ...resolvedInput,
        planningInput: {
          ...resolvedInput.planningInput,
          context: {
            ...resolvedInput.planningInput.context,
            taskSpec: {
              ...resolvedInput.planningInput.context.taskSpec,
              explicit_requirements: ["Update src/app.ts"],
              acceptance_criteria: ["Update src/app.ts", "Keep tests aligned"],
              implementation_necessities: ["Update src/app.ts"],
            },
          },
        },
      });
      const foundations = buildPlanItemFoundations(foundation);
      const implementationFoundation = foundations.find((item) =>
        item.category === "implementation" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "src/app.ts");

      assert.ok(implementationFoundation, "expected a dedicated app implementation foundation item");
      const appTrace = implementationFoundation.sourceTraces.find((trace) => trace.requirement === "Update src/app.ts");
      assert.ok(appTrace, "expected a source trace for the repeated app requirement");
      assert.deepEqual(
        appTrace.requirementSources.sort(),
        ["acceptance_criteria", "explicit_requirement", "implementation_necessity"].sort(),
      );
      assert.ok(
        appTrace.matchedCandidateTargetPaths.includes("src/app.ts"),
        "expected the source trace to retain candidate-target path linkage",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "buildPlanItemFoundations uses inferred source requirements for unmatched config surfaces",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-unmatched-config-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify({
          name: "forge-plan-model-unmatched-config",
          private: true,
          type: "module",
        }, null, 2),
      );

      await writeSpecAndRunIntake(repoRoot, [
        "# Update app behavior",
        "",
        "Revise `src/app.ts`.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` is updated",
      ]);

      const resolvedInput = await resolvePlanFoundationInput({ repo: repoRoot }, repoRoot);
      const foundation = buildPlanFoundation({
        ...resolvedInput,
        planningInput: {
          ...resolvedInput.planningInput,
          context: {
            ...resolvedInput.planningInput.context,
            taskSpec: {
              ...resolvedInput.planningInput.context.taskSpec,
              explicit_requirements: ["Update src/app.ts"],
              acceptance_criteria: [],
              implementation_necessities: [],
            },
            candidateTargets: [
              {
                path: "src/app.ts",
                kind: "source",
                match_type: "explicit",
                reason: "explicit source target",
                notes: [],
                shared_risk: false,
              },
              {
                path: "package.json",
                kind: "manifest",
                match_type: "explicit",
                reason: "config surface remains relevant",
                notes: [],
                shared_risk: true,
              },
            ],
            initialVerificationTargets: [],
          },
        },
      });
      const foundations = buildPlanItemFoundations(foundation);
      const configFoundation = foundations.find((item) =>
        item.category === "config" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "package.json");

      assert.ok(configFoundation, "expected a config foundation item for package.json");
      assert.deepEqual(
        configFoundation.sourceRequirements,
        ["Planning surface inferred from Step 1 targeting for `package.json`."],
      );
      assert.deepEqual(
        configFoundation.sourceTraces[0]?.requirementSources,
        ["goal"],
      );
      assert.ok(
        configFoundation.sourceTraces[0]?.matchedCandidateTargetPaths.includes("package.json"),
        "expected the inferred trace to retain package.json targeting evidence",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan uses source traces to carry verification categories onto implementation items",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-trace-verification-");

    try {
      await writeRepoFile(repoRoot, "src/retry.ts", "export const retryPolicy = true;\n");

      await writeSpecAndRunIntake(repoRoot, [
        "# Update app behavior",
        "",
        "Revise `src/app.ts` while keeping retry handling aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` is updated",
      ]);

      const resolvedInput = await resolvePlanFoundationInput({ repo: repoRoot }, repoRoot);
      const foundation = buildPlanFoundation({
        ...resolvedInput,
        planningInput: {
          ...resolvedInput.planningInput,
          context: {
            ...resolvedInput.planningInput.context,
            taskSpec: {
              ...resolvedInput.planningInput.context.taskSpec,
              explicit_requirements: ["Keep src/app.ts aligned with src/retry.ts handling"],
              acceptance_criteria: [],
              implementation_necessities: [],
              risky_phrases: [],
            },
            candidateTargets: [
              {
                path: "src/app.ts",
                kind: "source",
                match_type: "explicit",
                reason: "explicit source target",
                notes: [],
                shared_risk: false,
              },
            ],
            initialVerificationTargets: [
              {
                path: "src/retry.ts",
                kind: "source",
                category: "retry_logic",
                reason: "retry behavior needs focused verification",
              },
            ],
          },
        },
      });
      const model = buildPlanModel(foundation);
      const implementationItem = model.planItems.find((item) =>
        item.category === "implementation" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "src/app.ts");

      assert.ok(implementationItem, "expected an implementation item for src/app.ts");
      assert.ok(
        implementationItem.verificationRelevance.categories.includes("retry_logic"),
        "expected trace-linked retry verification to flow into the implementation item",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan splits unrelated source and test surfaces into separate implementation and test plan items",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-granular-items-");

    try {
      await writeRepoFile(repoRoot, "src/helper.ts", "export const helper = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/helper.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );

      await writeSpecAndRunIntake(repoRoot, [
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
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const implementationItems = artifact.plan_items.filter((item) => item.category === "implementation");
      const testItems = artifact.plan_items.filter((item) => item.category === "test");
      const appImplementationItem = implementationItems.find((item) =>
        item.likelyAffectedPaths.length === 1 && item.likelyAffectedPaths[0] === "src/app.ts");
      const helperImplementationItem = implementationItems.find((item) =>
        item.likelyAffectedPaths.length === 1 && item.likelyAffectedPaths[0] === "src/helper.ts");
      const appTestItem = testItems.find((item) =>
        item.likelyAffectedPaths.length === 1 && item.likelyAffectedPaths[0] === "tests/app.test.ts");
      const helperTestItem = testItems.find((item) =>
        item.likelyAffectedPaths.length === 1 && item.likelyAffectedPaths[0] === "tests/helper.test.ts");

      assert.ok(implementationItems.length >= 2, "expected one implementation item per source surface");
      assert.ok(testItems.length >= 2, "expected one test item per test surface");
      assert.ok(appImplementationItem, "expected a dedicated app implementation item");
      assert.ok(helperImplementationItem, "expected a dedicated helper implementation item");
      assert.ok(appTestItem, "expected a dedicated app test item");
      assert.ok(helperTestItem, "expected a dedicated helper test item");
      assert.ok(
        appTestItem.dependencies.some((dependency) => dependency.planItemId === appImplementationItem.id),
        "expected app test work to depend on the app implementation item",
      );
      assert.ok(
        helperTestItem.dependencies.some((dependency) => dependency.planItemId === helperImplementationItem.id),
        "expected helper test work to depend on the helper implementation item",
      );
      assert.ok(
        !appTestItem.dependencies.some((dependency) => dependency.planItemId === helperImplementationItem.id),
        "expected app test work to avoid unrelated helper implementation dependencies",
      );
      assert.ok(
        !helperTestItem.dependencies.some((dependency) => dependency.planItemId === appImplementationItem.id),
        "expected helper test work to avoid unrelated app implementation dependencies",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan builds populated plan items, explicit dependencies, and conflict zones for a grounded spec",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-grounded-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-model-grounded",
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

      await writeSpecAndRunIntake(repoRoot, [
        "# Update app behavior",
        "",
        "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` is updated",
        "- `tests/app.test.ts` stays aligned",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const planItemIds = new Set(artifact.plan_items.map((item) => item.id));

      assert.equal(artifact.status, "ready");
      assert.ok(artifact.plan_items.length > 0, "expected populated plan items");
      assert.ok(artifact.dependency_graph.length > 0, "expected explicit dependency graph entries");
      assert.ok(artifact.conflict_zones.length > 0, "expected visible conflict zones");
      assert.ok(artifact.plan_items.some((item) => item.category === "implementation"));
      assert.ok(artifact.plan_items.some((item) => item.category === "test"));
      assert.ok(artifact.plan_items.some((item) => item.dependencies.length > 0));
      assert.ok(artifact.plan_items.some((item) => item.testObligations.length > 0));
      assert.ok(artifact.plan_items.some((item) => item.parallelization.signal.length > 0));
      assert.ok(
        artifact.dependency_graph.every(
          (entry) => planItemIds.has(entry.planItemId) && planItemIds.has(entry.dependsOnPlanItemId),
        ),
      );
      assert.ok(
        artifact.conflict_zones.every((zone) => zone.planItemIds.every((planItemId) => planItemIds.has(planItemId))),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps shared-risk source files in implementation items while limiting interface work to the targeted shared entrypoint",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-shared-entrypoint-");

    try {
      await writeRepoFile(repoRoot, "src/app.ts", "export const app = true;\n");
      await writeRepoFile(repoRoot, "src/helper.ts", "export const helper = true;\n");
      await writeRepoFile(repoRoot, "src/cli.ts", "export const cli = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/app.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );
      await writeRepoFile(
        repoRoot,
        "tests/helper.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );

      await writeSpecAndRunIntake(repoRoot, [
        "# Update app and helper behavior",
        "",
        "Revise `src/app.ts` and `src/helper.ts` and keep `tests/app.test.ts` and `tests/helper.test.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` is updated",
        "- `src/helper.ts` is updated",
        "- `tests/app.test.ts` stays aligned",
        "- `tests/helper.test.ts` stays aligned",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const appImplementationItem = artifact.plan_items.find((item) =>
        item.category === "implementation" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "src/app.ts");
      const helperImplementationItem = artifact.plan_items.find((item) =>
        item.category === "implementation" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "src/helper.ts");
      const interfaceItem = artifact.plan_items.find((item) => item.category === "interface");

      assert.ok(appImplementationItem, "expected a dedicated app implementation plan item");
      assert.ok(helperImplementationItem, "expected a dedicated helper implementation plan item");
      assert.ok(interfaceItem, "expected a shared interface plan item");
      assert.ok(
        appImplementationItem.likelyAffectedPaths.includes("src/app.ts"),
        "expected the shared-risk source file to remain in implementation planning as its own item",
      );
      assert.ok(
        helperImplementationItem.likelyAffectedPaths.includes("src/helper.ts"),
        "expected the ordinary source file to remain in implementation planning as its own item",
      );
      assert.ok(
        appImplementationItem.dependencies.some((dependency) => dependency.planItemId === interfaceItem.id),
        "expected the app implementation work to depend on the shared interface item",
      );
      assert.ok(
        !helperImplementationItem.dependencies.some((dependency) => dependency.planItemId === interfaceItem.id),
        "expected unrelated helper implementation work to avoid the shared interface dependency",
      );
      assert.deepEqual(interfaceItem.likelyAffectedPaths, ["src/app.ts"]);
      assert.ok(!interfaceItem.likelyAffectedPaths.includes("src/helper.ts"));
      assert.ok(!interfaceItem.likelyAffectedPaths.includes("src/cli.ts"));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps shared-surface test items out of implementation dependencies",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-shared-surface-cycle-");

    try {
      await writeRepoFile(repoRoot, "src/schema.ts", "export const schema = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/schema.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );

      await writeSpecAndRunIntake(repoRoot, [
        "# Update shared schema behavior",
        "",
        "Revise `src/schema.ts` and keep `tests/schema.test.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/schema.ts` is updated",
        "- `tests/schema.test.ts` stays aligned",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const implementationItem = artifact.plan_items.find((item) =>
        item.category === "implementation" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "src/schema.ts");
      const testItem = artifact.plan_items.find((item) =>
        item.category === "test" &&
        item.likelyAffectedPaths.length === 1 &&
        item.likelyAffectedPaths[0] === "tests/schema.test.ts");

      assert.ok(implementationItem, "expected a dedicated schema implementation item");
      assert.ok(testItem, "expected a dedicated schema test item");
      assert.ok(
        testItem.dependencies.some((dependency) => dependency.planItemId === implementationItem.id),
        "expected schema test work to depend on schema implementation work",
      );
      assert.ok(
        !implementationItem.dependencies.some((dependency) => dependency.planItemId === testItem.id),
        "expected schema implementation work to avoid depending on the test item",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps shared interface work tied to config visibly risky instead of parallel after dependency",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-interface-config-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-model-interface-config",
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
      await writeRepoFile(repoRoot, "src/cli.ts", "export const cli = true;\n");

      await writeSpecAndRunIntake(repoRoot, [
        "# Update CLI contract and package config",
        "",
        "Keep `package.json` and `src/cli.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `package.json` is updated",
        "- `src/cli.ts` is updated",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const configItem = artifact.plan_items.find((item) => item.category === "config");
      const interfaceItem = artifact.plan_items.find((item) => item.category === "interface");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(interfaceItem, "expected a shared interface plan item");
      assert.ok(
        interfaceItem.dependencies.some((dependency) => dependency.planItemId === configItem.id),
        "expected the interface item to depend on config work",
      );
      assert.equal(
        interfaceItem.parallelization.signal,
        "risky_shared",
        "expected config-tied interface work to remain visibly risky",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan can attach one requirement to multiple plan items when source and test work need separate handling",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-shared-requirement-");

    try {
      await writeSpecAndRunIntake(repoRoot, [
        "# Keep app behavior aligned",
        "",
        "Keep `src/app.ts` and `tests/app.test.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` and `tests/app.test.ts` stay aligned",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const requirementCounts = new Map<string, number>();

      for (const item of artifact.plan_items) {
        for (const requirement of item.sourceRequirements) {
          requirementCounts.set(requirement, (requirementCounts.get(requirement) ?? 0) + 1);
        }
      }

      assert.ok(artifact.plan_items.length >= 2, "expected multiple plan items for source/test split");
      assert.ok(artifact.plan_items.some((item) => item.category === "implementation"));
      assert.ok(artifact.plan_items.some((item) => item.category === "test"));
      assert.ok([...requirementCounts.values()].some((count) => count >= 2));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan can collapse multiple requirements into one plan item when they target the same surface",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-collapsed-requirements-");

    try {
      await writeSpecAndRunIntake(repoRoot, [
        "# Update app implementation",
        "",
        "Revise `src/app.ts`.",
        "",
        "## Acceptance Criteria",
        "",
        "- `src/app.ts` adds the new behavior",
        "- `src/app.ts` keeps the existing API stable",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.ok(artifact.plan_items.length > 0, "expected at least one plan item");
      assert.ok(
        artifact.plan_items.some((item) => item.sourceRequirements.length >= 2),
        "expected a collapsed item carrying multiple source requirements",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps conservative items and conflict zones for fallback low-confidence runs",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-fallback-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.ok(artifact.plan_items.length > 0, "expected conservative plan items");
      assert.ok(artifact.conflict_zones.length > 0, "expected conflict zones to remain visible");
      assert.ok(
        artifact.plan_items.some((item) => item.riskLevel !== "low"),
        "expected at least one conservative item with non-low risk",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps diagnostic plan structure visible for blocked-but-persisted Step 1 handoffs",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-model-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );

      assert.equal(intakeResult.code, 1);
      const intakeArtifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
      assert.equal(intakeArtifact.status, "failed");

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.ok(artifact.plan_items.length > 0, "expected diagnostic plan items even when blocked");
      assert.ok(artifact.dependency_graph.length > 0, "expected diagnostic dependencies even when blocked");
      assert.ok(artifact.conflict_zones.length > 0, "expected diagnostic conflict zones even when blocked");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
