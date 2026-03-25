import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { runForgeBinary, createTempRepo, disposeTempRepo, readJsonFile, readTextFile, writeRepoFile } from "./support/forge-cli.js";
import { runPlanCommand } from "../src/plan/runner.js";
import type { PlanArtifact } from "../src/plan/types.js";

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

async function seedPlanningRepo(repoRoot: string): Promise<void> {
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

function normalizeArtifact(
  artifact: PlanArtifact,
): Omit<PlanArtifact, "startedAt" | "finishedAt"> {
  const {
    startedAt,
    finishedAt,
    ...stableArtifact
  } = artifact;

  void startedAt;
  void finishedAt;

  return stableArtifact;
}

function normalizePlanItemDependency(
  dependency: PlanArtifact["plan_items"][number]["dependencies"][number],
): Omit<typeof dependency, "reason"> {
  const { reason, ...stableDependency } = dependency;

  void reason;

  return stableDependency;
}

function normalizeDependencyGraphEntry(
  dependency: PlanArtifact["dependency_graph"][number],
): Omit<typeof dependency, "reason"> {
  const { reason, ...stableDependency } = dependency;

  void reason;

  return stableDependency;
}

function normalizeConflictZone(zone: PlanArtifact["conflict_zones"][number]): Omit<typeof zone, "reason"> {
  const { reason, ...stableZone } = zone;

  void reason;

  return stableZone;
}

function normalizePlanItem(item: PlanArtifact["plan_items"][number]): Omit<typeof item, "title" | "description"> {
  const { title, description, dependencies, ...stableItem } = item;

  void title;
  void description;

  return {
    ...stableItem,
    dependencies: dependencies.map(normalizePlanItemDependency),
  } as unknown as Omit<typeof item, "title" | "description">;
}

function normalizeStructuralArtifact(
  artifact: PlanArtifact | Omit<PlanArtifact, "startedAt" | "finishedAt">,
): Record<string, unknown> {
  const stableArtifact = normalizeArtifact(artifact as PlanArtifact);
  const {
    planning_assist,
    ...planningDiagnostics
  } = stableArtifact.planning_diagnostics;

  void planning_assist;

  return {
    ...stableArtifact,
    plan_items: stableArtifact.plan_items.map(normalizePlanItem),
    dependency_graph: stableArtifact.dependency_graph.map(normalizeDependencyGraphEntry),
    conflict_zones: stableArtifact.conflict_zones.map(normalizeConflictZone),
    planning_diagnostics: {
      ...planningDiagnostics,
    },
  };
}

await runScenario(
  "forge plan assist can enrich wording without changing deterministic structure",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-assist-");

    try {
      await seedPlanningRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const deterministic = await runPlanCommand({ repo: repoRoot }, repoRoot);
      assert.equal(deterministic.status, "ready");
      assert.ok(deterministic.artifact);

      const assisted = await runPlanCommand(
        { repo: repoRoot },
        repoRoot,
        {
          planningAssistHook: async ({ model }) => ({
            provider: "test-hook",
            planItemEdits: model.planItems.map((item) => ({
              id: item.id,
              title: `${item.title} (assisted)`,
              description: `${item.description} Review the deterministic structure, then tighten the wording.`,
            })),
            dependencyEdits: model.dependencyGraph.map((dependency) => ({
              planItemId: dependency.planItemId,
              dependsOnPlanItemId: dependency.dependsOnPlanItemId,
              reason: `${dependency.reason} Assist tightened this dependency explanation.`,
            })),
            conflictZoneEdits: model.conflictZones.map((zone) => ({
              id: zone.id,
              reason: `${zone.reason} Assist clarified the shared-risk explanation.`,
            })),
            reportNotes: ["Planning assist tightened wording only; deterministic structure stayed authoritative."],
          }),
        },
      );

      assert.equal(assisted.status, "ready");
      assert.ok(assisted.artifact);
      assert.ok(assisted.reportPath);

      const deterministicArtifact = normalizeArtifact(deterministic.artifact as PlanArtifact);
      const assistedArtifact = normalizeArtifact(assisted.artifact as PlanArtifact);

      assert.deepEqual(
        assistedArtifact.plan_items.map((item) => ({
          id: item.id,
          category: item.category,
          likelyAffectedPaths: item.likelyAffectedPaths,
          dependencyIds: item.dependencies.map((dependency) => dependency.planItemId),
          obligationCategories: item.testObligations.map((obligation) => obligation.category),
          parallelizationSignal: item.parallelization.signal,
        })),
        deterministicArtifact.plan_items.map((item) => ({
          id: item.id,
          category: item.category,
          likelyAffectedPaths: item.likelyAffectedPaths,
          dependencyIds: item.dependencies.map((dependency) => dependency.planItemId),
          obligationCategories: item.testObligations.map((obligation) => obligation.category),
          parallelizationSignal: item.parallelization.signal,
        })),
      );
      assert.deepEqual(
        assistedArtifact.dependency_graph.map((dependency) => ({
          planItemId: dependency.planItemId,
          dependsOnPlanItemId: dependency.dependsOnPlanItemId,
          type: dependency.type,
        })),
        deterministicArtifact.dependency_graph.map((dependency) => ({
          planItemId: dependency.planItemId,
          dependsOnPlanItemId: dependency.dependsOnPlanItemId,
          type: dependency.type,
        })),
      );
      assert.deepEqual(
        assistedArtifact.conflict_zones.map((zone) => ({
          id: zone.id,
          paths: zone.paths,
          planItemIds: zone.planItemIds,
          riskLevel: zone.riskLevel,
        })),
        deterministicArtifact.conflict_zones.map((zone) => ({
          id: zone.id,
          paths: zone.paths,
          planItemIds: zone.planItemIds,
          riskLevel: zone.riskLevel,
        })),
      );
      assert.ok(
        assistedArtifact.plan_items.every((item) => item.title.includes("(assisted)")),
      );
      assert.ok(
        assistedArtifact.dependency_graph.every((dependency) =>
          /Assist tightened this dependency explanation\./.test(dependency.reason)),
      );
      assert.ok(
        assistedArtifact.conflict_zones.every((zone) =>
          /Assist clarified the shared-risk explanation\./.test(zone.reason)),
      );
      assert.deepEqual(
        normalizeStructuralArtifact(assistedArtifact),
        normalizeStructuralArtifact(deterministicArtifact),
      );
      assert.deepEqual(
        assistedArtifact.planning_readiness,
        deterministicArtifact.planning_readiness,
      );
      assert.deepEqual(
        assistedArtifact.carry_forward,
        deterministicArtifact.carry_forward,
      );

      const report = await readTextFile(assisted.reportPath as string);
      assert.equal(assistedArtifact.planning_diagnostics.planning_assist.outcome, "applied");
      assert.equal(assistedArtifact.planning_diagnostics.planning_assist.provider, "test-hook");
      assert.deepEqual(assistedArtifact.planning_diagnostics.planning_assist.warnings, []);
      assert.deepEqual(assistedArtifact.planning_diagnostics.planning_assist.ignoredEdits, []);
      assert.match(report, /Planning Assist:\s+applied/);
      assert.match(report, /Planning Assist Provider:\s+test-hook/);
      assert.match(
        report,
        /Planning assist tightened wording only; deterministic structure stayed authoritative\./,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan assist failures fall back to deterministic planning and stay visible in debug output",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-assist-fallback-");
    const originalDebugEnv = process.env.FORGE_PLAN_DEBUG;

    try {
      await seedPlanningRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";

      const result = await runPlanCommand(
        { repo: repoRoot },
        repoRoot,
        {
          planningAssistHook: async () => {
            throw new Error("assist exploded");
          },
        },
      );

      assert.equal(result.status, "ready");
      assert.ok(result.artifactPath);
      assert.ok(result.reportPath);

      const artifact = await readJsonFile<PlanArtifact>(result.artifactPath as string);
      const report = await readTextFile(result.reportPath as string);
      const debugArtifact = await readJsonFile<{
        planning_assist?: {
          outcome: "not_attempted" | "no_suggestion" | "applied" | "ignored_only" | "failed";
          attempted: boolean;
          used: boolean;
          warnings: string[];
        };
      }>(join(repoRoot, ".forge", "debug", "plan-debug.json"));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_diagnostics.planning_assist.outcome, "failed");
      assert.match(report, /Planning Assist:\s+failed/);
      assert.ok(debugArtifact.planning_assist?.attempted);
      assert.equal(debugArtifact.planning_assist?.used, false);
      assert.equal(debugArtifact.planning_assist?.outcome, "failed");
      assert.ok(
        debugArtifact.planning_assist?.warnings.some((warning) => /assist exploded/i.test(warning)),
      );
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

await runScenario(
  "forge plan assist classifies null suggestions and ignored-only edits without changing deterministic structure",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-assist-outcomes-");

    try {
      await seedPlanningRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const noSuggestion = await runPlanCommand(
        { repo: repoRoot },
        repoRoot,
        {
          planningAssistHook: async () => null,
        },
      );

      assert.equal(noSuggestion.status, "ready");
      assert.ok(noSuggestion.artifact);
      assert.equal(noSuggestion.artifact?.planning_diagnostics.planning_assist.outcome, "no_suggestion");
      assert.equal(noSuggestion.artifact?.planning_diagnostics.planning_assist.used, false);

      const ignoredOnly = await runPlanCommand(
        { repo: repoRoot },
        repoRoot,
        {
          planningAssistHook: async () => ({
            provider: "test-hook",
            planItemEdits: [{ id: "missing-item", title: "ignored" }],
            dependencyEdits: [{ planItemId: "", dependsOnPlanItemId: "", reason: "" }] as unknown as never[],
            conflictZoneEdits: [{ id: "missing-zone", reason: "ignored" }],
          }),
        },
      );

      assert.equal(ignoredOnly.status, "ready");
      assert.ok(ignoredOnly.artifact);
      assert.equal(ignoredOnly.artifact?.planning_diagnostics.planning_assist.outcome, "ignored_only");
      assert.equal(ignoredOnly.artifact?.planning_diagnostics.planning_assist.provider, "test-hook");
      assert.equal(ignoredOnly.artifact?.planning_diagnostics.planning_assist.used, false);
      assert.ok(
        (ignoredOnly.artifact?.planning_diagnostics.planning_assist.ignoredEdits.length ?? 0) > 0,
      );

      const ignoredReport = await readTextFile(ignoredOnly.reportPath as string);
      assert.match(ignoredReport, /Planning Assist:\s+ignored_only/);
      assert.match(ignoredReport, /Ignored plan item edit for unknown id `missing-item`\./);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
