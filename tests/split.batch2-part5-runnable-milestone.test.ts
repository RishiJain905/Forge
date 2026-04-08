import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

type SplitArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  source_verify: {
    artifactPath: string;
    command: string;
    readyForSplit: boolean;
    verificationReadinessStatus: string;
  };
  source_plan: {
    artifactPath: string;
    command: string;
    readyForVerification: boolean;
  };
  workstreams: Array<{
    id: string;
    category: string;
  }>;
  dependency_edges: Array<{
    upstreamWorkstreamId: string;
    downstreamWorkstreamId: string;
  }>;
  merge_order: Array<{
    id: string;
    workstreamId: string;
  }>;
  carried_forward_constraints: {
    stream_constraint_details: Array<{
      workstreamId: string;
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
    }>;
  };
  split_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    execution_scope: "all_streams" | "non_blocked_only" | "none";
    blocked_workstream_count: number;
    partially_blocked_item_count: number;
    merge_order_rule_count: number;
  };
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");

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

await runScenario(
  "default npm test must gate the shipped Step 4 Batch 2 Part 5 runnable-milestone suite",
  async () => {
    const packageJson = await readJsonFile<{ scripts?: { test?: string } }>(
      join(projectRoot, "package.json"),
    );
    const testScript = packageJson.scripts?.test;

    assert.equal(typeof testScript, "string");
    assert.match(testScript!, /split\.part5-readiness-and-first-build-order\.test\.js/);
    assert.match(testScript!, /split\.batch2-part4-artifacts-report-debug-readiness\.test\.js/);
    assert.match(testScript!, /split\.batch2-part5-runnable-milestone\.test\.js/);
  },
);

await runScenario(
  "forge split reaches the Step 4 Batch 2 runnable milestone through the packaged CLI",
  async () => {
    const repoRoot = await createTempRepo("forge-split-batch2-part5-");

    try {
      await seedRunnableMilestoneRepo(repoRoot);

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

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assert.match(splitResult.stdout, /Status:\s+ready/);
      assert.match(splitResult.stdout, /Summary:/);
      assert.match(splitResult.stdout, /Artifact:/);
      assert.match(splitResult.stdout, /Report:/);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const artifactPath = splitArtifactPath(repoRoot);
      const reportPath = splitReportPath(repoRoot);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<SplitArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.equal(artifact.source_verify.artifactPath, join(repoRoot, ".forge", "verify.json"));
      assert.equal(artifact.source_verify.command, "forge verify");
      assert.equal(artifact.source_verify.readyForSplit, true);
      assert.equal(artifact.source_plan.artifactPath, join(repoRoot, ".forge", "plan.json"));
      assert.equal(artifact.source_plan.command, "forge plan");
      assert.equal(artifact.source_plan.readyForVerification, true);
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.ok(artifact.carried_forward_constraints.stream_constraint_details.length > 0);
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.every(
          (detail) => detail.workstreamId.length > 0,
        ),
      );
      assert.equal(artifact.split_readiness.ready, true);
      assert.ok(["ready", "ready_with_warnings"].includes(artifact.split_readiness.status));
      assert.equal(artifact.split_readiness.execution_scope, "all_streams");
      assert.equal(artifact.split_readiness.blocked_workstream_count, 0);
      assert.equal(artifact.split_readiness.partially_blocked_item_count, 0);
      assert.equal(artifact.split_readiness.merge_order_rule_count, artifact.merge_order.length);
      assert.match(artifact.summary, /forge split can proceed/i);
      assert.match(report, /# Forge Split Report/);
      assert.match(report, /## Workstreams/);
      assert.match(report, /## Merge Order/);
      assert.match(report, /## Split Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
