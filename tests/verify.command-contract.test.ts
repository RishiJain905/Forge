import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

interface VerifyArtifact {
  command: string;
  status: "ready" | "blocked" | "failed";
  summary: string;
  outputRoot: string;
  requestedOutputRoot: string | null;
  files: {
    artifactPath: string | null;
    reportPath: string | null;
    debugArtifactPath: string;
    debugVerificationCasesPath: string;
    debugStructuralFindingsPath: string;
    debugVerificationReadinessPath: string;
    debugStateModelsPath: string;
    debugTlaSpecsPath: string;
    debugTlcResultsPath: string;
  };
  source_plan: {
    artifactPath: string;
    command: string;
    status: string;
    readyForVerification: boolean;
    planningReadinessStatus: string;
    planning_diagnostics: Record<string, unknown>;
    planning_readiness: Record<string, unknown>;
    failure: { code: string; message: string; fallbackReason?: string } | null;
  };
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
  failure: { code: string; message: string; fallbackReason?: string } | null;
}

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

async function readVerifyArtifact(repoRoot: string, outputDir = ".forge"): Promise<VerifyArtifact> {
  return readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot, outputDir));
}

function verifyDebugPath(repoRoot: string, fileName: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "debug", fileName);
}

function makeNonActionablePlanArtifact(artifact: Record<string, unknown>): Record<string, unknown> {
  const carryForward = artifact.carry_forward as Record<string, unknown>;
  const taskSpec = carryForward.task_spec as Record<string, unknown>;
  const planningDiagnostics = artifact.planning_diagnostics as Record<string, unknown>;

  return {
    ...artifact,
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
      ...planningDiagnostics,
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
  };
}

