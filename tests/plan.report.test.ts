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
  "forge plan report stays aligned with the artifact and renders empty planning sections honestly",
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
        planning_readiness: { ready: boolean };
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
        };
      }>(artifactPath);
      const report = await readTextFile(reportPath);
      const readinessBody = sectionBody(report, "Planning Readiness").join("\n");
      const carryForwardBody = sectionBody(report, "Carry-Forward Context").join("\n");

      assert.deepEqual(extractLevelTwoHeadings(report), [...REQUIRED_HEADINGS]);
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.ok(report.includes(artifact.source_intake.command));
      assert.ok(report.includes(artifact.source_intake.status));
      assert.ok(report.includes(artifact.source_intake.summary));
      assert.ok(report.includes(artifact.summary));
      assert.ok(report.includes(artifact.files.artifactPath ?? ""));
      assert.ok(report.includes(artifact.files.reportPath ?? ""));
      assert.ok(readinessBody.includes(String(artifact.planning_readiness.ready)));
      assert.ok(carryForwardBody.includes(artifact.carry_forward.task_spec.goal));
      assert.ok(carryForwardBody.includes(artifact.carry_forward.confidence.level));
      const carriedForwardEvidence =
        artifact.carry_forward.ambiguities[0] ?? artifact.carry_forward.warnings[0];

      assert.ok(carriedForwardEvidence);
      assert.ok(carryForwardBody.includes(carriedForwardEvidence));
      assert.deepEqual(sectionBody(report, "Plan Items"), ["- none"]);
      assert.deepEqual(sectionBody(report, "Dependencies"), ["- none"]);
      assert.deepEqual(sectionBody(report, "Conflict Zones"), ["- none"]);
      assert.deepEqual(sectionBody(report, "Test Obligations"), ["- none"]);
      assert.deepEqual(sectionBody(report, "Parallelization"), ["- none"]);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
