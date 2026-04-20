import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import type { SplitArtifact } from "../src/split/types.js";
import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeSplitBinary,
  runForgeVerifyBinary,
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

async function seedRunnableMilestoneRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Stabilize the shared runtime workflow",
      "",
      "Revise `src/worker.ts`, `src/runtime.ts`, and `tests/runtime.test.ts` together.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/worker.ts` keeps ownership behavior aligned",
      "- `src/runtime.ts` preserves dependency ordering",
      "- `tests/runtime.test.ts` stays aligned with the shipped behavior",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/worker.ts",
    [
      "export function claimOwnership() {",
      "  return 'claimed';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/runtime.ts",
    [
      "export function runRuntime() {",
      "  return 'ready';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "tests/runtime.test.ts",
    [
      "import assert from 'node:assert/strict';",
      "",
      "assert.equal(1, 1);",
    ].join("\n"),
  );
}

async function removeUpstreamInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "src", "runtime.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "tests", "runtime.test.ts"), { force: true });
}

function normalizeSplitArtifact(artifact: SplitArtifact): Omit<SplitArtifact, "startedAt" | "finishedAt"> {
  const {
    startedAt,
    finishedAt,
    ...stableArtifact
  } = artifact;

  void startedAt;
  void finishedAt;

  return stableArtifact;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function assertNoStep4Markers(): Promise<void> {
  const repoRoot = process.cwd();
  const runtimeFiles = await collectFiles(join(repoRoot, "src", "split"));
  const testFiles = await collectFiles(join(repoRoot, "tests"));
  const scannedFiles = [
    ...runtimeFiles,
    ...testFiles.filter((filePath) => /split\./i.test(filePath)),
    join(repoRoot, "README.md"),
    join(repoRoot, "scripts", "smoke.mjs"),
  ];
  const offenders: string[] = [];
  const freezeMarkerPattern = new RegExp(["TO" + "DO", "FIX" + "ME", "XX" + "X"].join("|"));

  for (const filePath of scannedFiles) {
    const contents = await readTextFile(filePath);
    const lines = contents.split("\n");
    const hasUnresolvedMarker = lines.some((line) => {
      if (!freezeMarkerPattern.test(line)) {
        return false;
      }

      return !/no blocking .*TODO\/FIXME\/XXX|`TODO`|`FIXME`|`XXX`|marker sweep/i.test(line);
    });

    if (hasUnresolvedMarker) {
      offenders.push(filePath);
    }
  }

  assert.deepEqual(offenders, [], `unexpected freeze markers found in Step 4 surface: ${offenders.join(", ")}`);
}

await runScenario(
  "forge split satisfies the Batch 3 Part 1 finish line for a grounded persisted run",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-freeze-ready-");

    try {
      await seedRunnableMilestoneRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));
      const readme = await readTextFile(join(process.cwd(), "README.md"));
      const progress = await readTextFile(join(process.cwd(), "progress.md"));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.command, "forge split");
      assert.equal(artifact.files.artifactPath, splitArtifactPath(repoRoot));
      assert.equal(artifact.files.reportPath, splitReportPath(repoRoot));
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.ok(artifact.carried_forward_constraints.stream_constraint_details.length > 0);
      assert.equal(artifact.split_readiness.ready, true);
      assert.equal(artifact.split_readiness.execution_scope, "all_streams");
      assert.equal(artifact.split_readiness.blocked_workstream_count, 0);
      assert.equal(artifact.split_readiness.partially_blocked_item_count, 0);
      assert.equal(artifact.split_readiness.merge_order_rule_count, artifact.merge_order.length);
      assert.ok(artifact.boundaryNotes.some((entry) => /finish-and-freeze pass/i.test(entry)));
      assert.ok(artifact.boundaryNotes.some((entry) => /Step 5 can consume stable split outputs without guesswork/i.test(entry)));
      assert.ok(artifact.boundaryNotes.some((entry) => /Step 4 is frozen for V1 except for future bug fixes/i.test(entry)));
      assert.match(report, /V1-complete split stage/i);
      assert.match(report, /future bug fixes/i);
      assert.match(report, /split\.json and reports\/split-report\.md are the durable Step 4 outputs\./i);
      assert.match(report, /split\.json and reports\/split-report\.md remain the authoritative Step 4 outputs\./i);
      assert.match(report, /Debug files are optional internal mirrors and never replace the durable Step 4 outputs\./i);
      assert.match(report, /Later Execution Must Honor:/i);
      assert.doesNotMatch(report, /Batch 2/i);
      assert.match(readme, /Step 4 Batch 3 Part 4/i);
      assert.match(readme, /bug-fix-only maintenance mode/i);
      assert.match(progress, /Batch 3\.04: `part-4-step4-polish-test-hardening-and-freeze-criteria\.md` \(Step 4\)/i);
      assert.match(progress, /Step 4 Batch 3 Part 4 is complete/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps warning-heavy but usable runs coherent under the Batch 3 Part 1 finish line",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-freeze-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.split_readiness.ready, true);
      assert.equal(artifact.split_readiness.status, "ready_with_warnings");
      assert.ok(artifact.split_readiness.warning_items.length > 0);
      assert.ok(artifact.split_diagnostics.warning_items.length > 0);
      assert.ok(artifact.workstreams.length > 0);
      assert.match(report, /Split Readiness Status:\s+ready_with_warnings/i);
      assert.match(report, /Warning Items:\s+\d+/i);
      assert.match(report, /Execution Scope:\s+all_streams/i);
      assert.match(report, /## Split Diagnostics/);
      assert.match(report, /## Split Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split stays deterministic across repeated warning-heavy runs and keeps freeze markers out of the Step 4 surface",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-freeze-repeat-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const firstRun = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(firstRun.code, 0, firstRun.stderr);
      const firstArtifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const firstReport = await readTextFile(splitReportPath(repoRoot));

      const secondRun = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(secondRun.code, 0, secondRun.stderr);
      const secondArtifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const secondReport = await readTextFile(splitReportPath(repoRoot));

      assert.equal(firstArtifact.split_readiness.status, "ready_with_warnings");
      assert.deepEqual(normalizeSplitArtifact(firstArtifact), normalizeSplitArtifact(secondArtifact));
      assert.equal(firstReport, secondReport);
      await assertNoStep4Markers();

      const readme = await readTextFile(join(process.cwd(), "README.md"));
      const progress = await readTextFile(join(process.cwd(), "progress.md"));
      assert.match(readme, /Step 4 Batch 3 Part 4/i);
      assert.match(progress, /Step 4 Batch 3 Part 1 is complete/i);
      assert.match(progress, /Step 4 Batch 3 Part 2 is complete/i);
      assert.match(progress, /Step 4 Batch 3 Part 3 is complete/i);
      assert.match(progress, /Step 4 Batch 3 Part 4 is complete/i);
      assert.match(progress, /Step 4 Batch 3 Part 5 is complete/i);
      assert.match(progress, /Step 4 Batch 3 is complete/i);
      assert.match(progress, /Step 4 is complete for V1 and frozen except for future bug fixes/i);
      assert.match(progress, /Step 6 Batch 3 is complete and Step 6 integrate is frozen for V1/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps debug outputs usable under FORGE_SPLIT_DEBUG=1 during the Batch 3 Part 1 freeze pass",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-freeze-debug-");

    try {
      await seedRunnableMilestoneRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot, {
        FORGE_SPLIT_DEBUG: "1",
      });
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));
      const debugArtifact = await readJsonFile<SplitArtifact>(splitDebugArtifactPath(repoRoot));
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
        stream_constraint_details: Array<{ workstreamId: string; category: string; mergeOrderRuleIds: string[]; blockedItemIds: string[] }>;
      }>(splitStreamConstraintsPath(repoRoot));

      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), true);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), true);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), true);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), true);
      assert.deepEqual(debugArtifact.split_readiness, artifact.split_readiness);
      assert.ok(workstreamsDebug.workstreams.length > 0);
      assert.ok(workstreamsDebug.workstreams.every((workstream) => workstream.id.startsWith("ws-")));
      assert.ok(mergeOrderDebug.merge_order.length > 0);
      assert.ok(mergeOrderDebug.merge_order.every((entry) => entry.id.length > 0 && entry.ruleType.length > 0));
      assert.ok(
        blockedItemsDebug.blocked_items.every((item) =>
          item.id.length > 0 && item.kind.length > 0 && typeof item.partialMetadataAvailable === "boolean",
        ),
      );
      assert.ok(constraintsDebug.stream_constraint_details.length > 0);
      assert.ok(
        constraintsDebug.stream_constraint_details.every((detail) =>
          detail.workstreamId.length > 0 && detail.category.length > 0,
        ),
      );
      assert.match(report, /Debug files are optional internal mirrors and are only written when FORGE_SPLIT_DEBUG=1/i);
      assert.match(report, new RegExp(artifact.files.debugArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(report, /split-debug\.json/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
