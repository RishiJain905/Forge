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

async function removeSpecInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "src", "cli.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

type CarryForwardConcern = {
  id: string;
  source: "ambiguity" | "warning" | "low_confidence" | "candidate_target_uncertainty" | "readiness_blocker";
  code: string | null;
  message: string;
  planItemIds: string[];
  effects: Array<
    "risk_level" |
    "dependency_caution" |
    "parallelization_caution" |
    "test_strategy" |
    "planning_readiness"
  >;
  status: "carried_forward";
};

type PlanArtifact = {
  status: "ready" | "blocked" | "failed";
  plan_items: Array<{
    id: string;
    category: string;
    likelyAffectedPaths: string[];
    testObligations: Array<{ category: string; reason: string }>;
    parallelization: { signal: string; reason: string };
  }>;
  test_obligations: Array<{ planItemId: string; category: string; reason: string }>;
  parallelization_signals: Array<{ planItemId: string; signal: string; reason: string }>;
  carry_forward: {
    ambiguities: string[];
    warnings: string[];
    concerns: CarryForwardConcern[];
  };
  planning_readiness: {
    ready: boolean;
    blocking_issues: Array<{ code: string; message: string }>;
  };
};

await runScenario(
  "forge plan aggregates top-level obligations and parallelization signals and assigns smoke to entrypoint work",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part4-aggregation-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part4-aggregation",
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
          "# Update entrypoint behavior",
          "",
          "Revise `src/app.ts`, keep `tests/app.test.ts` aligned, and preserve the CLI entrypoint contract in `src/cli.ts`.",
          "",
          "## Acceptance Criteria",
          "",
          "- `src/app.ts` is updated",
          "- `tests/app.test.ts` stays aligned",
          "- `src/cli.ts` keeps the public runtime behavior stable",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const interfaceOrImplementationItem = artifact.plan_items.find((item) =>
        item.likelyAffectedPaths.includes("src/cli.ts") || item.likelyAffectedPaths.includes("src/app.ts"),
      );

      assert.ok(interfaceOrImplementationItem, "expected an entrypoint-related plan item");
      assert.ok(artifact.test_obligations.length > 0, "expected top-level aggregated test obligations");
      assert.ok(artifact.parallelization_signals.length > 0, "expected top-level aggregated parallelization signals");
      assert.ok(
        artifact.test_obligations.every((entry) =>
          artifact.plan_items.some((item) => item.id === entry.planItemId),
        ),
        "expected every top-level test obligation to reference a real plan item",
      );
      assert.ok(
        artifact.parallelization_signals.every((entry) =>
          artifact.plan_items.some((item) => item.id === entry.planItemId),
        ),
        "expected every top-level parallelization signal to reference a real plan item",
      );
      assert.ok(
        interfaceOrImplementationItem.testObligations.some((obligation) => obligation.category === "smoke"),
        "expected entrypoint-facing work to carry a smoke obligation",
      );
      assert.ok(
        artifact.test_obligations.some((entry) => entry.category === "smoke"),
        "expected smoke to remain visible in the top-level artifact",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan does not assign smoke obligations to config-only package.json work",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part4-config-only-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part4-config-only",
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
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(
        configItem.testObligations.some((obligation) => obligation.category === "contract_validation"),
        "expected config work to keep contract validation visible",
      );
      assert.ok(
        !configItem.testObligations.some((obligation) => obligation.category === "smoke"),
        "expected config-only work to avoid an automatic smoke obligation",
      );
      assert.ok(
        !artifact.test_obligations.some((entry) => entry.category === "smoke"),
        "expected smoke to stay absent from the aggregated artifact for config-only work",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan does not add smoke obligations to config-only manifest work just because the files are shared-risk",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part4-config-only-");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part4-config-only",
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
          "# Update package metadata",
          "",
          "Adjust `package.json` scripts and metadata without touching runtime source files.",
          "",
          "## Acceptance Criteria",
          "",
          "- `package.json` is updated",
        ].join("\n"),
      );

      await rm(join(repoRoot, "src", "app.ts"), { force: true });
      await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(
        !configItem.testObligations.some((obligation) => obligation.category === "smoke"),
        "expected config-only manifest work to avoid smoke obligations",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan preserves low-confidence and readiness blockers as explicit carried-forward concerns",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part4-concerns-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const concernPlanItemIds = new Set(artifact.carry_forward.concerns.flatMap((concern) => concern.planItemIds));

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.ok(artifact.plan_items.length > 0, "expected diagnostic plan items to remain present");
      assert.ok(artifact.carry_forward.ambiguities.length > 0, "expected raw ambiguities to remain visible");
      assert.ok(artifact.carry_forward.warnings.length > 0, "expected raw warnings to remain visible");
      assert.ok(artifact.carry_forward.concerns.length > 0, "expected derived carry-forward concerns");
      assert.ok(
        artifact.carry_forward.concerns.some((concern) => concern.source === "low_confidence"),
        "expected a low-confidence concern entry",
      );
      assert.ok(
        artifact.carry_forward.concerns.some((concern) =>
          concern.source === "readiness_blocker" &&
          concern.effects.includes("planning_readiness"),
        ),
        "expected a readiness-blocker concern with planning-readiness impact",
      );
      assert.ok(
        artifact.carry_forward.concerns.every((concern) => concern.status === "carried_forward"),
        "expected concerns to remain explicitly unresolved in the plan output",
      );
      assert.ok(
        artifact.plan_items.every((item) => concernPlanItemIds.has(item.id)),
        "expected every blocked-run plan item to retain mapped carried-forward concerns",
      );
      assert.ok(
        artifact.plan_items.some((item) => item.parallelization.signal === "serial_only"),
        "expected blocked work to surface at least one serial_only signal",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan does not assign smoke obligations to config-only planning work without a real entrypoint",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part4-config-only-");

    try {
      await rm(join(repoRoot, "src"), { force: true, recursive: true });
      await rm(join(repoRoot, "tests"), { force: true, recursive: true });
      await writeRepoFile(
        repoRoot,
        "package.json",
        JSON.stringify(
          {
            name: "forge-plan-part4-config-only",
            private: true,
            type: "module",
            scripts: {
              build: "tsc -p tsconfig.build.json",
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
          "# Adjust build scripts",
          "",
          "Update `package.json` so the build script matches the new release process.",
          "",
          "## Acceptance Criteria",
          "",
          "- `package.json` is updated",
        ].join("\n"),
      );

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await rm(join(repoRoot, "task.md"), { force: true });

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
      const configItem = artifact.plan_items.find((item) => item.category === "config");

      assert.ok(configItem, "expected a config plan item");
      assert.ok(
        !configItem.testObligations.some((obligation) => obligation.category === "smoke"),
        "config-only work should not require smoke validation without a real entrypoint",
      );
      assert.ok(
        !artifact.test_obligations.some((entry) => entry.category === "smoke"),
        "top-level test obligations should not invent smoke validation for config-only work",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
