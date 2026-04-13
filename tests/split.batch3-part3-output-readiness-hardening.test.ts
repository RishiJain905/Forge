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
  splitDebugArtifactPath,
  splitReadinessPath,
  splitReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  files: {
    debugArtifactPath: string;
    debugReadinessPath: string;
  };
  split_diagnostics: {
    usability_status: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  split_readiness: {
    ready: boolean;
    status: string;
    summary: string;
    execution_scope: string;
    blocked_workstream_count: number;
    partially_blocked_item_count: number;
    merge_order_rule_count: number;
    later_step_gate: string;
    material_execution_limits: string[];
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
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
  "forge split emits a dedicated split-readiness debug artifact and keeps readiness gating explicit in artifact and report",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-part3-ready-");

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

      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReadinessPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const debugReadiness = await readJsonFile<{
        split_diagnostics: SplitArtifact["split_diagnostics"];
        split_readiness: SplitArtifact["split_readiness"];
      }>(splitReadinessPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));

      assert.ok(artifact.files.debugReadinessPath.endsWith("split-readiness.json"));
      assert.equal(artifact.files.debugReadinessPath, splitReadinessPath(repoRoot));
      assert.equal(artifact.split_readiness.later_step_gate, "proceed_with_caution");
      assert.ok(artifact.split_readiness.material_execution_limits.includes("merge_order_constraints_present"));
      assert.deepEqual(debugReadiness.split_diagnostics, artifact.split_diagnostics);
      assert.deepEqual(debugReadiness.split_readiness, artifact.split_readiness);
      assert.match(report, /Later-Step Gate:/i);
      assert.match(report, /Material Execution Limits:/i);
      assert.match(report, /Debug Split Readiness Path:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps blocked and fallback-output runs diagnostically useful through the dedicated split-readiness debug artifact",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-part3-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);
      assert.notEqual(runForgeBinary(["plan", "--repo", repoRoot], repoRoot).code, 0);
      assert.notEqual(runForgeBinary(["verify", "--repo", repoRoot], repoRoot).code, 0);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot, { FORGE_SPLIT_DEBUG: "1" });
      assert.notEqual(splitResult.code, 0);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReadinessPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const debugReadiness = await readJsonFile<{
        split_diagnostics: SplitArtifact["split_diagnostics"];
        split_readiness: SplitArtifact["split_readiness"];
      }>(splitReadinessPath(repoRoot));

      assert.equal(artifact.split_readiness.later_step_gate, "blocked");
      assert.ok(artifact.split_readiness.material_execution_limits.includes("upstream_blockers_present"));
      assert.deepEqual(debugReadiness.split_diagnostics, artifact.split_diagnostics);
      assert.deepEqual(debugReadiness.split_readiness, artifact.split_readiness);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
