import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

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

async function removeTaskSpec(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
}

async function removeDefaultScaffold(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

type PlanArtifact = {
  status: "ready" | "blocked" | "failed";
  plan_items: Array<{
    id: string;
    category: string;
    likelyAffectedPaths: string[];
    dependencies: Array<{
      planItemId: string;
      type: "hard" | "soft" | "sequencing" | "interface_first";
      reason: string;
    }>;
    testObligations: Array<{ category: string; reason: string }>;
    parallelization: { signal: string; reason: string };
  }>;
  dependency_graph: Array<{
    planItemId: string;
    dependsOnPlanItemId: string;
    type: "hard" | "soft" | "sequencing" | "interface_first";
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
  test_obligations: Array<{ planItemId: string; category: string; reason: string }>;
};

function loadPlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

await runScenario(
  "forge plan creates an interface-order dependency even when the interface and implementation files do not share a stem",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-interface-order-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-interface-order",
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
      await writeRepoFile(repoRoot, "src/helper.ts", "export const helper = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/helper.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update CLI and helper behavior",
          "",
          "Revise `src/cli.ts` to keep the command contract stable and update `src/helper.ts` to support it.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/cli.ts` keeps the public runtime behavior stable",
          "- `src/helper.ts` is updated",
          "- `tests/helper.test.ts` stays aligned",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeTaskSpec(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const interfaceItem = artifact.plan_items.find(
        (item) => item.category === "interface" && item.likelyAffectedPaths.includes("src/cli.ts"),
      );
      const helperItem = artifact.plan_items.find(
        (item) => item.category === "implementation" && item.likelyAffectedPaths.includes("src/helper.ts"),
      );

      assert.ok(interfaceItem, "expected a shared CLI interface item");
      assert.ok(helperItem, "expected a helper implementation item");
      assert.ok(
        helperItem.dependencies.some((dependency) => dependency.planItemId === interfaceItem.id),
        "expected helper work to depend on the shared CLI interface even without a shared stem",
      );
      assert.ok(
        artifact.dependency_graph.some(
          (entry) => entry.planItemId === helperItem.id && entry.dependsOnPlanItemId === interfaceItem.id,
        ),
        "expected the flattened dependency graph to preserve the same dependency edge",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan surfaces a soft dependency with explicit uncertainty during low-confidence fallback planning",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-soft-dependency-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-soft-dependency",
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
      await writeRepoFile(
        repoRoot,
        "tests/app.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.ok(artifact.plan_items.length > 0, "expected fallback plan items");
      assert.ok(artifact.dependency_graph.length > 0, "expected fallback planning to emit dependencies");
      assert.ok(
        artifact.dependency_graph.some(
          (entry) => entry.type === "soft" && /uncertain|likely|fallback|low-confidence/i.test(entry.reason),
        ),
        "expected at least one soft dependency with explicit uncertainty in the dependency graph",
      );
      assert.ok(
        artifact.plan_items.some((item) => item.dependencies.some((dependency) => dependency.type === "soft")),
        "expected at least one plan item to carry a soft dependency",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps a schema-style shared surface in a visible conflict zone spanning multiple plan items",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-conflict-zone-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-conflict-zone",
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
      await writeRepoFile(repoRoot, "src/schema.ts", "export const schema = true;\n");
      await writeRepoFile(repoRoot, "src/app.ts", "export const app = true;\n");
      await writeRepoFile(repoRoot, "src/helper.ts", "export const helper = true;\n");
      await writeRepoFile(
        repoRoot,
        "tests/app.test.ts",
        "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      );
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update schema and app behavior",
          "",
          "Revise `src/schema.ts`, `src/app.ts`, and keep `tests/app.test.ts` aligned.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/schema.ts` is updated",
          "- `src/app.ts` is updated",
          "- `tests/app.test.ts` stays aligned",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeTaskSpec(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.ok(artifact.plan_items.length > 0, "expected populated plan items");
      assert.ok(
        artifact.conflict_zones.some(
          (zone) =>
            zone.paths.some((path) => path === "src/schema.ts") &&
            zone.planItemIds.length >= 2,
        ),
        "expected a conflict zone to span multiple plan items around the schema-style surface",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps low-risk config work carrying a baseline regression obligation",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-low-risk-obligation-");

    try {
      await removeDefaultScaffold(repoRoot);
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-low-risk-obligation",
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
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update package config",
          "",
          "Adjust `package.json` only.",
          "",
          "## Acceptance Criteria",
          "",
          "- `package.json` is updated",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeTaskSpec(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(configItem.testObligations.length > 0, "expected a minimal explicit obligation to remain visible");
      assert.ok(
        artifact.test_obligations.some((entry) => entry.planItemId === configItem.id),
        "expected the config item obligation to remain visible in the top-level artifact",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan gives shared public runtime work more than a single contract check",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-public-obligations-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-public-obligations",
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
        "task.md",
        [
          "# Update the public API contract",
          "",
          "Revise `src/app.ts` while keeping the CLI contract in `src/cli.ts` stable.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/app.ts` is updated",
          "- `src/cli.ts` keeps the public runtime behavior stable",
          "- `tests/app.test.ts` stays aligned",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeTaskSpec(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const interfaceItem = artifact.plan_items.find(
        (item) => item.category === "interface" && item.likelyAffectedPaths.includes("src/app.ts"),
      );

      assert.ok(interfaceItem, "expected a public interface item");
      assert.ok(
        interfaceItem.testObligations.some((obligation) => obligation.category === "contract_validation"),
        "expected the shared public surface to keep contract validation visible",
      );
      assert.ok(
        interfaceItem.testObligations.some((obligation) => obligation.category === "integration"),
        "expected the shared public surface to pick up stronger integration validation as well",
      );
      assert.ok(
        artifact.test_obligations.some(
          (entry) => entry.planItemId === interfaceItem.id && entry.category === "integration",
        ),
        "expected the stronger obligation to remain visible in the top-level artifact",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan can attach contract_validation and migration_validation to config-sensitive work",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-migration-obligations-");

    try {
      await removeDefaultScaffold(repoRoot);
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-migration-obligations",
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
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Migrate the CLI configuration",
          "",
          "Migrate `package.json` and `src/cli.ts` to the new command shape while keeping the public contract stable.",
          "",
          "## Acceptance Criteria",
          "",
          "- `package.json` is updated",
          "- `src/cli.ts` is updated",
          "- the migration path remains stable",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeTaskSpec(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await loadPlanArtifact(repoRoot);
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(
        configItem.testObligations.some((obligation) => obligation.category === "contract_validation"),
        "expected the config surface to keep contract validation visible",
      );
      assert.ok(
        configItem.testObligations.some((obligation) => obligation.category === "migration_validation"),
        "expected migration-like config work to also carry migration validation",
      );
      assert.ok(
        artifact.test_obligations.some(
          (entry) => entry.planItemId === configItem.id && entry.category === "migration_validation",
        ),
        "expected migration validation to remain visible at the artifact level",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps obligations visible even when a persisted handoff is blocked",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-blocked-obligations-");

    try {
      await removeDefaultScaffold(repoRoot);
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part3-blocked-obligations",
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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const artifact = await loadPlanArtifact(repoRoot);

      assert.equal(artifact.status, "blocked");
      assert.ok(artifact.plan_items.length > 0, "expected diagnostic plan items to remain visible");
      assert.ok(artifact.test_obligations.length > 0, "expected blocked output to keep top-level obligations visible");
      assert.ok(
        artifact.plan_items.some((item) => item.testObligations.length > 0),
        "expected blocked output to keep at least one item-level obligation visible",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
