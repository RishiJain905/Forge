import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitReportPath,
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

async function removeUpstreamInputs(repoRoot: string): Promise<void> {
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
  "## Source Verify",
  "## Source Plan",
  "## Workstream Contract",
  "## Workstreams",
  "## Dependency Edges",
  "## Merge Order",
  "## Blocked Items",
  "## Carried-Forward Constraints",
  "## Split Diagnostics",
  "## Split Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Failure",
  "## Summary",
] as const;

type SplitArtifact = {
  summary: string;
  outputRoot: string;
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  source_verify: {
    summary: string;
    command: string;
  };
  source_plan: {
    summary: string;
    command: string;
  };
  workstream_contract: {
    requiredFields: string[];
    categories: string[];
    constraintSources: string[];
  };
  carried_forward_constraints: {
    findings: Array<Record<string, unknown>>;
    constraints: Array<Record<string, unknown>>;
    plan_concerns: Array<Record<string, unknown>>;
    planning_readiness: {
      summary: string;
    };
    verification_readiness: {
      summary: string;
    };
  };
};

await runScenario(
  "forge split report stays aligned with the frozen section order and never leaks markdown into stdout or stderr",
  async () => {
    const repoRoot = await createTempRepo("forge-split-report-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot);

      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));

      assert.deepEqual(extractLevelTwoHeadings(report), [...REQUIRED_HEADINGS]);
      assert.ok(sectionBody(report, "Overview").join("\n").includes(artifact.outputRoot));
      assert.ok(sectionBody(report, "Overview").join("\n").includes(artifact.summary));
      assert.ok(report.includes(artifact.files.artifactPath ?? ""));
      assert.ok(report.includes(artifact.files.reportPath ?? ""));
      assert.ok(report.includes(artifact.source_verify.summary));
      assert.ok(report.includes(artifact.source_plan.summary));
      assert.ok(sectionBody(report, "Workstream Contract").join("\n").includes("blockedReason"));
      assert.ok(sectionBody(report, "Workstream Contract").join("\n").includes(artifact.workstream_contract.requiredFields[0] ?? ""));
      assert.ok(sectionBody(report, "Workstreams").length > 0);
      assert.ok(sectionBody(report, "Workstreams").join("\n").includes("Category:"));
      assert.ok(sectionBody(report, "Dependency Edges").length > 0);
      assert.ok(sectionBody(report, "Merge Order").length > 0);
      assert.doesNotMatch(report, /Part 2 keeps execution workstreams conservative/i);
      assert.doesNotMatch(report, /Part 2 keeps the actual regrouping output intentionally conservative/i);
      assert.ok(sectionBody(report, "Blocked Items").length > 0);
      assert.ok(
        sectionBody(report, "Carried-Forward Constraints").join("\n").includes(
          artifact.carried_forward_constraints.verification_readiness.summary,
        ),
      );
      assert.ok(sectionBody(report, "Split Diagnostics").length > 0);
      assert.ok(sectionBody(report, "Split Readiness").length > 0);
      assert.ok(sectionBody(report, "Boundary Notes").length > 0);
      assert.ok(sectionBody(report, "Deferred Capabilities").length > 0);
      assert.ok(sectionBody(report, "Allowed Side Effects").length > 0);
      assert.ok(sectionBody(report, "Disallowed Capabilities").length > 0);
      assert.ok(sectionBody(report, "Output Files").length > 0);
      assert.ok(sectionBody(report, "Failure").length > 0);
      assert.ok(sectionBody(report, "Summary").length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
