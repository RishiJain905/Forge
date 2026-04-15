import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitReportPath,
  splitStreamConstraintsPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  carried_forward_constraints: {
    stream_constraint_details: Array<{
      workstreamId: string;
      regrouping: {
        grouped: boolean;
        groupKind: string;
        rationale: string;
        preservedSourcePlanItemIds: string[];
        memberDetails: Array<{
          planItemId: string;
          blockedStatus: string;
        }>;
      };
      blocking: {
        status: string;
        blockedMemberPlanItemIds: string[];
        constrainingFindingIds: string[];
        constrainingConstraintIds: string[];
        constrainingConcernIds: string[];
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

await runScenario(
  "forge split exposes hardened Batch 3 Part 2 regrouping, blocking, and merge-order detail across artifact, debug, and report outputs",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-part2-");

    try {
      await seedSpecRepo(repoRoot);

      assert.equal(
        runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot).code,
        0,
      );
      assert.equal(runForgeBinary(["plan", "--repo", repoRoot], repoRoot).code, 0);
      assert.equal(runForgeBinary(["verify", "--repo", repoRoot], repoRoot).code, 0);

      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot, { FORGE_SPLIT_DEBUG: "1" });
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const streamConstraintsDebug = await readJsonFile<{
        stream_constraint_details: SplitArtifact["carried_forward_constraints"]["stream_constraint_details"];
      }>(splitStreamConstraintsPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));

      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.length > 0,
        "expected stream constraint details to be present",
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.every((detail) =>
          typeof detail.regrouping.grouped === "boolean" &&
          detail.regrouping.groupKind.length > 0 &&
          detail.regrouping.rationale.length > 0 &&
          Array.isArray(detail.regrouping.preservedSourcePlanItemIds) &&
          Array.isArray(detail.regrouping.memberDetails) &&
          detail.blocking.status.length > 0 &&
          Array.isArray(detail.blocking.blockedMemberPlanItemIds) &&
          Array.isArray(detail.blocking.constrainingFindingIds) &&
          Array.isArray(detail.blocking.constrainingConstraintIds) &&
          Array.isArray(detail.blocking.constrainingConcernIds) &&
          detail.mergeOrder.status.length > 0 &&
          Array.isArray(detail.mergeOrder.ruleKinds) &&
          Array.isArray(detail.mergeOrder.hardPrerequisiteWorkstreamIds) &&
          Array.isArray(detail.mergeOrder.sourceConstraintIds) &&
          Array.isArray(detail.mergeOrder.sourceConcernIds)
        ),
        "expected each stream constraint detail to expose structured regrouping, blocking, and merge-order detail",
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.some((detail) =>
          detail.regrouping.grouped &&
          detail.regrouping.groupKind === "direct_dependency_test_pair" &&
          detail.regrouping.preservedSourcePlanItemIds.length > 1 &&
          detail.regrouping.memberDetails.length > 1
        ),
        "expected at least one grouped direct source/test pair with member-level traceability",
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.some((detail) =>
          detail.mergeOrder.status === "constrained" && detail.mergeOrder.ruleKinds.length > 0
        ),
        "expected at least one constrained merge-order detail entry",
      );
      assert.deepEqual(
        streamConstraintsDebug.stream_constraint_details,
        artifact.carried_forward_constraints.stream_constraint_details,
      );
      assert.match(report, /Regrouping Kind:/i);
      assert.match(report, /Blocking Status:/i);
      assert.match(report, /Merge-Order Status:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
