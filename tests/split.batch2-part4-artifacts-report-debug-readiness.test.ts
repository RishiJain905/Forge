import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { createSplitReport } from "../src/split/report.js";
import type { SplitArtifact } from "../src/split/types.js";
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
  splitBlockedItemsPath,
  splitDebugArtifactPath,
  splitMergeOrderPath,
  splitReportPath,
  splitStreamConstraintsPath,
  splitWorkstreamsPath,
  writeRepoFile,
} from "./support/forge-cli.js";

const EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_verify",
  "source_plan",
  "workstream_contract",
  "workstreams",
  "dependency_edges",
  "merge_order",
  "blocked_items",
  "carried_forward_constraints",
  "split_diagnostics",
  "split_readiness",
  "failure",
] as const;

const EXPECTED_REPORT_HEADINGS = [
  "Overview",
  "Purpose",
  "Source Verify",
  "Source Plan",
  "Workstream Contract",
  "Workstreams",
  "Dependency Edges",
  "Merge Order",
  "Blocked Items",
  "Carried-Forward Constraints",
  "Split Diagnostics",
  "Split Readiness",
  "Boundary Notes",
  "Deferred Capabilities",
  "Allowed Side Effects",
  "Disallowed Capabilities",
  "Output Files",
  "Failure",
  "Summary",
] as const;

type SplitReadiness = SplitArtifact["split_readiness"] & {
  execution_scope: "all_streams" | "non_blocked_only" | "none";
  blocked_workstream_count: number;
  partially_blocked_item_count: number;
  merge_order_rule_count: number;
};

