import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitBlockedItemsPath,
  splitDebugArtifactPath,
  splitMergeOrderPath,
  splitReportPath,
  splitStreamConstraintsPath,
  splitWorkstreamsPath,
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

await runScenario(
  "forge split does not write split debug artifacts when FORGE_SPLIT_DEBUG is unset",
  async () => {
    const repoRoot = await createTempRepo("forge-split-debug-disabled-");

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

      const result = runForgeSplitBinary(
        ["--repo", repoRoot],
        repoRoot,
        { FORGE_SPLIT_DEBUG: null },
      );

      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), false);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), false);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), false);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split writes split debug artifacts when FORGE_SPLIT_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo("forge-split-debug-enabled-");

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

      const result = runForgeSplitBinary(
        ["--repo", repoRoot],
        repoRoot,
        { FORGE_SPLIT_DEBUG: "1" },
      );

      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), true);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), true);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), true);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), true);

      const splitArtifact = await readJsonFile<{
        workstream_contract: {
          categories: string[];
        };
      }>(splitArtifactPath(repoRoot));
      const workstreamsDebug = await readJsonFile<{ workstreams: Array<{ id: string; category: string }> }>(
        splitWorkstreamsPath(repoRoot),
      );
      const mergeOrderDebug = await readJsonFile<{
        merge_order: Array<{ id: string; ruleType: string; mustMergeAfterWorkstreamIds: string[] }>;
      }>(splitMergeOrderPath(repoRoot));
      const blockedItemsDebug = await readJsonFile<{
        blocked_items: Array<{ id: string; kind: string; partialMetadataAvailable: boolean }>;
      }>(splitBlockedItemsPath(repoRoot));
      const constraintsDebug = await readJsonFile<{
        stream_constraint_details: Array<{
          workstreamId: string;
          category: string;
          mergeOrderRuleIds: string[];
          blockedItemIds: string[];
        }>;
      }>(splitStreamConstraintsPath(repoRoot));

      assert.ok(workstreamsDebug.workstreams.length > 0);
      assert.ok(
        workstreamsDebug.workstreams.every((workstream) =>
          splitArtifact.workstream_contract.categories.includes(workstream.category),
        ),
      );
      assert.ok(workstreamsDebug.workstreams.some((workstream) => workstream.id.startsWith("ws-")));
      assert.ok(constraintsDebug.stream_constraint_details.length > 0);
      assert.ok(
        constraintsDebug.stream_constraint_details.some(
          (detail) => detail.workstreamId.startsWith("ws-"),
        ),
      );
      assert.ok(
        constraintsDebug.stream_constraint_details.every((detail) => detail.category.length > 0),
      );
      assert.ok(mergeOrderDebug.merge_order.every((entry) => entry.id.length > 0));
      assert.ok(mergeOrderDebug.merge_order.every((entry) => entry.ruleType.length > 0));
      assert.ok(
        mergeOrderDebug.merge_order.every((entry) => Array.isArray(entry.mustMergeAfterWorkstreamIds)),
      );
      assert.ok(
        blockedItemsDebug.blocked_items.every((item) =>
          item.id.length > 0 && item.kind.length > 0 && typeof item.partialMetadataAvailable === "boolean"
        ),
      );
      assert.ok(
        constraintsDebug.stream_constraint_details.every((detail) =>
          Array.isArray(detail.mergeOrderRuleIds) && Array.isArray(detail.blockedItemIds),
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
