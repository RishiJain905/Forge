import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

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
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-model-shared-entrypoint",
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
        "# Update app, helper, and config behavior",
        "",
        "Revise `package.json`, `src/app.ts`, and `src/helper.ts` and keep `tests/app.test.ts`, `tests/helper.test.ts`, and `src/cli.ts` aligned.",
        "",
        "## Acceptance Criteria",
        "",
        "- `package.json` is updated",
        "- `src/app.ts` is updated",
        "- `src/helper.ts` is updated",
        "- `tests/app.test.ts` stays aligned",
        "- `tests/helper.test.ts` stays aligned",
      ]);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const implementationItem = artifact.plan_items.find((item) => item.category === "implementation");
      const interfaceItem = artifact.plan_items.find((item) => item.category === "interface");
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(implementationItem, "expected an implementation plan item");
      assert.ok(interfaceItem, "expected a shared interface plan item");
      assert.ok(configItem, "expected a config plan item");
      assert.ok(
        implementationItem.likelyAffectedPaths.includes("src/app.ts"),
        "expected the shared-risk source file to remain in implementation planning",
      );
      assert.ok(
        implementationItem.likelyAffectedPaths.includes("src/helper.ts"),
        "expected the ordinary source file to remain in implementation planning",
      );
      assert.ok(
        implementationItem.dependencies.some((dependency) => dependency.planItemId === interfaceItem.id),
        "expected implementation work to depend on the shared interface item",
      );
      assert.ok(
        interfaceItem.dependencies.some((dependency) => dependency.planItemId === configItem.id),
        "expected interface work to depend on the config item",
      );
      assert.ok(interfaceItem.likelyAffectedPaths.includes("src/app.ts"));
      assert.ok(interfaceItem.likelyAffectedPaths.includes("src/cli.ts"));
      assert.ok(!interfaceItem.likelyAffectedPaths.includes("src/helper.ts"));
      assert.equal(
        interfaceItem.parallelization.signal,
        "risky_shared",
        "shared interface work should remain visibly risky even when config work exists upstream",
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
