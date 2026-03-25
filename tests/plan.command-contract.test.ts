import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
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
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function planArtifactPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "plan.json");
}

function planReportPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "reports", "plan-report.md");
}

await runScenario(
  "forge plan writes ready outputs from a planning-ready Step 1 handoff and exits 0",
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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);
      assert.match(planResult.stdout, /Artifact:/);
      assert.match(planResult.stdout, /Report:/);

      const artifactPath = planArtifactPath(repoRoot);
      const reportPath = planReportPath(repoRoot);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const intakeArtifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        planning_diagnostics?: {
          usability_status?: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items?: Array<{ code?: string; message?: string }>;
          blocking_items?: Array<{ code?: string; message?: string }>;
          partial_output?: { code?: string; message?: string; fallbackReason?: string } | null;
        };
        planning_readiness?: { ready?: boolean };
        files?: { artifactPath?: string | null; reportPath?: string | null };
        source_intake?: { artifactPath?: string; summary?: string; readyForPlanning?: boolean };
        carry_forward?: { confidence?: { level?: string } };
        plan_items?: Array<{ dependencies: Array<{ planItemId: string; type: string; reason: string }> }>;
        dependency_graph?: unknown[];
        conflict_zones?: unknown[];
      }>(artifactPath);

      assert.equal(planArtifact.status, "ready");
      assert.equal(planArtifact.planning_diagnostics?.usability_status, "actionable");
      assert.deepEqual(planArtifact.planning_diagnostics?.warning_items, []);
      assert.deepEqual(planArtifact.planning_diagnostics?.blocking_items, []);
      assert.equal(planArtifact.planning_diagnostics?.partial_output ?? null, null);
      assert.equal(planArtifact.planning_readiness?.ready, true);
      assert.equal(planArtifact.files?.artifactPath, artifactPath);
      assert.equal(planArtifact.files?.reportPath, reportPath);
      assert.equal(planArtifact.source_intake?.artifactPath, join(repoRoot, ".forge", "intake.json"));
      assert.equal(planArtifact.source_intake?.readyForPlanning, true);
      assert.equal(planArtifact.carry_forward?.confidence?.level, intakeArtifact.confidence.level);
      assert.ok((planArtifact.plan_items?.length ?? 0) > 0, "expected populated plan items");
      assert.ok((planArtifact.dependency_graph?.length ?? 0) > 0, "expected explicit dependency graph");
      assert.ok((planArtifact.conflict_zones?.length ?? 0) > 0, "expected visible conflict zones");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan preserves warning-grade carried-forward uncertainty while still exiting 0",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-warning-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix"],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);

      const artifactPath = planArtifactPath(repoRoot);
      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        planning_diagnostics?: {
          usability_status?: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items?: Array<{ code?: string; message?: string }>;
          blocking_items?: Array<{ code?: string; message?: string }>;
          partial_output?: { code?: string; message?: string; fallbackReason?: string } | null;
        };
        planning_readiness?: { ready?: boolean };
        carry_forward?: {
          ambiguities?: string[];
          warnings?: string[];
          confidence?: { level?: string };
        };
        plan_items?: Array<{ dependencies: Array<{ planItemId: string; type: string; reason: string }> }>;
        dependency_graph?: unknown[];
        conflict_zones?: unknown[];
      }>(artifactPath);

      assert.equal(planArtifact.status, "ready");
      assert.equal(planArtifact.planning_diagnostics?.usability_status, "actionable");
      assert.ok(
        planArtifact.planning_diagnostics?.warning_items?.some((item) => item.code === "LOW_CONFIDENCE_PLANNING_INPUT"),
      );
      assert.ok(
        planArtifact.planning_diagnostics?.warning_items?.some((item) => item.code === "FALLBACK_TARGETING_PRESENT"),
      );
      assert.deepEqual(planArtifact.planning_diagnostics?.blocking_items, []);
      assert.equal(planArtifact.planning_diagnostics?.partial_output ?? null, null);
      assert.equal(planArtifact.planning_readiness?.ready, true);
      assert.equal(planArtifact.carry_forward?.confidence?.level, "low");
      assert.ok((planArtifact.carry_forward?.ambiguities?.length ?? 0) > 0);
      assert.ok((planArtifact.carry_forward?.warnings?.length ?? 0) > 0);
      assert.ok((planArtifact.plan_items?.length ?? 0) > 0, "expected populated plan items");
      assert.ok((planArtifact.dependency_graph?.length ?? 0) > 0, "expected explicit dependency graph");
      assert.ok((planArtifact.conflict_zones?.length ?? 0) > 0, "expected visible conflict zones");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan writes blocked outputs for a failed-but-persisted Step 1 handoff and exits non-zero",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );

      assert.equal(intakeResult.code, 1);
      assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), true);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /Status:\s+blocked/);

      const artifactPath = planArtifactPath(repoRoot);
      const reportPath = planReportPath(repoRoot);
      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        planning_diagnostics?: {
          usability_status?: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items?: Array<{ code?: string; message?: string }>;
          blocking_items?: Array<{ code?: string; message?: string }>;
          partial_output?: { code?: string; message?: string; fallbackReason?: string } | null;
        };
        planning_readiness?: { ready?: boolean };
        failure?: { code?: string; message?: string } | null;
        plan_items?: Array<{ dependencies: Array<{ planItemId: string; type: string; reason: string }> }>;
        dependency_graph?: unknown[];
        conflict_zones?: unknown[];
      }>(artifactPath);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);
      assert.equal(planArtifact.status, "blocked");
      assert.equal(planArtifact.planning_diagnostics?.usability_status, "upstream_blocked");
      assert.ok(
        planArtifact.planning_diagnostics?.blocking_items?.some((item) => item.code === "LOW_CONFIDENCE_ESCALATED"),
      );
      assert.equal(planArtifact.planning_diagnostics?.partial_output ?? null, null);
      assert.equal(planArtifact.planning_readiness?.ready, false);
      assert.equal(planArtifact.failure, null);
      assert.ok((planArtifact.plan_items?.length ?? 0) > 0, "expected diagnostic plan items");
      assert.ok((planArtifact.dependency_graph?.length ?? 0) > 0, "expected diagnostic dependency graph");
      assert.ok((planArtifact.conflict_zones?.length ?? 0) > 0, "expected diagnostic conflict zones");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan fails without durable outputs when intake.json is missing",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-missing-");

    try {
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /PLAN_INPUT_MISSING|intake\.json/i);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(planReportPath(repoRoot)), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan fails without durable outputs when intake.json is schema-invalid",
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

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /INTAKE_ARTIFACT_INVALID|invalid/i);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(planReportPath(repoRoot)), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan honors a repo-internal custom output root for both reads and writes",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-custom-output-");
    const specPath = join(repoRoot, "task.md");
    const customOutputDir = "custom-forge";

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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--output-dir", customOutputDir, "--spec", specPath],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", customOutputDir],
        repoRoot,
      );

      assert.equal(planResult.code, 0, planResult.stderr);
      assert.match(planResult.stdout, /Status:\s+ready/);
      assert.equal(await fileExists(planArtifactPath(repoRoot, customOutputDir)), true);
      assert.equal(await fileExists(planReportPath(repoRoot, customOutputDir)), true);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(planReportPath(repoRoot)), false);

      const planArtifact = await readJsonFile<{
        requestedOutputRoot?: string | null;
        outputRoot?: string;
        source_intake?: { artifactPath?: string };
      }>(planArtifactPath(repoRoot, customOutputDir));

      assert.equal(planArtifact.outputRoot, join(repoRoot, customOutputDir));
      assert.equal(planArtifact.requestedOutputRoot, join(repoRoot, customOutputDir));
      assert.equal(
        planArtifact.source_intake?.artifactPath,
        join(repoRoot, customOutputDir, "intake.json"),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan falls back to .forge when the requested output root is unsafe",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-fallback-");
    const specPath = join(repoRoot, "task.md");
    const blockedOutputDir = join("..", "forge-plan-fallback-output");

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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /OUTPUT_ROOT_FALLBACK/);
      assert.equal(await fileExists(planArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(planReportPath(repoRoot)), true);
      assert.equal(await fileExists(planArtifactPath(repoRoot, blockedOutputDir)), false);
      assert.equal(await fileExists(planReportPath(repoRoot, blockedOutputDir)), false);

      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        requestedOutputRoot?: string | null;
        outputRoot?: string;
        planning_diagnostics?: {
          usability_status?: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items?: Array<{ code?: string; message?: string }>;
          blocking_items?: Array<{ code?: string; message?: string }>;
          partial_output?: { code?: string; message?: string; fallbackReason?: string } | null;
        };
        failure?: { code?: string; message?: string; fallbackReason?: string } | null;
        source_intake?: { readyForPlanning?: boolean };
      }>(planArtifactPath(repoRoot));

      assert.equal(planArtifact.status, "failed");
      assert.equal(planArtifact.requestedOutputRoot, join(repoRoot, blockedOutputDir));
      assert.equal(planArtifact.outputRoot, join(repoRoot, ".forge"));
      assert.equal(planArtifact.planning_diagnostics?.usability_status, "actionable");
      assert.equal(planArtifact.planning_diagnostics?.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(planArtifact.planning_diagnostics?.partial_output?.fallbackReason);
      assert.equal(planArtifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(planArtifact.failure?.fallbackReason);
      assert.equal(planArtifact.source_intake?.readyForPlanning, true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps fallback-root failures visible in the summary even when planning is non-actionable",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-fallback-summary-");
    const specPath = join(repoRoot, "task.md");
    const blockedOutputDir = join("..", "forge-plan-fallback-summary-output");

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

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifactPath = join(repoRoot, ".forge", "intake.json");
      const intakeArtifact = await readJsonFile<Record<string, unknown>>(intakeArtifactPath);
      const taskSpec = {
        ...(intakeArtifact.task_spec as Record<string, unknown>),
        explicit_requirements: [],
        acceptance_criteria: [],
        implementation_necessities: [],
      };

      await writeFile(
        intakeArtifactPath,
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
        "utf8",
      );

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /OUTPUT_ROOT_FALLBACK/);

      const planArtifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        summary: string;
        planning_diagnostics?: {
          usability_status?: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items?: Array<{ code?: string; message?: string }>;
          blocking_items?: Array<{ code?: string; message?: string }>;
          partial_output?: { code?: string; message?: string; fallbackReason?: string } | null;
        };
        failure?: { code?: string; message?: string; fallbackReason?: string } | null;
      }>(join(repoRoot, ".forge", "plan.json"));

      assert.equal(planArtifact.status, "blocked");
      assert.equal(planArtifact.planning_diagnostics?.usability_status, "non_actionable");
      assert.ok(
        planArtifact.planning_diagnostics?.blocking_items?.some((item) => item.code === "PLAN_INPUT_TOO_WEAK"),
      );
      assert.equal(planArtifact.planning_diagnostics?.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(planArtifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.match(
        planArtifact.summary,
        /default \.forge output root|unsafe/i,
        "expected the fallback-root failure to stay visible in the top-level summary",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
