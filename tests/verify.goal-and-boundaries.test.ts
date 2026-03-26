import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { STEP3_BOUNDARY_POLICY } from "../src/verify/constants.js";
import { buildVerifyFoundation, runVerifyFoundation } from "../src/verify/runner.js";
import type { PlanArtifact } from "../src/plan/types.js";
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

function planArtifactPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "plan.json");
}

await runScenario(
  "verify foundation consumes the persisted Step 2 artifact for a verify-ready run without re-planning",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const planArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      await removePlanningInputs(repoRoot);

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);

      const foundation = result.foundation;
      assert.equal(foundation.sourcePlan.artifactPath, planArtifactPath(repoRoot));
      assert.equal(foundation.sourcePlan.status, planArtifact.status);
      assert.equal(foundation.sourcePlan.readyForVerification, true);
      assert.equal(
        foundation.sourcePlan.planningReadinessStatus,
        planArtifact.planning_readiness.status,
      );
      assert.deepEqual(
        foundation.verificationInput.context.planItemContract,
        planArtifact.plan_item_contract,
      );
      assert.deepEqual(foundation.verificationInput.context.planItems, planArtifact.plan_items);
      assert.deepEqual(
        foundation.verificationInput.context.dependencyGraph,
        planArtifact.dependency_graph,
      );
      assert.deepEqual(
        foundation.verificationInput.context.conflictZones,
        planArtifact.conflict_zones,
      );
      assert.deepEqual(
        foundation.verificationInput.context.testObligations,
        planArtifact.test_obligations,
      );
      assert.deepEqual(
        foundation.verificationInput.context.parallelizationSignals,
        planArtifact.parallelization_signals,
      );
      assert.deepEqual(
        foundation.verificationInput.uncertainty.carryForward,
        planArtifact.carry_forward,
      );
      assert.deepEqual(
        foundation.verificationInput.uncertainty.planningDiagnostics,
        planArtifact.planning_diagnostics,
      );
      assert.deepEqual(
        foundation.verificationInput.uncertainty.planningReadiness,
        planArtifact.planning_readiness,
      );
      assert.equal(foundation.verificationInput.usability.status, "actionable");
      assert.deepEqual(foundation.verificationInput.usability.blockingItems, []);
      assert.deepEqual(foundation.verificationInput.usability.warningItems, []);
      assert.deepEqual(foundation.carryForward.sourceIntake, planArtifact.source_intake);
      assert.deepEqual(foundation.carryForward.carryForward, planArtifact.carry_forward);
      assert.deepEqual(
        foundation.carryForward.planningDiagnostics,
        planArtifact.planning_diagnostics,
      );
      assert.deepEqual(
        foundation.carryForward.planningReadiness,
        planArtifact.planning_readiness,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation preserves warning-heavy Step 2 context for a verify-ready run",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);

      const foundation = result.foundation;
      assert.equal(foundation.sourcePlan.readyForVerification, true);
      assert.equal(foundation.sourcePlan.planningReadinessStatus, "ready_with_warnings");
      assert.equal(foundation.verificationInput.usability.status, "actionable");
      assert.ok(
        foundation.verificationInput.usability.warningItems.some(
          (item: { code: string; message: string }) => item.code === "LOW_CONFIDENCE_VERIFY_INPUT",
        ),
      );
      assert.ok(
        foundation.verificationInput.usability.warningItems.some(
          (item: { code: string; message: string }) => item.code === "PLAN_WARNING_CONTEXT_PRESENT",
        ),
      );
      assert.equal(foundation.verificationInput.uncertainty.carryForward.confidence.level, "low");
      assert.ok(foundation.verificationInput.uncertainty.carryForward.concerns.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation surfaces Step 2 partial-output fallback as warning context",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-partial-output-");
    const blockedOutputDir = join("..", "forge-verify-partial-output-root");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );
      assert.notEqual(planResult.code, 0);

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.sourcePlan.status, "failed");
      assert.equal(result.foundation.sourcePlan.readyForVerification, true);
      assert.ok(
        result.foundation.verificationInput.usability.warningItems.some(
          (item: { code: string; message: string }) => item.code === "PLAN_PARTIAL_OUTPUT_PRESENT",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation keeps blocked Step 2 readiness visible for diagnosis",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.sourcePlan.readyForVerification, false);
      assert.equal(result.foundation.verificationInput.usability.status, "upstream_blocked");
      assert.ok(
        result.foundation.verificationInput.usability.blockingItems.some(
          (item: { code: string; message: string }) => item.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation marks schema-valid but verification-weak plan input as blocked",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-non-actionable-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const rawPlanArtifact = await readJsonFile<Record<string, unknown>>(planArtifactPath(repoRoot));
      const carryForward = rawPlanArtifact.carry_forward as Record<string, unknown>;
      const taskSpec = carryForward.task_spec as Record<string, unknown>;

      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        `${JSON.stringify(
          {
            ...rawPlanArtifact,
            plan_items: [],
            dependency_graph: [],
            conflict_zones: [],
            test_obligations: [],
            parallelization_signals: [],
            carry_forward: {
              ...carryForward,
              task_spec: {
                ...taskSpec,
                explicit_requirements: [],
                acceptance_criteria: [],
                implementation_necessities: [],
              },
              candidate_targets: [],
              initial_verification_targets: [],
              concerns: [],
            },
            planning_diagnostics: {
              usability_status: "actionable",
              warning_items: [],
              blocking_items: [],
              partial_output: null,
              planning_assist: {
                outcome: "not_attempted",
                attempted: false,
                used: false,
                provider: null,
                warnings: [],
                ignoredEdits: [],
                reportNotes: [],
              },
            },
            planning_readiness: {
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
          },
          null,
          2,
        )}\n`,
      );

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.verificationInput.usability.status, "non_actionable");
      assert.ok(
        result.foundation.verificationInput.usability.blockingItems.some(
          (item: { code: string; message: string }) => item.code === "VERIFY_INPUT_TOO_WEAK",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "buildVerifyFoundation derives carry-forward verification context from normalized input",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-foundation-derived-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const planArtifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const foundation = buildVerifyFoundation({
        repoRoot,
        paths: {
          requestedOutputRoot: null,
          outputRoot: join(repoRoot, ".forge"),
          usedFallbackRoot: false,
          fallbackReason: null,
          planArtifactPath: planArtifactPath(repoRoot),
        },
        sourcePlan: {
          artifactPath: planArtifactPath(repoRoot),
          command: planArtifact.command,
          repoRoot: planArtifact.repoRoot,
          status: planArtifact.status,
          summary: planArtifact.summary,
          readyForVerification: planArtifact.planning_readiness.ready,
          planningReadinessStatus: planArtifact.planning_readiness.status,
          failure: planArtifact.failure,
        },
        sourceIntake: planArtifact.source_intake,
        verificationInput: {
          context: {
            planItemContract: planArtifact.plan_item_contract,
            planItems: planArtifact.plan_items,
            dependencyGraph: planArtifact.dependency_graph,
            conflictZones: planArtifact.conflict_zones,
            testObligations: planArtifact.test_obligations,
            parallelizationSignals: planArtifact.parallelization_signals,
          },
          uncertainty: {
            carryForward: planArtifact.carry_forward,
            planningDiagnostics: planArtifact.planning_diagnostics,
            planningReadiness: {
              ...planArtifact.planning_readiness,
              summary: "Derived verify readiness summary.",
            },
          },
          usability: {
            status: "actionable",
            warningItems: [],
            blockingItems: [],
          },
        },
      });

      assert.equal(
        foundation.carryForward.planningReadiness.summary,
        "Derived verify readiness summary.",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation returns a deterministic failure when the plan artifact is missing",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-missing-");

    try {
      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "VERIFY_INPUT_MISSING");
      assert.match(result.failure?.message ?? "", /plan\.json/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify foundation returns a deterministic failure when the plan artifact is schema-invalid",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-invalid-");

    try {
      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        JSON.stringify(
          {
            schemaVersion: "2.0.0",
            command: "forge plan",
          },
          null,
          2,
        ),
      );

      const result = await runVerifyFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "PLAN_ARTIFACT_INVALID");
      assert.match(result.failure?.message ?? "", /invalid/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "step 3 boundary policy explicitly prohibits later-step drift and makes TLA+/TLC part of V1",
  async () => {
    assert.match(STEP3_BOUNDARY_POLICY.purpose, /real step 3 pipeline/i);
    assert.match(STEP3_BOUNDARY_POLICY.purpose, /usable verification outputs/i);
    assert.ok(STEP3_BOUNDARY_POLICY.authoritativeInputs.includes(".forge/plan.json"));
    assert.deepEqual(STEP3_BOUNDARY_POLICY.implementationPriorities, [
      "verification target/case construction",
      "structural verification lane",
      "formal lane foundations",
      "real TLA+ generation",
      "real TLC execution for the selected high-value subset",
      "machine-readable artifact generation",
      "human-readable verification report",
      "stable verification orchestration",
      "real tests for implemented behavior",
      "optional lightweight debug artifacts",
      "safe cleanup inside Step 3",
      "broad polish for every edge case",
      "freeze-quality hardening",
      "expanding formal coverage too widely before the first subset is stable",
    ]);
    assert.ok(STEP3_BOUNDARY_POLICY.deferredCapabilities.includes("forge split"));
    assert.ok(STEP3_BOUNDARY_POLICY.deferredCapabilities.includes("forge execute"));
    assert.ok(STEP3_BOUNDARY_POLICY.deferredCapabilities.includes("forge integrate"));
    assert.ok(STEP3_BOUNDARY_POLICY.deferredCapabilities.includes("interactive shell mode"));
    assert.ok(STEP3_BOUNDARY_POLICY.deferredCapabilities.includes("memory backends"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("re-plan the task from prose"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("modify code"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("edit source files directly"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("split into workstreams"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("generate execution packets"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("broad repo cleanup unrelated to Step 3"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("make verification depend on fuzzy reasoning"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("pretend TLA+/TLC ran when they did not"));
    assert.ok(STEP3_BOUNDARY_POLICY.disallowedCapabilities.includes("redesign Step 3 architecture without strong reason"));
    assert.deepEqual(STEP3_BOUNDARY_POLICY.supportedLanes, ["structural", "formal"]);
    assert.ok(STEP3_BOUNDARY_POLICY.formalLane.tooling.includes("TLA+"));
    assert.ok(STEP3_BOUNDARY_POLICY.formalLane.tooling.includes("TLC"));
    assert.ok(STEP3_BOUNDARY_POLICY.formalLane.entryCriteria.includes("state_machine_like"));
    assert.ok(STEP3_BOUNDARY_POLICY.formalLane.entryCriteria.includes("ordering_critical"));
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
