import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitBlockedItemsPath,
  splitMergeOrderPath,
  splitStreamConstraintsPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  merge_order: Array<{
    id: string;
    workstreamId: string;
    order: number;
    ruleType: string;
    mustMergeAfterWorkstreamIds: string[];
    sourceConstraintIds: string[];
  }>;
  blocked_items: Array<{
    id: string;
    kind: string;
    workstreamId: string | null;
    partialMetadataAvailable: boolean;
  }>;
  carried_forward_constraints: {
    stream_constraint_details: Array<{
      workstreamId: string;
      sourceDependencyIds: string[];
      sourceConflictZoneIds: string[];
      sourceVerificationTargetIds: string[];
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
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
  "forge split exposes explicit Part 4 merge-order and carried-forward constraint detail in artifact and debug output",
  async () => {
    const repoRoot = await createTempRepo("forge-split-part4-");

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
      const mergeOrderDebug = await readJsonFile<{ merge_order: SplitArtifact["merge_order"] }>(
        splitMergeOrderPath(repoRoot),
      );
      const blockedItemsDebug = await readJsonFile<{ blocked_items: SplitArtifact["blocked_items"] }>(
        splitBlockedItemsPath(repoRoot),
      );
      const streamConstraintsDebug = await readJsonFile<{
        stream_constraint_details: SplitArtifact["carried_forward_constraints"]["stream_constraint_details"];
      }>(splitStreamConstraintsPath(repoRoot));

      assert.ok(
        artifact.merge_order.every((entry) => entry.id.length > 0 && entry.ruleType.length > 0),
        "expected merge-order entries to be typed rule objects",
      );
      assert.ok(
        artifact.merge_order.every((entry) => Array.isArray(entry.mustMergeAfterWorkstreamIds)),
        "expected merge-order entries to expose explicit upstream dependencies",
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.length > 0,
        "expected public stream constraint detail in the artifact",
      );
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.every((detail) =>
          Array.isArray(detail.mergeOrderRuleIds) && Array.isArray(detail.blockedItemIds)
        ),
        "expected stream constraint detail to link merge-order and blocked-item ids",
      );

      assert.deepEqual(mergeOrderDebug.merge_order, artifact.merge_order);
      assert.deepEqual(blockedItemsDebug.blocked_items, artifact.blocked_items);
      assert.deepEqual(
        streamConstraintsDebug.stream_constraint_details,
        artifact.carried_forward_constraints.stream_constraint_details,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