type SplitArtifactSnapshot = Omit<SplitArtifact, "split_readiness"> & {
  split_readiness: SplitReadiness;
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

function extractLevelTwoHeadings(report: string): string[] {
  return report
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", ""));
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

function assertReadinessCounts(
  artifact: SplitArtifactSnapshot,
  expectedExecutionScope: SplitReadiness["execution_scope"],
): void {
  const blockedWorkstreamCount = artifact.blocked_items.filter((item) => item.kind === "blocked_workstream").length;
  const partiallyBlockedItemCount = artifact.blocked_items.filter((item) => item.kind === "blocked_plan_item").length;

  assert.equal(artifact.split_readiness.execution_scope, expectedExecutionScope);
  assert.equal(artifact.split_readiness.blocked_workstream_count, blockedWorkstreamCount);
  assert.equal(artifact.split_readiness.partially_blocked_item_count, partiallyBlockedItemCount);
  assert.equal(artifact.split_readiness.merge_order_rule_count, artifact.merge_order.length);
}

function makePartiallyBlockedArtifact(baseArtifact: SplitArtifactSnapshot): SplitArtifactSnapshot {
  const blockedPlanItem = {
    id: "blocked:ws-safe:plan-blocked",
    kind: "blocked_plan_item" as const,
    code: "BLOCKED_PLAN_ITEM",
    message: "Grouped plan item stays blocked until its upstream blocker resolves.",
    workstreamId: "ws-safe",
    sourcePlanItemIds: ["plan-blocked"],
    sourceVerificationCaseIds: ["case-blocked"],
    sourceFindingIds: ["finding-blocked"],
    sourceConstraintIds: ["constraint-blocked"],
    sourceConcernIds: ["concern-blocked"],
    partialMetadataAvailable: true,
  };

  const blockedWorkstream = {
    id: "blocked:ws-blocked",
    kind: "blocked_workstream" as const,
    code: "BLOCKED_WORKSTREAM",
    message: "Blocked upstream evidence keeps this workstream out of active execution.",
    workstreamId: "ws-blocked",
    sourcePlanItemIds: ["plan-blocked"],
    sourceVerificationCaseIds: ["case-blocked"],
    sourceFindingIds: ["finding-blocked"],
    sourceConstraintIds: ["constraint-blocked"],
    sourceConcernIds: ["concern-blocked"],
    partialMetadataAvailable: true,
  };

  return {
    ...baseArtifact,
    status: "ready",
    blocked_items: [blockedPlanItem, blockedWorkstream],
    merge_order: [
      ...baseArtifact.merge_order,
      {
        id: "merge:ws-safe",
        workstreamId: "ws-safe",
        order: baseArtifact.merge_order.length + 1,
        ruleType: "dependency" as const,
        mustMergeAfterWorkstreamIds: [],
        reason: "Keep the source-before-test order visible inside the stream.",
        sourceDependencyIds: [],
        sourceConstraintIds: [],
        sourceConcernIds: [],
      },
    ],
    split_readiness: {
      ...baseArtifact.split_readiness,
      status: "ready_with_warnings",
      summary: "Forge split can proceed with warnings. All items were safely assigned, blocked streams remain visible, partially blocked items remain visible, merge-order constraints were imposed, and later execution must honor the carried-forward constraint detail.",
      execution_scope: "non_blocked_only",
      blocked_workstream_count: 1,
      partially_blocked_item_count: 1,
      merge_order_rule_count: baseArtifact.merge_order.length + 1,
      later_step_gate: "proceed_with_caution",
      material_execution_limits: [
        "blocked_workstreams_present",
        "partially_blocked_items_present",
        "merge_order_constraints_present",
        "warning_context_present",
      ],
    },
  };
}

await runScenario(
  "forge split keeps the frozen top-level keys and report heading order stable while exposing explicit readiness scope and count fields",
  async () => {
    const repoRoot = await createTempRepo("forge-split-stage5-ready-");

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

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot, { FORGE_SPLIT_DEBUG: "1" });
      assert.equal(result.code, 0, result.stderr);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitWorkstreamsPath(repoRoot)), true);
      assert.equal(await fileExists(splitMergeOrderPath(repoRoot)), true);
      assert.equal(await fileExists(splitBlockedItemsPath(repoRoot)), true);
      assert.equal(await fileExists(splitStreamConstraintsPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifactSnapshot>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));
      const debugArtifact = await readJsonFile<SplitArtifactSnapshot>(splitDebugArtifactPath(repoRoot));

      assert.deepEqual(Object.keys(artifact), [...EXPECTED_TOP_LEVEL_KEYS]);
      assert.deepEqual(extractLevelTwoHeadings(report), [...EXPECTED_REPORT_HEADINGS]);
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.split_readiness.execution_scope, "all_streams");
      assert.equal(artifact.split_readiness.blocked_workstream_count, 0);
      assert.equal(artifact.split_readiness.partially_blocked_item_count, 0);
      assert.equal(artifact.split_readiness.merge_order_rule_count, artifact.merge_order.length);
      assertReadinessCounts(artifact, "all_streams");
      assert.deepEqual(debugArtifact.split_readiness, artifact.split_readiness);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Execution Scope:/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Blocked Workstream Count:/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Partially Blocked Item Count:/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Merge-Order Rule Count:/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Later Execution Must Honor:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps blocked handoffs explicit and still reports execution scope and counts",
  async () => {
    const repoRoot = await createTempRepo("forge-split-stage5-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.notEqual(verifyResult.code, 0);

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot, { FORGE_SPLIT_DEBUG: "1" });
      assert.notEqual(result.code, 0);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifactSnapshot>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));
      const debugArtifact = await readJsonFile<SplitArtifactSnapshot>(splitDebugArtifactPath(repoRoot));

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.split_readiness.execution_scope, "none");
      assert.equal(artifact.split_readiness.blocked_workstream_count, artifact.blocked_items.filter((item) => item.kind === "blocked_workstream").length);
      assert.equal(artifact.split_readiness.partially_blocked_item_count, artifact.blocked_items.filter((item) => item.kind === "blocked_plan_item").length);
      assert.equal(artifact.split_readiness.merge_order_rule_count, artifact.merge_order.length);
      assertReadinessCounts(artifact, "none");
      assert.deepEqual(debugArtifact.split_readiness, artifact.split_readiness);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Execution Scope:\s+none/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Blocked Workstream Count:/i);
      assert.match(sectionBody(report, "Split Readiness").join("\n"), /Partially Blocked Item Count:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split report spells out partially blocked streams with explicit execution scope and counts",
  async () => {
    const repoRoot = await createTempRepo("forge-split-stage5-partial-");

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

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot, { FORGE_SPLIT_DEBUG: "1" });
      assert.equal(result.code, 0, result.stderr);

      const artifact = await readJsonFile<SplitArtifactSnapshot>(splitArtifactPath(repoRoot));
      const report = await readTextFile(splitReportPath(repoRoot));
      const partialArtifact = makePartiallyBlockedArtifact(artifact);
      const renderedReport = createSplitReport(partialArtifact);

      assert.match(sectionBody(renderedReport, "Split Readiness").join("\n"), /Execution Scope:/i);
      assert.match(sectionBody(renderedReport, "Split Readiness").join("\n"), /Blocked Workstream Count:/i);
      assert.match(sectionBody(renderedReport, "Split Readiness").join("\n"), /Partially Blocked Item Count:/i);
      assert.match(sectionBody(renderedReport, "Split Readiness").join("\n"), /Merge-Order Rule Count:/i);
      assert.match(sectionBody(renderedReport, "Blocked Items").join("\n"), /Kind: blocked_workstream/i);
      assert.match(sectionBody(renderedReport, "Blocked Items").join("\n"), /Kind: blocked_plan_item/i);
      assert.match(sectionBody(renderedReport, "Blocked Items").join("\n"), /Partial Metadata Available: true/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split keeps debug output secondary and mirrors readiness state on fallback-output-failed runs",
  async () => {
    const repoRoot = await createTempRepo("forge-split-stage5-fallback-");
    const blockedOutputDir = join("..", "forge-split-stage5-fallback-output");

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
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
        { FORGE_SPLIT_DEBUG: "1" },
      );

      assert.notEqual(result.code, 0);
      assertForgeSplitOutputHasNoReportHeadings(result);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(await fileExists(splitDebugArtifactPath(repoRoot)), true);

      const artifact = await readJsonFile<SplitArtifactSnapshot>(splitArtifactPath(repoRoot));
      const debugArtifact = await readJsonFile<SplitArtifactSnapshot>(splitDebugArtifactPath(repoRoot));

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(artifact.split_readiness.execution_scope, "all_streams");
      assertReadinessCounts(artifact, "all_streams");
      assertReadinessCounts(debugArtifact, "all_streams");
      assert.equal(debugArtifact.split_readiness.execution_scope, artifact.split_readiness.execution_scope);
      assert.equal(debugArtifact.split_readiness.blocked_workstream_count, artifact.split_readiness.blocked_workstream_count);
      assert.equal(debugArtifact.split_readiness.partially_blocked_item_count, artifact.split_readiness.partially_blocked_item_count);
      assert.equal(debugArtifact.split_readiness.merge_order_rule_count, artifact.split_readiness.merge_order_rule_count);
      assert.equal(debugArtifact.failure?.code, artifact.failure?.code);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
