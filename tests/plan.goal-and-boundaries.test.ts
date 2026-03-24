import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { STEP2_BOUNDARY_POLICY } from "../src/plan/constants.js";
import { buildPlanFoundation, runPlanFoundation } from "../src/plan/runner.js";
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
      const foundation = result.foundation as typeof result.foundation & {
        sourceIntake: {
          artifactPath: string;
          status: IntakeArtifact["status"];
          readyForPlanning: boolean;
          inputMode: IntakeArtifact["input_mode"];
          sourceInputs: IntakeArtifact["source_inputs"];
          runtimeOptions: IntakeArtifact["runtime_options"];
          failure: IntakeArtifact["failure"];
        };
        planningInput: {
          context: {
            taskSpec: IntakeArtifact["task_spec"];
            repoContext: IntakeArtifact["repo_context"];
            candidateTargets: IntakeArtifact["candidate_targets"];
            riskAnalysis: IntakeArtifact["risk_analysis"];
            initialVerificationTargets: IntakeArtifact["initial_verification_targets"];
          };
          uncertainty: {
            ambiguities: IntakeArtifact["ambiguities"];
            warnings: IntakeArtifact["warnings"];
            confidence: IntakeArtifact["confidence"];
            nextStepReadiness: IntakeArtifact["next_step_readiness"];
          };
          usability: {
            status: "actionable" | "non_actionable" | "upstream_blocked";
            warningItems: Array<{ code: string; message: string }>;
            blockingItems: Array<{ code: string; message: string }>;
          };
        };
      };
      assert.equal(foundation.sourceIntake.artifactPath, join(repoRoot, ".forge", "intake.json"));
      assert.equal(foundation.sourceIntake.status, intakeArtifact.status);
      assert.equal(foundation.sourceIntake.readyForPlanning, true);
      assert.equal(foundation.sourceIntake.inputMode, intakeArtifact.input_mode);
      assert.deepEqual(foundation.sourceIntake.sourceInputs, intakeArtifact.source_inputs);
      assert.deepEqual(foundation.sourceIntake.runtimeOptions, intakeArtifact.runtime_options);
      assert.equal(foundation.sourceIntake.failure, intakeArtifact.failure);
      assert.deepEqual(foundation.planningInput.context.taskSpec, intakeArtifact.task_spec);
      assert.deepEqual(foundation.planningInput.context.repoContext, intakeArtifact.repo_context);
      assert.deepEqual(foundation.planningInput.context.candidateTargets, intakeArtifact.candidate_targets);
      assert.deepEqual(foundation.planningInput.context.riskAnalysis, intakeArtifact.risk_analysis);
      assert.deepEqual(
        foundation.planningInput.context.initialVerificationTargets,
        intakeArtifact.initial_verification_targets,
      );
      assert.deepEqual(foundation.planningInput.uncertainty.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(foundation.planningInput.uncertainty.warnings, intakeArtifact.warnings);
      assert.deepEqual(foundation.planningInput.uncertainty.confidence, intakeArtifact.confidence);
      assert.deepEqual(
        foundation.planningInput.uncertainty.nextStepReadiness,
        intakeArtifact.next_step_readiness,
      );
      assert.equal(foundation.planningInput.usability.status, "actionable");
      assert.equal("actionable" in foundation.planningInput.usability, false);
      assert.deepEqual(foundation.planningInput.usability.blockingItems, []);
      assert.deepEqual(foundation.carryForward.taskSpec, intakeArtifact.task_spec);
      assert.deepEqual(foundation.carryForward.repoContext, intakeArtifact.repo_context);
      assert.deepEqual(foundation.carryForward.candidateTargets, intakeArtifact.candidate_targets);
      assert.deepEqual(foundation.carryForward.riskAnalysis, intakeArtifact.risk_analysis);
      assert.deepEqual(
        foundation.carryForward.initialVerificationTargets,
        intakeArtifact.initial_verification_targets,
      );
      assert.deepEqual(foundation.carryForward.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(foundation.carryForward.warnings, intakeArtifact.warnings);
      assert.deepEqual(foundation.carryForward.confidence, intakeArtifact.confidence);
      assert.deepEqual(foundation.carryForward.nextStepReadiness, intakeArtifact.next_step_readiness);
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
      const foundation = result.foundation as typeof result.foundation & {
        sourceIntake: {
          status: IntakeArtifact["status"];
          readyForPlanning: boolean;
          inputMode: IntakeArtifact["input_mode"];
          sourceInputs: IntakeArtifact["source_inputs"];
          runtimeOptions: IntakeArtifact["runtime_options"];
        };
        planningInput: {
          usability: {
            status: "actionable" | "non_actionable" | "upstream_blocked";
            warningItems: Array<{ code: string; message: string }>;
          };
        };
      };
      assert.equal(foundation.sourceIntake.status, "warning");
      assert.equal(foundation.sourceIntake.readyForPlanning, true);
      assert.equal(foundation.sourceIntake.inputMode, intakeArtifact.input_mode);
      assert.deepEqual(foundation.sourceIntake.sourceInputs, intakeArtifact.source_inputs);
      assert.deepEqual(foundation.sourceIntake.runtimeOptions, intakeArtifact.runtime_options);
      assert.equal(foundation.carryForward.confidence.level, "low");
      assert.equal(foundation.planningInput.usability.status, "actionable");
      assert.equal("actionable" in foundation.planningInput.usability, false);
      assert.ok(
        foundation.planningInput.usability.warningItems.some(
          (item) => item.code === "LOW_CONFIDENCE_PLANNING_INPUT",
        ),
      );
      assert.ok(
        foundation.planningInput.usability.warningItems.some(
          (item) => item.code === "FALLBACK_TARGETING_PRESENT",
        ),
      );
      assert.deepEqual(foundation.carryForward.ambiguities, intakeArtifact.ambiguities);
      assert.deepEqual(foundation.carryForward.warnings, intakeArtifact.warnings);
      assert.ok(
        foundation.carryForward.candidateTargets.some(
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
      const foundation = result.foundation as typeof result.foundation & {
        sourceIntake: {
          status: IntakeArtifact["status"];
          readyForPlanning: boolean;
          inputMode: IntakeArtifact["input_mode"];
          sourceInputs: IntakeArtifact["source_inputs"];
          runtimeOptions: IntakeArtifact["runtime_options"];
          failure: IntakeArtifact["failure"];
        };
        planningInput: {
          usability: {
            status: "actionable" | "non_actionable" | "upstream_blocked";
            blockingItems: Array<{ code: string; message: string }>;
          };
        };
      };
      assert.equal(foundation.sourceIntake.status, "failed");
      assert.equal(foundation.sourceIntake.readyForPlanning, false);
      assert.equal(foundation.sourceIntake.inputMode, intakeArtifact.input_mode);
      assert.deepEqual(foundation.sourceIntake.sourceInputs, intakeArtifact.source_inputs);
      assert.deepEqual(foundation.sourceIntake.runtimeOptions, intakeArtifact.runtime_options);
      assert.deepEqual(foundation.sourceIntake.failure, intakeArtifact.failure);
      assert.equal(foundation.planningInput.usability.status, "upstream_blocked");
      assert.equal("actionable" in foundation.planningInput.usability, false);
      assert.ok(
        foundation.planningInput.usability.blockingItems.some(
          (item) => item.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
      assert.deepEqual(foundation.carryForward.nextStepReadiness, intakeArtifact.next_step_readiness);
      assert.ok(
        foundation.carryForward.nextStepReadiness.blocking_issues.some(
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
  "plan foundation marks schema-valid but non-actionable intake as blocked planning input",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-non-actionable-");

    try {
      const intakeResult = await runForgeCli(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifactPath = join(repoRoot, ".forge", "intake.json");
      const intakeArtifact = await readJsonFile<Record<string, unknown>>(intakeArtifactPath);
      const taskSpec = {
        ...(intakeArtifact.task_spec as Record<string, unknown>),
        explicit_requirements: [],
        acceptance_criteria: [],
        implementation_necessities: [],
      };

      await writeRepoFile(
        repoRoot,
        ".forge/intake.json",
        `${JSON.stringify(
          {
            ...intakeArtifact,
            task_spec: taskSpec,
            candidate_targets: [],
            initial_verification_targets: [],
            next_step_readiness: {
              ...(intakeArtifact.next_step_readiness as Record<string, unknown>),
              ready: true,
              blocking_issues: [],
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await runPlanFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      const foundation = result.foundation as typeof result.foundation & {
        planningInput: {
          usability: {
            status: "actionable" | "non_actionable" | "upstream_blocked";
            blockingItems: Array<{ code: string; message: string }>;
          };
        };
      };
      assert.equal(foundation.planningInput.usability.status, "non_actionable");
      assert.equal("actionable" in foundation.planningInput.usability, false);
      assert.ok(
        foundation.planningInput.usability.blockingItems.some(
          (item) => item.code === "PLAN_INPUT_TOO_WEAK",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "buildPlanFoundation derives carry-forward planning context from the normalized planning input",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-foundation-derived-");
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
      const foundation = buildPlanFoundation({
        repoRoot,
        paths: {
          requestedOutputRoot: null,
          outputRoot: join(repoRoot, ".forge"),
          usedFallbackRoot: false,
          fallbackReason: null,
          intakeArtifactPath: join(repoRoot, ".forge", "intake.json"),
          artifactPath: join(repoRoot, ".forge", "plan.json"),
          reportPath: join(repoRoot, ".forge", "reports", "plan-report.md"),
          debugArtifactPath: join(repoRoot, ".forge", "debug", "plan-debug.json"),
        },
        sourceIntake: {
          artifactPath: join(repoRoot, ".forge", "intake.json"),
          command: intakeArtifact.command,
          repoRoot: intakeArtifact.repoRoot,
          status: intakeArtifact.status,
          summary: intakeArtifact.summary,
          readyForPlanning: intakeArtifact.next_step_readiness.ready,
          inputMode: intakeArtifact.input_mode,
          sourceInputs: intakeArtifact.source_inputs,
          runtimeOptions: intakeArtifact.runtime_options,
          failure: intakeArtifact.failure,
        },
        planningInput: {
          context: {
            taskSpec: {
              ...intakeArtifact.task_spec,
              goal: "Derived normalized planning goal.",
            },
            repoContext: intakeArtifact.repo_context,
            candidateTargets: intakeArtifact.candidate_targets,
            riskAnalysis: intakeArtifact.risk_analysis,
            initialVerificationTargets: intakeArtifact.initial_verification_targets,
          },
          uncertainty: {
            ambiguities: intakeArtifact.ambiguities,
            warnings: intakeArtifact.warnings,
            confidence: intakeArtifact.confidence,
            nextStepReadiness: intakeArtifact.next_step_readiness,
          },
          usability: {
            status: "actionable",
            warningItems: [],
            blockingItems: [],
          },
        },
      } as Parameters<typeof buildPlanFoundation>[0]);

      assert.equal(foundation.carryForward.taskSpec.goal, "Derived normalized planning goal.");
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
      STEP2_BOUNDARY_POLICY.allowedSideEffects.some((entry) =>
        entry.includes("FORGE_PLAN_DEBUG=1") && entry.includes("debug artifacts"),
      ),
    );
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
