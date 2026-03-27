import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import { VERIFY_INPUT_TOO_WEAK } from "../src/verify/constants.js";
import { buildVerifyVerificationModel } from "../src/verify/model.js";
import { buildVerifyStructuralExecution } from "../src/verify/structural.js";
import { runVerifyFoundation } from "../src/verify/runner.js";
import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type MutablePlanArtifact = Record<string, any>;

type VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  verification_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  verification_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  verification_targets: Array<{
    id: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    candidateLanes: string[];
    sourceRiskSources: string[];
    verificationCaseIds: string[];
    traceabilityNotes: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    status: string;
    summary: string;
    mitigations: string[];
    constraints: string[];
    traceabilityNotes: string[];
  }>;
  structural_verification: {
    status: string;
    summary: string;
    findings: string[];
    constraints: string[];
  };
  formal_verification: {
    status: string;
    summary: string;
  };
  findings: string[];
  constraints: string[];
  failure: { code: string; message: string; fallbackReason?: string } | null;
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
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
}

function cloneArtifact<T>(artifact: T): T {
  return JSON.parse(JSON.stringify(artifact)) as T;
}

async function prepareBasePlanArtifact(repoRoot: string): Promise<PlanArtifact> {
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

async function writePlanArtifact(repoRoot: string, artifact: MutablePlanArtifact): Promise<void> {
  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(artifact, null, 2)}\n`);
}

function makeReadyPlanArtifact(planArtifact: PlanArtifact): MutablePlanArtifact {
  const artifact = cloneArtifact(planArtifact) as MutablePlanArtifact;

  artifact.planning_diagnostics = {
    ...artifact.planning_diagnostics,
    usability_status: "actionable",
    warning_items: [],
    blocking_items: [],
    partial_output: null,
  };
  artifact.planning_readiness = {
    ...artifact.planning_readiness,
    ready: true,
    status: "ready",
    summary: "`forge verify` can proceed.",
    warning_items: [],
    blocking_issues: [],
    partial_output: null,
    constraining_concern_ids: [],
    recommended_user_actions: [],
  };
  artifact.failure = null;

  return artifact;
}

function makeMissingSequencingArtifact(planArtifact: PlanArtifact): MutablePlanArtifact {
  const artifact = makeReadyPlanArtifact(planArtifact);
  const planItem = {
    id: "plan-item-migration",
    title: "Keep migration ordering stable",
    description: "Change migration behavior without preserving explicit sequencing safeguards.",
    category: "config",
    sourceRequirements: ["Keep migration sequencing stable."],
    likelyAffectedPaths: ["package.json"],
    dependencies: [],
    riskLevel: "high",
    testObligations: [
      {
        category: "migration_validation",
        reason: "Migration order still needs validation.",
      },
    ],
    verificationRelevance: {
      relevant: true,
      categories: ["migration_order"],
      notes: ["Migration order is explicitly risky in the Step 2 handoff."],
    },
    parallelization: {
      signal: "safe_parallel",
      reason: "No explicit sequencing safeguard survives in the plan.",
    },
  };

  artifact.plan_items = [planItem];
  artifact.dependency_graph = [];
  artifact.conflict_zones = [];
  artifact.test_obligations = [
    {
      planItemId: planItem.id,
      category: "migration_validation",
      reason: "Migration order still needs validation.",
    },
  ];
  artifact.parallelization_signals = [
    {
      planItemId: planItem.id,
      signal: "safe_parallel",
      reason: "No explicit sequencing safeguard survives in the plan.",
    },
  ];
  artifact.carry_forward = {
    ...artifact.carry_forward,
    initial_verification_targets: [],
    concerns: [],
  };

  return artifact;
}

function makeSharedRiskContradictionArtifact(planArtifact: PlanArtifact): MutablePlanArtifact {
  const artifact = makeReadyPlanArtifact(planArtifact);
  const planItem = {
    id: "plan-item-parallel",
    title: "Coordinate shared work safely",
    description: "Shared runtime work is risky and should not be treated as safe parallel work.",
    category: "implementation",
    sourceRequirements: ["Keep the shared runtime surface coordinated."],
    likelyAffectedPaths: ["src/runtime.ts"],
    dependencies: [],
    riskLevel: "high",
    testObligations: [
      {
        category: "integration",
        reason: "Shared runtime work needs integration coverage.",
      },
    ],
    verificationRelevance: {
      relevant: true,
      categories: ["parallel_overlap"],
      notes: ["The shared runtime work is order-sensitive and parallel-risky."],
    },
    parallelization: {
      signal: "safe_parallel",
      reason: "This is intentionally contradictory for the regression test.",
    },
  };

  artifact.plan_items = [planItem];
  artifact.dependency_graph = [];
  artifact.conflict_zones = [
    {
      id: "conflict-zone-parallel",
      title: "Shared runtime overlap",
      reason: "The same runtime surface is touched by multiple workstreams.",
      paths: ["src/runtime.ts", "tests/runtime.test.ts"],
      planItemIds: [planItem.id],
      riskLevel: "high",
    },
  ];
  artifact.test_obligations = [
    {
      planItemId: planItem.id,
      category: "integration",
      reason: "Shared runtime work needs integration coverage.",
    },
  ];
  artifact.parallelization_signals = [
    {
      planItemId: planItem.id,
      signal: "safe_parallel",
      reason: "This is intentionally contradictory for the regression test.",
    },
  ];
  artifact.carry_forward = {
    ...artifact.carry_forward,
    initial_verification_targets: [],
    concerns: [],
  };

  return artifact;
}

function makeConfigInterfaceArtifact(planArtifact: PlanArtifact): MutablePlanArtifact {
  const artifact = makeReadyPlanArtifact(planArtifact);
  const configItem = {
    id: "plan-item-config",
    title: "Adjust package config",
    description: "Change package configuration without preserving merge protection.",
    category: "config",
    sourceRequirements: ["Keep package configuration aligned."],
    likelyAffectedPaths: ["package.json"],
    dependencies: [],
    riskLevel: "high",
    testObligations: [
      {
        category: "contract_validation",
        reason: "Config changes should keep contract validation visible.",
      },
    ],
    verificationRelevance: {
      relevant: true,
      categories: ["config_surface"],
      notes: ["Configuration surface needs merge or serialization protection."],
    },
    parallelization: {
      signal: "safe_parallel",
      reason: "This intentionally omits merge protection.",
    },
  };
  const interfaceItem = {
    id: "plan-item-interface",
    title: "Adjust runtime interface",
    description: "Change the runtime interface without preserving serialization protection.",
    category: "interface",
    sourceRequirements: ["Keep the runtime interface aligned."],
    likelyAffectedPaths: ["src/app.ts"],
    dependencies: [],
    riskLevel: "high",
    testObligations: [
      {
        category: "contract_validation",
        reason: "Interface changes should keep contract validation visible.",
      },
    ],
    verificationRelevance: {
      relevant: true,
      categories: ["api_contract"],
      notes: ["Interface surface needs merge or serialization protection."],
    },
    parallelization: {
      signal: "safe_parallel",
      reason: "This intentionally omits serialization protection.",
    },
  };

  artifact.plan_items = [configItem, interfaceItem];
  artifact.dependency_graph = [];
  artifact.conflict_zones = [];
  artifact.test_obligations = [
    {
      planItemId: configItem.id,
      category: "contract_validation",
      reason: "Config changes should keep contract validation visible.",
    },
    {
      planItemId: interfaceItem.id,
      category: "contract_validation",
      reason: "Interface changes should keep contract validation visible.",
    },
  ];
  artifact.parallelization_signals = [
    {
      planItemId: configItem.id,
      signal: "safe_parallel",
      reason: "This intentionally omits merge protection.",
    },
    {
      planItemId: interfaceItem.id,
      signal: "safe_parallel",
      reason: "This intentionally omits serialization protection.",
    },
  ];
  artifact.carry_forward = {
    ...artifact.carry_forward,
    initial_verification_targets: [],
    concerns: [],
  };

  return artifact;
}

function makeBroadConflictZoneArtifact(planArtifact: PlanArtifact): MutablePlanArtifact {
  const artifact = makeReadyPlanArtifact(planArtifact);
  const planItemIds = artifact.plan_items.slice(0, 2).map((item: { id: string }) => item.id);

  artifact.conflict_zones = [
    {
      id: "conflict-zone-broad",
      title: "Broad shared surface",
      reason: "Several steps still overlap on the runtime surface.",
      paths: ["src/unmatched-broad-zone.ts", "tests/unmatched-broad-zone.test.ts"],
      planItemIds,
      riskLevel: "high",
    },
  ];
  artifact.carry_forward = {
    ...artifact.carry_forward,
    initial_verification_targets: [
      {
        path: "src/unmatched-broad-zone.ts",
        kind: "source",
        category: "code_surface",
        reason: "Keep the broad shared surface visible in verify output.",
      },
    ],
    concerns: [],
  };

  return artifact;
}

await runScenario(
  "forge verify downgrades a ready handoff with only broad conflict-zone evidence to non_actionable",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-weak-conflict-zone-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeReadyPlanArtifact(planArtifact);
      artifact.plan_items = [];
      artifact.dependency_graph = [];
      artifact.conflict_zones = [
        {
          id: "conflict-zone-weak",
          title: "Broad shared surface",
          reason: "The plan still points at a broad shared surface but does not preserve enough execution detail.",
          paths: ["src/unmatched-broad-zone.ts", "tests/unmatched-broad-zone.test.ts"],
          planItemIds: [],
          riskLevel: "high",
        },
      ];
      artifact.test_obligations = [];
      artifact.parallelization_signals = [];
      artifact.carry_forward = {
        ...artifact.carry_forward,
        initial_verification_targets: [],
        concerns: [],
      };
      artifact.status = "failed";
      artifact.summary = "Forge plan persisted partial output after encountering a fallback write failure.";
      artifact.failure = {
        code: "PLAN_PARTIAL_OUTPUT",
        message: "Forge plan persisted partial output after encountering a fallback write failure.",
      };
      artifact.planning_diagnostics = {
        ...artifact.planning_diagnostics,
        partial_output: artifact.failure,
      };
      artifact.planning_readiness = {
        ...artifact.planning_readiness,
        status: "ready_with_warnings",
        partial_output: artifact.failure,
      };
      await writePlanArtifact(repoRoot, artifact);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Status:\s+blocked/);
      assertForgeVerifyOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(verifyArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(verifyReportPath(repoRoot)), true);

      const verifyArtifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(verifyArtifact.status, "blocked");
      assert.equal(verifyArtifact.verification_diagnostics.usability_status, "non_actionable");
      assert.ok(
        verifyArtifact.verification_diagnostics.blocking_items.some(
          (item) => item.code === VERIFY_INPUT_TOO_WEAK,
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps broad conflict-zone input usable and deterministic without re-planning",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-broad-conflict-zone-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeBroadConflictZoneArtifact(planArtifact);
      await writePlanArtifact(repoRoot, artifact);

      const firstFoundation = await runVerifyFoundation({ repo: repoRoot }, repoRoot);
      const secondFoundation = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(firstFoundation.status, "ready");
      assert.equal(secondFoundation.status, "ready");
      assert.ok(firstFoundation.foundation);
      assert.ok(secondFoundation.foundation);
      assert.deepEqual(secondFoundation.foundation, firstFoundation.foundation);

      const firstModel = buildVerifyVerificationModel(firstFoundation.foundation!);
      const secondModel = buildVerifyVerificationModel(secondFoundation.foundation!);

      assert.deepEqual(secondModel, firstModel);
      assert.ok(firstModel.targets.length > 0, "expected broad conflict-zone input to produce verification targets");
      assert.ok(
        firstModel.targets.some((target) =>
          target.sourceRiskSources.includes("initial_verification_target"),
        ),
        "expected the broad initial verification target to survive model construction",
      );
      assert.ok(
        firstModel.targets.some((target) =>
          target.traceabilityNotes.some((note) => note.includes("src/unmatched-broad-zone.ts")),
        ),
        "expected traceability for the broad conflict-zone path to remain visible",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify fails structural sequencing checks when the plan only claims safe parallelism",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-missing-sequencing-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeMissingSequencingArtifact(planArtifact);
      await writePlanArtifact(repoRoot, artifact);

      const foundation = await runVerifyFoundation({ repo: repoRoot }, repoRoot);
      assert.equal(foundation.status, "ready");
      assert.ok(foundation.foundation);

      const model = buildVerifyVerificationModel(foundation.foundation!);
      const migrationTarget = model.targets.find((target) => target.category === "migration_order");
      assert.ok(migrationTarget, "expected a migration_order verification target");

      const execution = buildVerifyStructuralExecution({
        foundation: foundation.foundation!,
        model,
      });

      const structuralCase = execution.cases.find(
        (verificationCase) =>
          verificationCase.verificationTargetId === migrationTarget?.id &&
          verificationCase.lanes.includes("structural"),
      );

      assert.ok(structuralCase, "expected a structural verification case");
      assert.equal(structuralCase?.status, "failed");
      assert.equal(execution.structuralVerification.status, "failed");
      assert.match(execution.structuralVerification.summary, /missing|unresolved|failed/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify fails structural overlap checks when shared-risk evidence is contradicted by safe_parallel",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-parallel-contradiction-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeSharedRiskContradictionArtifact(planArtifact);
      await writePlanArtifact(repoRoot, artifact);

      const foundation = await runVerifyFoundation({ repo: repoRoot }, repoRoot);
      assert.equal(foundation.status, "ready");
      assert.ok(foundation.foundation);

      const model = buildVerifyVerificationModel(foundation.foundation!);
      const target = model.targets.find((entry) => entry.category === "parallel_overlap");
      assert.ok(target, "expected a parallel_overlap verification target");

      const execution = buildVerifyStructuralExecution({
        foundation: foundation.foundation!,
        model,
      });

      const structuralCase = execution.cases.find(
        (verificationCase) =>
          verificationCase.verificationTargetId === target?.id &&
          verificationCase.lanes.includes("structural"),
      );

      assert.ok(structuralCase, "expected a structural verification case");
      assert.equal(structuralCase?.status, "failed");
      assert.equal(execution.structuralVerification.status, "failed");
      assert.match(execution.structuralVerification.summary, /failed/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify fails config and interface surface checks when merge and serialization protection are missing",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-surface-protection-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeConfigInterfaceArtifact(planArtifact);
      await writePlanArtifact(repoRoot, artifact);

      const foundation = await runVerifyFoundation({ repo: repoRoot }, repoRoot);
      assert.equal(foundation.status, "ready");
      assert.ok(foundation.foundation);

      const model = buildVerifyVerificationModel(foundation.foundation!);
      const configTarget = model.targets.find((entry) => entry.category === "config_surface");
      const interfaceTarget = model.targets.find((entry) => entry.category === "api_contract");

      assert.ok(configTarget, "expected a config_surface verification target");
      assert.ok(interfaceTarget, "expected an api_contract verification target");

      const execution = buildVerifyStructuralExecution({
        foundation: foundation.foundation!,
        model,
      });

      const configCase = execution.cases.find(
        (verificationCase) =>
          verificationCase.verificationTargetId === configTarget?.id &&
          verificationCase.lanes.includes("structural"),
      );
      const interfaceCase = execution.cases.find(
        (verificationCase) =>
          verificationCase.verificationTargetId === interfaceTarget?.id &&
          verificationCase.lanes.includes("structural"),
      );

      assert.ok(configCase, "expected a structural verification case for the config surface");
      assert.ok(interfaceCase, "expected a structural verification case for the interface surface");
      assert.equal(configCase?.status, "failed");
      assert.equal(interfaceCase?.status, "failed");
      assert.equal(execution.structuralVerification.status, "failed");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify writes blocked outputs when structural verification fails",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part2-cli-blocked-");

    try {
      const planArtifact = await prepareBasePlanArtifact(repoRoot);
      const artifact = makeMissingSequencingArtifact(planArtifact);
      await writePlanArtifact(repoRoot, artifact);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Status:\s+blocked/);
      assertForgeVerifyOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(verifyArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(verifyReportPath(repoRoot)), true);

      const verifyArtifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const verifyReport = await readTextFile(verifyReportPath(repoRoot));

      assert.equal(verifyArtifact.status, "blocked");
      assert.equal(verifyArtifact.verification_readiness.ready, false);
      assert.equal(verifyArtifact.structural_verification.status, "failed");
      assert.match(verifyArtifact.structural_verification.summary, /failed/i);
      assert.ok(verifyArtifact.verification_diagnostics.blocking_items.length > 0);
      assert.match(verifyReport, /blocked/i);
      assert.match(verifyReport, /Structural Verification/i);
      assert.match(verifyReport, /failed/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
