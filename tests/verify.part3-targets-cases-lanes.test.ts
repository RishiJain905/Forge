import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  verification_targets: Array<{
    id: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    candidateLanes: string[];
    sourceRiskSources: string[];
    verificationCaseIds: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    status: string;
  }>;
  structural_verification: {
    status: string;
    summary: string;
  };
  formal_verification: {
    status: string;
    summary: string;
  };
};

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

async function prepareBasePlan(repoRoot: string): Promise<PlanArtifact> {
  await seedSpecRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

async function writePlanArtifact(repoRoot: string, artifact: PlanArtifact): Promise<void> {
  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(artifact, null, 2)}\n`);
}

await runScenario(
  "forge verify builds explicit dual-lane targets and lane-specific cases from merged Step 2 risk signals",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-dual-lane-");

    try {
      const planArtifact = await prepareBasePlan(repoRoot);

      await writePlanArtifact(repoRoot, {
        ...planArtifact,
        plan_items: [
          {
            id: "plan-item-config",
            title: "Update package migration order",
            description: "Keep package.json migration sequencing safe.",
            category: "config",
            sourceRequirements: ["Migrate package.json safely before runtime changes land."],
            likelyAffectedPaths: ["package.json"],
            dependencies: [],
            riskLevel: "high",
            testObligations: [
              {
                category: "migration_validation",
                reason: "Migration order needs explicit validation.",
              },
            ],
            verificationRelevance: {
              relevant: true,
              categories: ["migration_order"],
              notes: ["Migration order is explicit in the Step 2 handoff."],
            },
            parallelization: {
              signal: "protected_merge_order",
              reason: "Shared config work must preserve merge order.",
            },
          },
          {
            id: "plan-item-interface",
            title: "Keep runtime entrypoint aligned",
            description: "Preserve runtime entrypoint contract during migration.",
            category: "interface",
            sourceRequirements: ["Keep src/app.ts aligned with package migration order."],
            likelyAffectedPaths: ["src/app.ts"],
            dependencies: [
              {
                planItemId: "plan-item-config",
                type: "interface_first",
                reason: "Runtime entrypoint depends on config-first migration ordering.",
              },
            ],
            riskLevel: "high",
            testObligations: [
              {
                category: "integration",
                reason: "Runtime contract changes need integration coverage.",
              },
            ],
            verificationRelevance: {
              relevant: true,
              categories: ["migration_order", "parallel_overlap"],
              notes: ["Shared runtime work is order-sensitive and parallel-risky."],
            },
            parallelization: {
              signal: "risky_shared",
              reason: "Shared runtime surface cannot be parallelized casually.",
            },
          },
        ],
        dependency_graph: [
          {
            planItemId: "plan-item-interface",
            dependsOnPlanItemId: "plan-item-config",
            type: "interface_first",
            reason: "Runtime entrypoint depends on config-first migration ordering.",
          },
        ],
        conflict_zones: [
          {
            id: "conflict-zone-1",
            title: "Shared runtime migration surface",
            reason: "package.json and src/app.ts must move in coordinated order.",
            paths: ["package.json", "src/app.ts"],
            planItemIds: ["plan-item-config", "plan-item-interface"],
            riskLevel: "high",
          },
        ],
        test_obligations: [
          {
            planItemId: "plan-item-config",
            category: "migration_validation",
            reason: "Migration order needs explicit validation.",
          },
          {
            planItemId: "plan-item-interface",
            category: "integration",
            reason: "Runtime contract changes need integration coverage.",
          },
        ],
        parallelization_signals: [
          {
            planItemId: "plan-item-config",
            signal: "protected_merge_order",
            reason: "Shared config work must preserve merge order.",
          },
          {
            planItemId: "plan-item-interface",
            signal: "risky_shared",
            reason: "Shared runtime surface cannot be parallelized casually.",
          },
        ],
        carry_forward: {
          ...planArtifact.carry_forward,
          initial_verification_targets: [
            {
              path: "package.json",
              kind: "manifest",
              category: "migration_order",
              reason: "Migration order needs explicit verification.",
            },
          ],
          concerns: [
            {
              id: "concern-1",
              source: "warning",
              code: "MERGE_ORDER_CAUTION",
              message: "Merge order remains risky across config and runtime surfaces.",
              planItemIds: ["plan-item-config", "plan-item-interface"],
              effects: ["dependency_caution", "parallelization_caution"],
              status: "carried_forward",
            },
          ],
        },
        planning_diagnostics: {
          ...planArtifact.planning_diagnostics,
          usability_status: "actionable",
          warning_items: [],
          blocking_items: [],
          partial_output: null,
        },
        planning_readiness: {
          ...planArtifact.planning_readiness,
          ready: true,
          status: "ready_with_warnings",
          summary: "`forge verify` can proceed with caution.",
          warning_items: [],
          blocking_issues: [],
          partial_output: null,
          constraining_concern_ids: ["concern-1"],
          recommended_user_actions: [],
        },
        failure: null,
      });

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);

      const migrationTarget = artifact.verification_targets.find((target) => target.category === "migration_order");
      assert.ok(migrationTarget, "expected a migration_order target");
      assert.deepEqual(
        migrationTarget.sourcePlanItemIds.sort(),
        ["plan-item-config", "plan-item-interface"].sort(),
      );
      assert.deepEqual(
        migrationTarget.candidateLanes.sort(),
        ["formal", "structural"].sort(),
      );
      assert.deepEqual(
        migrationTarget.sourceRiskSources.sort(),
        [
          "carry_forward_concern",
          "conflict_zone",
          "initial_verification_target",
          "parallelization_signal",
          "plan_item_verification_relevance",
          "test_obligation",
        ].sort(),
      );
      assert.equal(migrationTarget.verificationCaseIds.length, 3);

      const targetCases = artifact.verification_cases.filter((item) => item.verificationTargetId === migrationTarget.id);
      assert.equal(targetCases.length, 3);
      assert.equal(targetCases.filter((item) => item.lanes.includes("structural")).length, 1);
      assert.equal(targetCases.filter((item) => item.lanes.includes("formal")).length, 2);
      assert.ok(targetCases.some((item) => item.lanes.length === 1 && item.lanes[0] === "structural" && item.status === "passed"));
      assert.ok(targetCases.filter((item) => item.lanes.includes("formal")).every((item) => item.status === "not_run"));
      assert.ok(
        targetCases.every((item) =>
          item.sourcePlanItemIds.includes("plan-item-config") &&
          item.sourcePlanItemIds.includes("plan-item-interface"),
        ),
      );
      const codeSurfaceTarget = artifact.verification_targets.find((target) => target.category === "code_surface");
      assert.ok(codeSurfaceTarget, "expected an obligation-driven code_surface target");
      assert.deepEqual(
        codeSurfaceTarget.sourcePlanItemIds.sort(),
        ["plan-item-config", "plan-item-interface"].sort(),
      );
      assert.equal(artifact.structural_verification.status, "passed");
      assert.match(artifact.structural_verification.summary, /case/i);
      assert.match(artifact.formal_verification.summary, /case/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps pure config-surface verification structural-only",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-structural-only-");

    try {
      const planArtifact = await prepareBasePlan(repoRoot);

      await writePlanArtifact(repoRoot, {
        ...planArtifact,
        plan_items: [
          {
            id: "plan-item-config",
            title: "Update package config",
            description: "Adjust package config without state-machine risk.",
            category: "config",
            sourceRequirements: ["Adjust package.json only."],
            likelyAffectedPaths: ["package.json"],
            dependencies: [],
            riskLevel: "medium",
            testObligations: [
              {
                category: "contract_validation",
                reason: "Config changes should keep contract validation visible.",
              },
            ],
            verificationRelevance: {
              relevant: true,
              categories: ["config_surface"],
              notes: ["Config-only verification should stay structural."],
            },
            parallelization: {
              signal: "protected_merge_order",
              reason: "Config stays protected in merge order.",
            },
          },
        ],
        dependency_graph: [],
        conflict_zones: [],
        test_obligations: [
          {
            planItemId: "plan-item-config",
            category: "contract_validation",
            reason: "Config changes should keep contract validation visible.",
          },
        ],
        parallelization_signals: [
          {
            planItemId: "plan-item-config",
            signal: "protected_merge_order",
            reason: "Config stays protected in merge order.",
          },
        ],
        carry_forward: {
          ...planArtifact.carry_forward,
          initial_verification_targets: [],
          concerns: [],
        },
        planning_diagnostics: {
          ...planArtifact.planning_diagnostics,
          usability_status: "actionable",
          warning_items: [],
          blocking_items: [],
          partial_output: null,
        },
        planning_readiness: {
          ...planArtifact.planning_readiness,
          ready: true,
          status: "ready",
          summary: "`forge verify` can proceed.",
          warning_items: [],
          blocking_issues: [],
          partial_output: null,
          constraining_concern_ids: [],
          recommended_user_actions: [],
        },
        failure: null,
      });

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(artifact.verification_targets.length, 1);
      assert.deepEqual(artifact.verification_targets[0]?.candidateLanes, ["structural"]);
      assert.equal(artifact.verification_cases.length, 1);
      assert.deepEqual(artifact.verification_cases[0]?.lanes, ["structural"]);
      assert.equal(artifact.verification_cases[0]?.status, "passed");
      assert.equal(artifact.structural_verification.status, "passed");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify derives a formal-only target from Step 2 obligation metadata when no other risky signal is present",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-obligation-driven-");

    try {
      const planArtifact = await prepareBasePlan(repoRoot);

      await writePlanArtifact(repoRoot, {
        ...planArtifact,
        plan_items: [
          {
            id: "plan-item-worker",
            title: "Update worker claim path",
            description: "Adjust the worker claim flow without adding structural conflicts.",
            category: "implementation",
            sourceRequirements: ["Keep worker ownership transitions valid during claim changes."],
            likelyAffectedPaths: ["src/worker.ts"],
            dependencies: [],
            riskLevel: "medium",
            testObligations: [
              {
                category: "contract_validation",
                reason: "Ownership transfer must remain valid when the worker claim path changes.",
              },
            ],
            verificationRelevance: {
              relevant: false,
              categories: [],
              notes: ["No explicit Step 2 verification relevance was persisted for this item."],
            },
            parallelization: {
              signal: "safe_parallel",
              reason: "No shared-surface structural hazard was identified.",
            },
          },
        ],
        dependency_graph: [],
        conflict_zones: [],
        test_obligations: [
          {
            planItemId: "plan-item-worker",
            category: "contract_validation",
            reason: "Ownership transfer must remain valid when the worker claim path changes.",
          },
        ],
        parallelization_signals: [
          {
            planItemId: "plan-item-worker",
            signal: "safe_parallel",
            reason: "No shared-surface structural hazard was identified.",
          },
        ],
        carry_forward: {
          ...planArtifact.carry_forward,
          initial_verification_targets: [],
          concerns: [],
        },
        planning_diagnostics: {
          ...planArtifact.planning_diagnostics,
          usability_status: "actionable",
          warning_items: [],
          blocking_items: [],
          partial_output: null,
        },
        planning_readiness: {
          ...planArtifact.planning_readiness,
          ready: true,
          status: "ready",
          summary: "`forge verify` can proceed.",
          warning_items: [],
          blocking_issues: [],
          partial_output: null,
          constraining_concern_ids: [],
          recommended_user_actions: [],
        },
        failure: null,
      });

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.verification_targets.length, 1);
      assert.equal(artifact.verification_cases.length, 2);
      assert.equal(artifact.verification_targets[0]?.category, "ownership");
      assert.deepEqual(artifact.verification_targets[0]?.candidateLanes, ["formal"]);
      assert.deepEqual(artifact.verification_targets[0]?.sourceRiskSources, ["test_obligation"]);
      assert.deepEqual(artifact.verification_cases[0]?.lanes, ["formal"]);
      assert.equal(artifact.verification_cases[0]?.verificationTargetId, artifact.verification_targets[0]?.id);
      assert.match(artifact.formal_verification.summary, /2 formal verification case/i);
      assert.match(artifact.structural_verification.summary, /No structural verification cases/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
