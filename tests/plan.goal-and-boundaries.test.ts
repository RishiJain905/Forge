import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { STEP2_BOUNDARY_POLICY } from "../src/plan/constants.js";
import { runPlanFoundation } from "../src/plan/runner.js";
import { validatePlanItem } from "../src/plan/schema.js";
import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgeCli,
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

async function loadPersistedIntakeArtifact(repoRoot: string): Promise<IntakeArtifact> {
  return readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
}

await runScenario(
  "plan foundation consumes the persisted Step 1 artifact for a planning-ready run without re-running intake",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-ready-");
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

      const intakeResult = await runForgeCli(["intake", "--repo", repoRoot, "--spec", specPath], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifact = await loadPersistedIntakeArtifact(repoRoot);

      await rm(specPath, { force: true });
      await rm(join(repoRoot, "src", "app.ts"), { force: true });
      await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });

      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.sourceIntake.artifactPath, join(repoRoot, ".forge", "intake.json"));
      assert.equal(result.foundation.sourceIntake.status, intakeArtifact.status);
      assert.equal(result.foundation.sourceIntake.readyForPlanning, true);
      assert.deepEqual(result.foundation.carryForward.taskSpec, intakeArtifact.task_spec);
      assert.deepEqual(result.foundation.carryForward.repoContext, intakeArtifact.repo_context);
      assert.deepEqual(result.foundation.carryForward.candidateTargets, intakeArtifact.candidate_targets);
      assert.deepEqual(result.foundation.carryForward.riskAnalysis, intakeArtifact.risk_analysis);
      assert.deepEqual(
        result.foundation.carryForward.initialVerificationTargets,
        intakeArtifact.initial_verification_targets,
      );
      assert.deepEqual(result.foundation.carryForward.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(result.foundation.carryForward.warnings, intakeArtifact.warnings);
      assert.deepEqual(result.foundation.carryForward.confidence, intakeArtifact.confidence);
      assert.deepEqual(result.foundation.carryForward.nextStepReadiness, intakeArtifact.next_step_readiness);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plan foundation preserves warning-grade ambiguity, low-confidence, and fallback-target context from intake",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-warning-");

    try {
      const intakeResult = await runForgeCli(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifact = await loadPersistedIntakeArtifact(repoRoot);
      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.sourceIntake.status, "warning");
      assert.equal(result.foundation.sourceIntake.readyForPlanning, true);
      assert.equal(result.foundation.carryForward.confidence.level, "low");
      assert.deepEqual(result.foundation.carryForward.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(result.foundation.carryForward.warnings, intakeArtifact.warnings);
      assert.ok(
        result.foundation.carryForward.candidateTargets.some(
          (item: IntakeArtifact["candidate_targets"][number]) => item.match_type === "fallback",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plan foundation keeps failed-but-persisted intake blockers visible for diagnosis",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const intakeArtifact = await loadPersistedIntakeArtifact(repoRoot);
      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.sourceIntake.status, "failed");
      assert.equal(result.foundation.sourceIntake.readyForPlanning, false);
      assert.deepEqual(result.foundation.carryForward.nextStepReadiness, intakeArtifact.next_step_readiness);
      assert.ok(
        result.foundation.carryForward.nextStepReadiness.blocking_issues.some(
          (issue: IntakeArtifact["next_step_readiness"]["blocking_issues"][number]) =>
            issue.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plan foundation returns a deterministic failure when the intake artifact is missing",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-missing-");

    try {
      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "PLAN_INPUT_MISSING");
      assert.match(result.failure?.message ?? "", /intake\.json/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plan foundation returns a deterministic failure when the intake artifact is schema-invalid",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-invalid-");

    try {
      await writeRepoFile(
        repoRoot,
        ".forge/intake.json",
        JSON.stringify(
          {
            schemaVersion: "2.0.0",
            command: "forge intake",
          },
          null,
          2,
        ),
      );

      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "INTAKE_ARTIFACT_INVALID");
      assert.match(result.failure?.message ?? "", /invalid/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plan item validation rejects vague or incomplete plan items",
  async () => {
    const validItem = validatePlanItem({
      id: "plan-item-1",
      title: "Update app behavior",
      description: "Align source and tests for the app behavior change.",
      category: "implementation",
      sourceRequirements: ["src/app.ts is updated", "tests/app.test.ts stays aligned"],
      likelyAffectedPaths: ["src/app.ts", "tests/app.test.ts"],
      dependencies: [
        {
          planItemId: "plan-item-0",
          type: "hard",
          reason: "The foundation change must land first.",
        },
      ],
      riskLevel: "medium",
      testObligations: [
        {
          category: "regression",
          reason: "Existing behavior must remain covered.",
        },
      ],
      verificationRelevance: {
        relevant: true,
        categories: ["code_surface", "test_surface"],
        notes: ["Touches executable behavior and aligned tests."],
      },
      parallelization: {
        signal: "parallel_after_dependency",
        reason: "This can proceed after the shared foundation update lands.",
      },
    });

    assert.equal(validItem.id, "plan-item-1");

    assert.throws(
      () =>
        validatePlanItem({
          id: "plan-item-2",
          title: "Do it",
          description: "",
          category: "",
          sourceRequirements: [],
          likelyAffectedPaths: [],
          dependencies: [],
          riskLevel: "medium",
          testObligations: [],
          verificationRelevance: {
            relevant: false,
            categories: [],
            notes: [],
          },
          parallelization: {
            signal: "safe_parallel",
            reason: "",
          },
        }),
      /Too small|Invalid option/,
    );
  },
);

await runScenario(
  "step 2 boundary policy explicitly prohibits later-step drift",
  async () => {
    assert.match(STEP2_BOUNDARY_POLICY.purpose, /structured implementation plan/i);
    assert.ok(STEP2_BOUNDARY_POLICY.authoritativeInputs.includes(".forge/intake.json"));
    assert.ok(
      STEP2_BOUNDARY_POLICY.disallowedCapabilities.includes("verify correctness directly"),
    );
    assert.ok(STEP2_BOUNDARY_POLICY.disallowedCapabilities.includes("split into workstreams"));
    assert.ok(STEP2_BOUNDARY_POLICY.disallowedCapabilities.includes("generate execution packets"));
    assert.ok(STEP2_BOUNDARY_POLICY.disallowedCapabilities.includes("modify code"));
    assert.ok(
      STEP2_BOUNDARY_POLICY.disallowedCapabilities.includes("act like a freeform brainstorming agent"),
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