await runScenario(
  "forge verify rejects unsupported public flags and keeps the public surface limited to --repo and --output-dir",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-unsupported-flag-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const result = runForgeVerifyBinary(
        ["--repo", repoRoot, "--output-dir", ".forge", "--report-only"],
        repoRoot,
      );

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /unknown command 'verify'|unknown option|unknown argument/i);
      assert.equal(await fileExists(verifyArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(verifyReportPath(repoRoot)), false);
      assertForgeVerifyOutputHasNoReportHeadings(result);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify writes ready outputs from a planning-ready Step 2 handoff and keeps the CLI output minimal",
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
      await removePlanningInputs(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status:\s+ready/);
      assert.match(result.stdout, /Summary:/);
      assert.match(result.stdout, /Output root:/);
      assert.match(result.stdout, /Artifact:/);
      assert.match(result.stdout, /Report:/);
      assertForgeVerifyOutputHasNoReportHeadings(result);

      const artifactPath = verifyArtifactPath(repoRoot);
      const reportPath = verifyReportPath(repoRoot);
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readVerifyArtifact(repoRoot);
      assert.equal(artifact.command, "forge verify");
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.equal(artifact.source_plan.artifactPath, join(repoRoot, ".forge", "plan.json"));
      assert.equal(artifact.source_plan.command, "forge plan");
      assert.equal(artifact.source_plan.readyForVerification, true);
      assert.equal(artifact.source_plan.planningReadinessStatus, "ready");
      assert.ok(artifact.source_plan.planning_diagnostics);
      assert.ok(artifact.source_plan.planning_readiness);
      assert.equal(
        artifact.files.debugVerificationReadinessPath,
        verifyDebugPath(repoRoot, "verification-readiness.json"),
      );
      assert.equal(artifact.verification_readiness.ready, true);
      assert.equal(artifact.verification_diagnostics.blocking_items.length, 0);
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
      assert.ok(
        artifact.verification_targets.every((target) =>
          target.sourceRiskSources.length > 0 && target.verificationCaseIds.length > 0,
        ),
      );
      assert.ok(
        artifact.verification_cases.every((verificationCase) =>
          verificationCase.lanes.length === 1 && verificationCase.verificationTargetId.length > 0,
        ),
      );
      assert.doesNotMatch(artifact.structural_verification.summary, /deferred in Part 2/i);
      assert.doesNotMatch(artifact.formal_verification.summary, /deferred in Part 2/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify preserves warning-heavy planning context while staying ready",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status:\s+ready/);
      assertForgeVerifyOutputHasNoReportHeadings(result);

      const artifact = await readVerifyArtifact(repoRoot);
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.verification_readiness.ready, true);
      assert.ok(
        artifact.verification_diagnostics.warning_items.some((item) =>
          item.code === "LOW_CONFIDENCE_VERIFY_INPUT" || item.code === "PLAN_WARNING_CONTEXT_PRESENT",
        ),
      );
      assert.ok(artifact.verification_readiness.warning_items.length > 0);
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify blocks on upstream-blocked and non-actionable Step 2 inputs",
  async () => {
    const blockedRepoRoot = await createTempRepo("forge-verify-blocked-");
    const weakRepoRoot = await createTempRepo("forge-verify-weak-");

    try {
      const blockedIntakeResult = runForgeBinary(
        ["intake", "--repo", blockedRepoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        blockedRepoRoot,
      );
      assert.equal(blockedIntakeResult.code, 1);

      const blockedPlanResult = runForgePlanBinary(["--repo", blockedRepoRoot], blockedRepoRoot);
      assert.notEqual(blockedPlanResult.code, 0);
      const blockedVerifyResult = runForgeVerifyBinary(["--repo", blockedRepoRoot], blockedRepoRoot);

      assert.notEqual(blockedVerifyResult.code, 0);
      assert.match(blockedVerifyResult.stderr, /Status:\s+blocked/);
      assert.equal(await fileExists(verifyArtifactPath(blockedRepoRoot)), true);
      assert.equal(await fileExists(verifyReportPath(blockedRepoRoot)), true);
      assertForgeVerifyOutputHasNoReportHeadings(blockedVerifyResult);
      const blockedArtifact = await readVerifyArtifact(blockedRepoRoot);
      assert.equal(blockedArtifact.status, "blocked");
      assert.equal(blockedArtifact.files.artifactPath, verifyArtifactPath(blockedRepoRoot));
      assert.equal(blockedArtifact.files.reportPath, verifyReportPath(blockedRepoRoot));
      assert.equal(blockedArtifact.verification_readiness.ready, false);
      assert.ok(blockedArtifact.verification_diagnostics.blocking_items.length > 0);

      await seedSpecRepo(weakRepoRoot);
      const weakIntakeResult = runForgeBinary(
        ["intake", "--repo", weakRepoRoot, "--spec", join(weakRepoRoot, "task.md")],
        weakRepoRoot,
      );
      assert.equal(weakIntakeResult.code, 0, weakIntakeResult.stderr);

      const weakPlanResult = runForgePlanBinary(["--repo", weakRepoRoot], weakRepoRoot);
      assert.equal(weakPlanResult.code, 0, weakPlanResult.stderr);

      const rawPlanArtifact = await readJsonFile<Record<string, unknown>>(join(weakRepoRoot, ".forge", "plan.json"));
      await writeRepoFile(
        weakRepoRoot,
        ".forge/plan.json",
        `${JSON.stringify(makeNonActionablePlanArtifact(rawPlanArtifact), null, 2)}\n`,
      );

      const weakVerifyResult = runForgeVerifyBinary(["--repo", weakRepoRoot], weakRepoRoot);
      assert.notEqual(weakVerifyResult.code, 0);
      assert.match(weakVerifyResult.stderr, /Status:\s+blocked/);
      assert.equal(await fileExists(verifyArtifactPath(weakRepoRoot)), true);
      assert.equal(await fileExists(verifyReportPath(weakRepoRoot)), true);
      assertForgeVerifyOutputHasNoReportHeadings(weakVerifyResult);

      const weakArtifact = await readVerifyArtifact(weakRepoRoot);
      assert.equal(weakArtifact.status, "blocked");
      assert.equal(weakArtifact.files.artifactPath, verifyArtifactPath(weakRepoRoot));
      assert.equal(weakArtifact.files.reportPath, verifyReportPath(weakRepoRoot));
      assert.equal(weakArtifact.verification_diagnostics.usability_status, "non_actionable");
      assert.ok(
        weakArtifact.verification_diagnostics.blocking_items.some((item) => item.code === "VERIFY_INPUT_TOO_WEAK"),
      );
      assert.equal(weakArtifact.verification_targets.length, 0);
      assert.equal(weakArtifact.verification_cases.length, 0);
    } finally {
      await disposeTempRepo(blockedRepoRoot);
      await disposeTempRepo(weakRepoRoot);
    }
  },
);

await runScenario(
  "forge verify handles missing and invalid plan artifacts without durable outputs",
  async () => {
    const missingRepoRoot = await createTempRepo("forge-verify-missing-");
    const invalidRepoRoot = await createTempRepo("forge-verify-invalid-");

    try {
      await removePlanningInputs(missingRepoRoot);
      const missingVerifyResult = runForgeVerifyBinary(["--repo", missingRepoRoot], missingRepoRoot);
      assert.notEqual(missingVerifyResult.code, 0);
      assert.match(missingVerifyResult.stderr, /PLAN_INPUT_MISSING|plan\.json/i);
      assert.equal(await fileExists(verifyArtifactPath(missingRepoRoot)), false);
      assert.equal(await fileExists(verifyReportPath(missingRepoRoot)), false);
      assertForgeVerifyOutputHasNoReportHeadings(missingVerifyResult);

      await writeRepoFile(
        invalidRepoRoot,
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

      const invalidVerifyResult = runForgeVerifyBinary(["--repo", invalidRepoRoot], invalidRepoRoot);
      assert.notEqual(invalidVerifyResult.code, 0);
      assert.match(invalidVerifyResult.stderr, /PLAN_ARTIFACT_INVALID|invalid/i);
      assert.equal(await fileExists(verifyArtifactPath(invalidRepoRoot)), false);
      assert.equal(await fileExists(verifyReportPath(invalidRepoRoot)), false);
      assertForgeVerifyOutputHasNoReportHeadings(invalidVerifyResult);
    } finally {
      await disposeTempRepo(missingRepoRoot);
      await disposeTempRepo(invalidRepoRoot);
    }
  },
);

await runScenario(
  "forge verify honors custom output roots and falls back safely for unsafe output roots",
  async () => {
    const safeRepoRoot = await createTempRepo("forge-verify-custom-output-");
    const fallbackRepoRoot = await createTempRepo("forge-verify-fallback-");
    const customOutputDir = "custom-forge";
    const blockedOutputDir = join("..", "forge-verify-fallback-output");

    try {
      await seedSpecRepo(safeRepoRoot);
      const safeIntakeResult = runForgeBinary(
        ["intake", "--repo", safeRepoRoot, "--output-dir", customOutputDir, "--spec", join(safeRepoRoot, "task.md")],
        safeRepoRoot,
      );
      assert.equal(safeIntakeResult.code, 0, safeIntakeResult.stderr);
      const safePlanResult = runForgePlanBinary(
        ["--repo", safeRepoRoot, "--output-dir", customOutputDir],
        safeRepoRoot,
      );
      assert.equal(safePlanResult.code, 0, safePlanResult.stderr);
      await removePlanningInputs(safeRepoRoot);

      const safeVerifyResult = runForgeVerifyBinary(
        ["--repo", safeRepoRoot, "--output-dir", customOutputDir],
        safeRepoRoot,
      );

      assert.equal(safeVerifyResult.code, 0, safeVerifyResult.stderr);
      assert.equal(await fileExists(verifyArtifactPath(safeRepoRoot, customOutputDir)), true);
      assert.equal(await fileExists(verifyReportPath(safeRepoRoot, customOutputDir)), true);
      assert.equal(await fileExists(verifyArtifactPath(safeRepoRoot)), false);
      assert.equal(await fileExists(verifyReportPath(safeRepoRoot)), false);
      assertForgeVerifyOutputHasNoReportHeadings(safeVerifyResult);

      const safeArtifact = await readVerifyArtifact(safeRepoRoot, customOutputDir);
      assert.equal(safeArtifact.outputRoot, join(safeRepoRoot, customOutputDir));
      assert.equal(safeArtifact.requestedOutputRoot, join(safeRepoRoot, customOutputDir));
      assert.equal(safeArtifact.source_plan.artifactPath, join(safeRepoRoot, customOutputDir, "plan.json"));
      assert.equal(
        safeArtifact.files.debugVerificationReadinessPath,
        verifyDebugPath(safeRepoRoot, "verification-readiness.json", customOutputDir),
      );

      await seedSpecRepo(fallbackRepoRoot);
      const fallbackIntakeResult = runForgeBinary(
        ["intake", "--repo", fallbackRepoRoot, "--spec", join(fallbackRepoRoot, "task.md")],
        fallbackRepoRoot,
      );
      assert.equal(fallbackIntakeResult.code, 0, fallbackIntakeResult.stderr);
      const fallbackPlanResult = runForgePlanBinary(["--repo", fallbackRepoRoot], fallbackRepoRoot);
      assert.equal(fallbackPlanResult.code, 0, fallbackPlanResult.stderr);
      await removePlanningInputs(fallbackRepoRoot);

      const fallbackVerifyResult = runForgeVerifyBinary(
        ["--repo", fallbackRepoRoot, "--output-dir", blockedOutputDir],
        fallbackRepoRoot,
      );

      assert.notEqual(fallbackVerifyResult.code, 0);
      assert.match(fallbackVerifyResult.stderr, /OUTPUT_ROOT_FALLBACK/);
      assert.equal(await fileExists(verifyArtifactPath(fallbackRepoRoot)), true);
      assert.equal(await fileExists(verifyReportPath(fallbackRepoRoot)), true);
      assert.equal(await fileExists(verifyArtifactPath(fallbackRepoRoot, blockedOutputDir)), false);
      assert.equal(await fileExists(verifyReportPath(fallbackRepoRoot, blockedOutputDir)), false);
      assertForgeVerifyOutputHasNoReportHeadings(fallbackVerifyResult);

      const fallbackArtifact = await readVerifyArtifact(fallbackRepoRoot);
      assert.equal(fallbackArtifact.outputRoot, join(fallbackRepoRoot, ".forge"));
      assert.equal(fallbackArtifact.requestedOutputRoot, join(fallbackRepoRoot, blockedOutputDir));
      assert.equal(fallbackArtifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
    } finally {
      await disposeTempRepo(safeRepoRoot);
      await disposeTempRepo(fallbackRepoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
