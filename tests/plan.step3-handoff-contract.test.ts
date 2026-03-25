import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
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

type PlanArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  source_intake: {
    artifactPath: string;
    status: string;
    summary: string;
    readyForPlanning: boolean;
  };
  plan_items: Array<{
    id: string;
    verificationRelevance: {
      relevant: boolean;
      categories: string[];
      notes: string[];
    };
    parallelization: {
      signal: string;
      reason: string;
    };
  }>;
  dependency_graph: Array<{ planItemId: string; dependsOnPlanItemId: string }>;
  conflict_zones: Array<{ id: string; planItemIds: string[] }>;
  test_obligations: Array<{ planItemId: string; category: string; reason: string }>;
  parallelization_signals: Array<{ planItemId: string; signal: string; reason: string }>;
  carry_forward: {
    ambiguities: string[];
    warnings: string[];
    confidence: IntakeArtifact["confidence"];
    initial_verification_targets: IntakeArtifact["initial_verification_targets"];
    next_step_readiness: IntakeArtifact["next_step_readiness"];
    concerns: Array<{ id: string; source: string; planItemIds: string[] }>;
  };
  planning_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  planning_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

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

function planReportPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "reports", "plan-report.md");
}

function sectionBody(report: string, heading: string): string[] {
  const lines = report.split("\n");
  const startIndex = lines.indexOf(`## ${heading}`);

  if (startIndex === -1) {
    throw new Error(`Missing report heading: ${heading}`);
  }

  let endIndex = lines.length;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertStep3HandoffSections(artifact: PlanArtifact, report: string): void {
  assert.ok(artifact.source_intake.artifactPath.length > 0, "expected source intake artifact path");
  assert.ok(Array.isArray(artifact.plan_items));
  assert.ok(Array.isArray(artifact.dependency_graph));
  assert.ok(Array.isArray(artifact.conflict_zones));
  assert.ok(Array.isArray(artifact.test_obligations));
  assert.ok(Array.isArray(artifact.parallelization_signals));
  assert.ok(Array.isArray(artifact.carry_forward.initial_verification_targets));
  assert.ok(Array.isArray(artifact.carry_forward.concerns));
  assert.equal(typeof artifact.planning_readiness.ready, "boolean");
  assert.equal(typeof artifact.planning_readiness.summary, "string");
  assert.match(report, /## Source Intake/);
  assert.match(report, /## Plan Items/);
  assert.match(report, /## Dependencies/);
  assert.match(report, /## Conflict Zones/);
  assert.match(report, /## Test Obligations/);
  assert.match(report, /## Parallelization/);
  assert.match(report, /## Carry-Forward Context/);
  assert.match(report, /## Planning Readiness/);
}

function assertVerifyGate(report: string, expectedLine: string): void {
  assert.ok(
    sectionBody(report, "Planning Readiness").includes(expectedLine),
    `expected Planning Readiness section to include: ${expectedLine}`,
  );
}

await runScenario(
  "forge plan exposes a full Step 3 handoff contract for grounded spec runs",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-step3-handoff-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_intake.readyForPlanning, true);
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready");
      assert.ok(artifact.plan_items.length > 0);
      assert.ok(artifact.dependency_graph.length > 0);
      assert.ok(artifact.conflict_zones.length > 0);
      assert.ok(artifact.test_obligations.length > 0);
      assert.ok(artifact.parallelization_signals.length > 0);
      assert.ok(artifact.plan_items.every((item) => Array.isArray(item.verificationRelevance.categories)));
      assert.ok(artifact.plan_items.every((item) => item.parallelization.reason.length > 0));
      assertStep3HandoffSections(artifact, report);
      assertVerifyGate(report, "`forge verify` gate: proceed.");
      assert.ok(sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps warning-heavy Step 3 handoffs verify-ready with visible carried-forward concerns",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-step3-handoff-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready_with_warnings");
      assert.ok(artifact.carry_forward.ambiguities.length > 0);
      assert.ok(artifact.carry_forward.warnings.length > 0);
      assert.ok(artifact.carry_forward.concerns.length > 0);
      assert.ok(artifact.conflict_zones.length > 0);
      assert.ok(artifact.parallelization_signals.length > 0);
      assertStep3HandoffSections(artifact, report);
      assertVerifyGate(report, "`forge verify` gate: proceed.");
      assert.ok(sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps blocked Step 3 handoffs diagnostically useful instead of forcing verification to re-plan",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-step3-handoff-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.source_intake.readyForPlanning, false);
      assert.equal(artifact.planning_diagnostics.usability_status, "upstream_blocked");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.equal(artifact.planning_readiness.status, "blocked");
      assert.ok(artifact.plan_items.length > 0);
      assert.ok(artifact.dependency_graph.length > 0);
      assert.ok(artifact.conflict_zones.length > 0);
      assert.ok(artifact.parallelization_signals.some((entry) => entry.signal !== "safe_parallel"));
      assert.ok(artifact.carry_forward.concerns.length > 0);
      assertStep3HandoffSections(artifact, report);
      assertVerifyGate(report, "`forge verify` gate: blocked.");
      assert.ok(sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps failed fallback-output runs semantically useful for Step 3 verification gating",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-step3-handoff-fallback-");
    const blockedOutputDir = join("..", "forge-plan-step3-handoff-fallback-output");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );
      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));
      const readinessBody = sectionBody(report, "Planning Readiness").join("\n");

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready_with_warnings");
      assert.equal(artifact.planning_readiness.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assertStep3HandoffSections(artifact, report);
      assertVerifyGate(report, "`forge verify` gate: proceed.");
      assert.match(readinessBody, /OUTPUT_ROOT_FALLBACK/);
      assert.ok(readinessBody.includes(artifact.planning_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
