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

function extractLevelTwoHeadings(report: string): string[] {
  return report
    .split("\n")
    .filter((line) => line.startsWith("## "));
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

function planArtifactPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "plan.json");
}

function planReportPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "reports", "plan-report.md");
}

const REQUIRED_HEADINGS = [
  "## Overview",
  "## Purpose",
  "## Source Intake",
  "## Plan Item Contract",
  "## Plan Items",
  "## Dependencies",
  "## Conflict Zones",
  "## Test Obligations",
  "## Parallelization",
  "## Carry-Forward Context",
  "## Planning Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Failure",
  "## Summary",
] as const;

await runScenario(
  "forge plan report stays aligned with the artifact and renders populated planning sections honestly",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-report-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix"],
        repoRoot,
      );

      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removeSpecInputs(repoRoot);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);

      const artifactPath = join(repoRoot, ".forge", "plan.json");
      const reportPath = join(repoRoot, ".forge", "reports", "plan-report.md");
      const artifact = await readJsonFile<{
        summary: string;
        files: { artifactPath: string | null; reportPath: string | null };
        planning_diagnostics: {
          usability_status: "actionable" | "non_actionable" | "upstream_blocked";
          warning_items: Array<{ code: string; message: string }>;
          blocking_items: Array<{ code: string; message: string }>;
          partial_output: { code: string; message: string; fallbackReason?: string } | null;
          planning_assist: {
            outcome: "not_attempted" | "no_suggestion" | "applied" | "ignored_only" | "failed";
            provider: string | null;
            warnings: string[];
            ignoredEdits: string[];
            reportNotes: string[];
          };
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
        plan_items: Array<{ id: string; dependencies: Array<{ planItemId: string; type: string; reason: string }> }>;
        dependency_graph: Array<{
          planItemId: string;
          dependsOnPlanItemId: string;
          type: string;
          reason: string;
        }>;
        conflict_zones: Array<{ id: string; planItemIds: string[] }>;
        test_obligations: Array<{ planItemId: string; category: string; reason: string }>;
        parallelization_signals: Array<{ planItemId: string; signal: string; reason: string }>;
        source_intake: {
          artifactPath: string;
          command: string;
          status: string;
          summary: string;
          readyForPlanning: boolean;
        };
        carry_forward: {
          task_spec: { goal: string };
          confidence: { level: string };
          ambiguities: string[];
          warnings: string[];
          concerns: Array<{ id: string; source: string; message: string }>;
        };
      }>(artifactPath);
      const report = await readTextFile(reportPath);
      const readinessBody = sectionBody(report, "Planning Readiness").join("\n");
      const carryForwardBody = sectionBody(report, "Carry-Forward Context").join("\n");
      const planItemsBody = sectionBody(report, "Plan Items");
      const dependenciesBody = sectionBody(report, "Dependencies");
      const conflictZonesBody = sectionBody(report, "Conflict Zones");
      const testObligationsBody = sectionBody(report, "Test Obligations");
      const parallelizationBody = sectionBody(report, "Parallelization");

      assert.deepEqual(extractLevelTwoHeadings(report), [...REQUIRED_HEADINGS]);
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.ok(report.includes(artifact.source_intake.command));
      assert.ok(report.includes(artifact.source_intake.status));
      assert.ok(report.includes(artifact.source_intake.summary));
      assert.ok(report.includes(artifact.summary));
      assert.ok(report.includes(artifact.files.artifactPath ?? ""));
      assert.ok(report.includes(artifact.files.reportPath ?? ""));
      assert.ok(report.includes(artifact.planning_diagnostics.usability_status));
      assert.ok(report.includes(artifact.planning_diagnostics.planning_assist.outcome));
      assert.ok(
        report.includes(artifact.planning_diagnostics.warning_items[0]?.code ?? "LOW_CONFIDENCE_PLANNING_INPUT"),
      );
      assert.ok(readinessBody.includes(String(artifact.planning_readiness.ready)));
      assert.ok(readinessBody.includes("ready_with_warnings"));
      assert.ok(readinessBody.includes(artifact.planning_readiness.summary));
      assert.ok(readinessBody.includes(artifact.planning_readiness.recommended_user_actions[0]));
      assert.ok(
        readinessBody.includes(artifact.planning_readiness.constraining_concern_ids[0] ?? ""),
        "expected the report to surface constraining concern ids",
      );
      assert.ok(carryForwardBody.includes(artifact.carry_forward.task_spec.goal));
      assert.ok(carryForwardBody.includes(artifact.carry_forward.confidence.level));
      const carriedForwardEvidence =
        artifact.carry_forward.ambiguities[0] ?? artifact.carry_forward.warnings[0];

      assert.ok(carriedForwardEvidence);
      assert.ok(carryForwardBody.includes(carriedForwardEvidence));
      assert.ok(artifact.plan_items.length > 0, "expected populated plan items");
      assert.ok(artifact.dependency_graph.length > 0, "expected explicit dependency graph");
      assert.ok(artifact.conflict_zones.length > 0, "expected visible conflict zones");
      assert.ok(planItemsBody.length > 0);
      assert.ok(dependenciesBody.length > 0);
      assert.ok(conflictZonesBody.length > 0);
      assert.notDeepEqual(planItemsBody, ["- none"]);
      assert.notDeepEqual(dependenciesBody, ["- none"]);
      assert.notDeepEqual(conflictZonesBody, ["- none"]);
      assert.ok(artifact.test_obligations.length > 0, "expected top-level test obligations");
      assert.ok(artifact.parallelization_signals.length > 0, "expected top-level parallelization signals");
      assert.ok(testObligationsBody.some((line) => line.includes("->")));
      assert.ok(parallelizationBody.some((line) => line.includes("->")));
      assert.ok(artifact.carry_forward.concerns.length > 0, "expected carried-forward concern mapping");
      assert.ok(carryForwardBody.includes("Derived Concerns"));
      assert.ok(carryForwardBody.includes(artifact.carry_forward.concerns[0]?.id ?? ""));
      for (const item of artifact.plan_items) {
        assert.ok(report.includes(item.id), `expected report to reference plan item ${item.id}`);
      }
      for (const zone of artifact.conflict_zones) {
        assert.ok(report.includes(zone.id), `expected report to reference conflict zone ${zone.id}`);
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan report keeps blocked fallback output coherent across overview, readiness, failure, and summary sections",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-report-blocked-");
    const blockedOutputDir = join("..", "forge-plan-report-fallback");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );

      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );

      assert.notEqual(planResult.code, 0);
      assert.match(planResult.stderr, /OUTPUT_ROOT_FALLBACK/);

      const artifact = await readJsonFile<{
        status: "ready" | "blocked" | "failed";
        summary: string;
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
      }>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));
      const overviewBody = sectionBody(report, "Overview").join("\n");
      const readinessBody = sectionBody(report, "Planning Readiness").join("\n");
      const failureBody = sectionBody(report, "Failure").join("\n");
      const summaryBody = sectionBody(report, "Summary").join("\n");

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.planning_diagnostics.usability_status, "upstream_blocked");
      assert.ok(
        artifact.planning_diagnostics.blocking_items.some((item) => item.code === "LOW_CONFIDENCE_ESCALATED"),
      );
      assert.equal(artifact.planning_diagnostics.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(artifact.planning_diagnostics.partial_output?.fallbackReason);
      assert.equal(artifact.planning_readiness.ready, false);
      assert.equal(artifact.planning_readiness.status, "blocked");
      assert.ok(
        artifact.planning_readiness.blocking_issues.some((issue) => issue.code === "LOW_CONFIDENCE_ESCALATED"),
      );
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(artifact.failure?.fallbackReason);
      assert.match(overviewBody, /Planning Readiness:\s+false/);
      assert.match(overviewBody, /Planning Usability:\s+upstream_blocked/);
      assert.match(overviewBody, /Planning Assist:\s+not_attempted/);
      assert.match(
        overviewBody,
        new RegExp(`Planning Readiness Status:\\s+${artifact.planning_readiness.status}`),
      );
      assert.match(readinessBody, /`forge verify` gate:\s+blocked\./);
      assert.match(readinessBody, /Status:\s+blocked/);
      assert.match(readinessBody, /Partial Output/);
      assert.match(readinessBody, /OUTPUT_ROOT_FALLBACK/);
      assert.match(failureBody, /OUTPUT_ROOT_FALLBACK/);
      assert.match(failureBody, /default \.forge output root|unsafe/i);
      assert.match(
        summaryBody,
        new RegExp(artifact.planning_readiness.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      assert.match(summaryBody, /default \.forge output root|unsafe/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
