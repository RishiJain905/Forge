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
  runForgePlanBinary,
  runForgeSplitBinary,
  runForgeVerifyBinary,
  splitArtifactPath,
  splitReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  failure: { code: string; message: string; fallbackReason?: string } | null;
  source_verify: {
    artifactPath: string;
    readyForSplit: boolean;
    verificationReadinessStatus: string;
  };
  source_plan: {
    artifactPath: string;
    readyForVerification: boolean;
  };
  workstreams: Array<{
    id: string;
    category: string;
    streamDependencies: string[];
    mergeOrderRequirements: string[];
    constraints: string[];
    blockedReason: string | null;
  }>;
  dependency_edges: Array<{ upstreamWorkstreamId: string; downstreamWorkstreamId: string; reason: string }>;
  merge_order: Array<{
    id: string;
    workstreamId: string;
    ruleType: string;
    mustMergeAfterWorkstreamIds: string[];
    sourceDependencyIds: string[];
    sourceConstraintIds: string[];
    sourceConcernIds: string[];
    reason: string;
  }>;
  blocked_items: Array<{
    id: string;
    kind: string;
    workstreamId: string | null;
    sourceConstraintIds: string[];
    sourceConcernIds: string[];
    partialMetadataAvailable: boolean;
  }>;
  carried_forward_constraints: {
    findings: Array<{ id: string; summary: string }>;
    constraints: Array<{ id: string; summary: string }>;
    plan_concerns: Array<{ id: string; message: string }>;
    stream_constraint_details: Array<{
      workstreamId: string;
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
      mergeOrder: {
        status: string;
        ruleKinds: string[];
      };
      blocking: {
        status: string;
      };
    }>;
  };
  split_diagnostics: {
    usability_status: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  split_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
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
  boundaryNotes: string[];
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

function sectionBody(report: string, heading: string): string[] {
  const lines = report.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = lines.indexOf(`## ${heading}`);

  if (startIndex === -1) {
    throw new Error(`Missing report heading: ${heading}`);
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertStep5HandoffSections(artifact: SplitArtifact, report: string): void {
  assert.ok(artifact.source_verify.artifactPath.length > 0);
  assert.ok(artifact.source_plan.artifactPath.length > 0);
  assert.ok(Array.isArray(artifact.workstreams));
  assert.ok(Array.isArray(artifact.dependency_edges));
  assert.ok(Array.isArray(artifact.merge_order));
  assert.ok(Array.isArray(artifact.blocked_items));
  assert.ok(Array.isArray(artifact.carried_forward_constraints.findings));
  assert.ok(Array.isArray(artifact.carried_forward_constraints.constraints));
  assert.ok(Array.isArray(artifact.carried_forward_constraints.plan_concerns));
  assert.ok(Array.isArray(artifact.carried_forward_constraints.stream_constraint_details));
  assert.equal(typeof artifact.split_readiness.ready, "boolean");
  assert.ok(Array.isArray(artifact.split_readiness.material_execution_limits));
  assert.ok(Array.isArray(artifact.split_readiness.recommended_user_actions));
  assert.ok(Array.isArray(artifact.boundaryNotes));
  assert.match(report, /## Source Verify/);
  assert.match(report, /## Source Plan/);
  assert.match(report, /## Workstreams/);
  assert.match(report, /## Merge Order/);
  assert.match(report, /## Blocked Items/);
  assert.match(report, /## Carried-Forward Constraints/);
  assert.match(report, /## Split Diagnostics/);
  assert.match(report, /## Split Readiness/);
  assert.match(report, /## Output Files/);
  assert.match(report, /Step 5 should consume split\.json directly instead of rebuilding workstreams from verify output\./);
}

async function loadPersistedOutputs(repoRoot: string, outputDir = ".forge"): Promise<{
  artifact: SplitArtifact;
  report: string;
}> {
  const artifactPath = splitArtifactPath(repoRoot, outputDir);
  const reportPath = splitReportPath(repoRoot, outputDir);

  assert.equal(await fileExists(artifactPath), true, "expected split artifact to be written");
  assert.equal(await fileExists(reportPath), true, "expected split report to be written");

  return {
    artifact: await readJsonFile<SplitArtifact>(artifactPath),
    report: await readTextFile(reportPath),
  };
}

await runScenario(
  "forge split exposes a full Step 5 handoff contract for grounded ready runs",
  async () => {
    const repoRoot = await createTempRepo("forge-split-step5-handoff-ready-");

    try {
      await seedSpecRepo(repoRoot);

      assert.equal(
        runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot).code,
        0,
      );
      assert.equal(runForgePlanBinary(["--repo", repoRoot], repoRoot).code, 0);
      assert.equal(runForgeVerifyBinary(["--repo", repoRoot], repoRoot).code, 0);
      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_verify.readyForSplit, true);
      assert.equal(artifact.source_plan.readyForVerification, true);
      assert.equal(artifact.split_readiness.ready, true);
      assert.ok(["ready", "ready_with_warnings"].includes(artifact.split_readiness.status));
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.ok(artifact.carried_forward_constraints.stream_constraint_details.length > 0);
      assert.ok(
        artifact.workstreams.some((workstream) =>
          workstream.streamDependencies.length > 0 || workstream.mergeOrderRequirements.length > 0 || workstream.constraints.length > 0,
        ),
      );
      assert.ok(
        artifact.merge_order.every((entry) =>
          entry.ruleType.length > 0 && entry.reason.length > 0 && Array.isArray(entry.mustMergeAfterWorkstreamIds),
        ),
      );
      assertStep5HandoffSections(artifact, report);
      assert.ok(artifact.boundaryNotes.some((entry) => /Step 5 should consume split\.json directly instead of rebuilding workstreams from verify output\./i.test(entry)));
      assert.match(readinessBody, /Forge Execute Gate:\s+can proceed/i);
      assert.ok(readinessBody.includes(artifact.split_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps warning-heavy Step 5 handoffs executable with explicit caution guidance",
  async () => {
    const repoRoot = await createTempRepo("forge-split-step5-handoff-warning-");

    try {
      assert.equal(runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot).code, 0);
      assert.equal(runForgePlanBinary(["--repo", repoRoot], repoRoot).code, 0);
      assert.equal(runForgeVerifyBinary(["--repo", repoRoot], repoRoot).code, 0);
      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.split_readiness.ready, true);
      assert.equal(artifact.split_readiness.status, "ready_with_warnings");
      assert.ok(artifact.split_readiness.warning_items.length > 0);
      assert.ok(artifact.split_readiness.recommended_user_actions.length > 0);
      assert.ok(artifact.split_readiness.material_execution_limits.length > 0);
      assertStep5HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Execute Gate:\s+can proceed with warnings/i);
      assert.ok(readinessBody.includes(artifact.split_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps blocked Step 5 handoffs diagnostically useful instead of forcing execute to rebuild split state",
  async () => {
    const repoRoot = await createTempRepo("forge-split-step5-handoff-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);
      assert.notEqual(runForgePlanBinary(["--repo", repoRoot], repoRoot).code, 0);
      assert.notEqual(runForgeVerifyBinary(["--repo", repoRoot], repoRoot).code, 0);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(splitResult.code, 0);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.split_readiness.ready, false);
      assert.equal(artifact.split_readiness.status, "blocked");
      assert.notEqual(artifact.split_diagnostics.usability_status, "actionable");
      assert.ok(artifact.split_readiness.blocking_issues.length > 0);
      assertStep5HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Execute Gate:\s+blocked/i);
      assert.ok(readinessBody.includes(artifact.split_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps failed fallback-output Step 5 handoffs diagnostically useful without pretending they are clean execute inputs",
  async () => {
    const repoRoot = await createTempRepo("forge-split-step5-handoff-fallback-");
    const blockedOutputDir = join("..", "forge-split-step5-handoff-fallback-output");

    try {
      await seedSpecRepo(repoRoot);

      assert.equal(
        runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot).code,
        0,
      );
      assert.equal(runForgePlanBinary(["--repo", repoRoot], repoRoot).code, 0);
      assert.equal(runForgeVerifyBinary(["--repo", repoRoot], repoRoot).code, 0);
      await removeUpstreamInputs(repoRoot);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot, "--output-dir", blockedOutputDir], repoRoot);
      assert.notEqual(splitResult.code, 0);
      assertForgeSplitOutputHasNoReportHeadings(splitResult);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");
      const failureBody = sectionBody(report, "Failure").join("\n");

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(artifact.requestedOutputRoot, join(repoRoot, blockedOutputDir));
      assert.equal(artifact.outputRoot, join(repoRoot, ".forge"));
      assertStep5HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Execute Gate:\s+diagnostics only/i);
      assert.match(failureBody, /OUTPUT_ROOT_FALLBACK/i);
      assert.ok(readinessBody.includes(artifact.split_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Step 4 Part 5 updates README, progress tracking, and the Step 5 handoff closeout doc",
  async () => {
    const readme = await readTextFile(join(process.cwd(), "README.md"));
    const progress = await readTextFile(join(process.cwd(), "progress.md"));
    const doneDoc = await readTextFile(join(process.cwd(), "docs", "S4-B3-Done", "p5-done.md"));

    assert.match(readme, /Step 4 Batch 3 Part 5/i);
    assert.match(readme, /Forge Execute Gate/i);
    assert.match(progress, /Batch 3\.05: `part-5-step5-handoff-contract-for-execute\.md` \(Step 4\)/i);
    assert.match(progress, /Step 4 Batch 3 Part 5 is complete/i);
    assert.match(progress, /Step 4 is complete for V1 and frozen except for future bug fixes/i);
    assert.match(progress, /Next major target: Step 6 integrate implementation work/i);
    assert.match(doneDoc, /Step 4 Batch 3 Part 5 Done Summary/i);
    assert.match(doneDoc, /Step 4 is complete for V1 and frozen except for future bug fixes/i);
    assert.match(doneDoc, /Step 5 should consume persisted Step 4 split outputs directly/i);
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
