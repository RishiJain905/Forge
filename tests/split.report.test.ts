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
    stream_constraint_details: Array<{
      workstreamId: string;
      baseCategory: string;
      categoryReasons: string[];
      mergeOrderReasons: string[];
      blockingReasons: string[];
      warningNotes: string[];
      mitigationSummaries: string[];
      blockedUpstreamWorkstreamIds: string[];
      blockedPlanItemIds: string[];
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
      regrouping: {
        grouped: boolean;
        groupKind: string;
        rationale: string;
        preservedSourcePlanItemIds: string[];
        memberDetails: Array<{
          planItemId: string;
          blockedStatus: string;
          blockedReason: string | null;
          sourceConstraintIds: string[];
          sourceConcernIds: string[];
        }>;
      };
      blocking: {
        status: string;
        blockedMemberPlanItemIds: string[];
        blockedUpstreamWorkstreamIds: string[];
        constrainingFindingIds: string[];
        constrainingConstraintIds: string[];
        constrainingConcernIds: string[];
        canProceedWithConstraints: boolean;
        requiresResolutionBeforeExecution: boolean;
      };
      mergeOrder: {
        status: string;
        ruleKinds: string[];
        hardPrerequisiteWorkstreamIds: string[];
        sourceConstraintIds: string[];
        sourceConcernIds: string[];
      };
    }>;
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
      assert.ok(sectionBody(report, "Merge Order").join("\n").includes("Rule Type:"));
      assert.doesNotMatch(report, /Part 2 keeps execution workstreams conservative/i);
      assert.doesNotMatch(report, /Part 2 keeps the actual regrouping output intentionally conservative/i);
      assert.ok(sectionBody(report, "Blocked Items").length > 0);
      if (/Kind:/.test(sectionBody(report, "Blocked Items").join("\n"))) {
        assert.ok(sectionBody(report, "Blocked Items").join("\n").includes("Kind:"));
      } else {
        assert.ok(sectionBody(report, "Blocked Items").join("\n").includes("- none"));
      }
      assert.ok(
        sectionBody(report, "Carried-Forward Constraints").join("\n").includes(
          artifact.carried_forward_constraints.verification_readiness.summary,
        ),
      );
      assert.ok(
        sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Stream Constraint Details"),
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.every((detail) =>
          detail.baseCategory.length > 0 &&
          Array.isArray(detail.categoryReasons) &&
          Array.isArray(detail.mergeOrderReasons) &&
          Array.isArray(detail.blockingReasons) &&
          Array.isArray(detail.warningNotes) &&
          Array.isArray(detail.mitigationSummaries) &&
          Array.isArray(detail.blockedUpstreamWorkstreamIds) &&
          Array.isArray(detail.blockedPlanItemIds) &&
          Array.isArray(detail.mergeOrderRuleIds) &&
          Array.isArray(detail.blockedItemIds) &&
          typeof detail.regrouping?.grouped === "boolean" &&
          detail.regrouping.groupKind.length > 0 &&
          detail.regrouping.rationale.length > 0 &&
          Array.isArray(detail.regrouping.preservedSourcePlanItemIds) &&
          Array.isArray(detail.regrouping.memberDetails) &&
          detail.blocking.status.length > 0 &&
          Array.isArray(detail.blocking.blockedMemberPlanItemIds) &&
          Array.isArray(detail.blocking.blockedUpstreamWorkstreamIds) &&
          Array.isArray(detail.blocking.constrainingFindingIds) &&
          Array.isArray(detail.blocking.constrainingConstraintIds) &&
          Array.isArray(detail.blocking.constrainingConcernIds) &&
          typeof detail.blocking.canProceedWithConstraints === "boolean" &&
          typeof detail.blocking.requiresResolutionBeforeExecution === "boolean" &&
          detail.mergeOrder.status.length > 0 &&
          Array.isArray(detail.mergeOrder.ruleKinds) &&
          Array.isArray(detail.mergeOrder.hardPrerequisiteWorkstreamIds) &&
          Array.isArray(detail.mergeOrder.sourceConstraintIds) &&
          Array.isArray(detail.mergeOrder.sourceConcernIds),
        ),
      );
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Base Category:"));
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Category Reasons:"));
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Blocked Plan Item IDs:"));
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Regrouping Kind:"));
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Blocking Status:"));
      assert.ok(sectionBody(report, "Carried-Forward Constraints").join("\n").includes("Merge-Order Status:"));
      assert.ok(sectionBody(report, "Split Diagnostics").length > 0);
      assert.ok(sectionBody(report, "Split Diagnostics").join("\n").includes("split_diagnostics explains the warning, blocking, and partial-output context"));
      assert.ok(sectionBody(report, "Split Readiness").length > 0);
      assert.ok(sectionBody(report, "Overview").join("\n").includes("Later-Step Gate:"));
      assert.ok(sectionBody(report, "Overview").join("\n").includes("Execution Scope:"));
      assert.ok(sectionBody(report, "Overview").join("\n").includes("V1 Freeze State: bug-fix-only maintenance mode"));
      assert.ok(sectionBody(report, "Split Readiness").join("\n").includes("Forge Execute Gate:"));
      assert.ok(sectionBody(report, "Split Readiness").join("\n").includes("Later-Step Gate:"));
      assert.ok(sectionBody(report, "Split Readiness").join("\n").includes("Material Execution Limits:"));
      assert.ok(sectionBody(report, "Split Readiness").join("\n").includes("split_readiness is the authoritative later-step gate"));
      assert.ok(sectionBody(report, "Output Files").join("\n").includes("split.json and reports/split-report.md remain the authoritative Step 4 outputs."));
      assert.ok(sectionBody(report, "Output Files").join("\n").includes("Debug files are optional internal mirrors and never replace the durable Step 4 outputs."));
      assert.ok(sectionBody(report, "Output Files").join("\n").includes("Debug Split Readiness Path:"));
      assert.ok(sectionBody(report, "Boundary Notes").length > 0);
      assert.ok(sectionBody(report, "Boundary Notes").join("\n").includes("Step 4 is frozen for V1 except for future bug fixes."));
      assert.ok(sectionBody(report, "Boundary Notes").join("\n").includes("Only bug-fix work should remain in Step 4; future feature work belongs in the Step 5 handoff and later stages."));
      assert.ok(sectionBody(report, "Boundary Notes").join("\n").includes("Step 5 should consume split.json directly instead of rebuilding workstreams from verify output."));
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
