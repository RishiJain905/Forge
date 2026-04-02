import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
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

interface SplitArtifact {
  command: string;
  stage: string;
  status: "ready" | "blocked" | "failed";
  workstream_contract: {
    requiredFields: string[];
    categories: string[];
    constraintSources: string[];
  };
  files: {
    artifactPath: string | null;
    reportPath: string | null;
    debugArtifactPath: string;
    debugWorkstreamsPath: string;
    debugMergeOrderPath: string;
    debugBlockedItemsPath: string;
    debugStreamConstraintsPath: string;
  };
  source_verify: {
    command: string;
  };
  source_plan: {
    command: string;
  };
  workstreams: Array<{
    id: string;
    category: string;
    blockedReason: string | null;
  }>;
  dependency_edges: Array<{
    upstreamWorkstreamId: string;
    downstreamWorkstreamId: string;
  }>;
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
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
    }>;
  };
  split_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
  };
  split_readiness: {
    status: "ready" | "ready_with_warnings" | "blocked";
  };
}

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
  "forge split artifact exposes the frozen top-level keys and public contract sections",
  async () => {
    const repoRoot = await createTempRepo("forge-split-artifact-schema-");

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

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(splitResult.code, 0, splitResult.stderr);

      const artifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));

      assert.deepEqual(Object.keys(artifact), [...EXPECTED_TOP_LEVEL_KEYS]);
      assert.equal(artifact.command, "forge split");
      assert.equal(artifact.stage, "step4");
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.source_verify.command, "forge verify");
      assert.equal(artifact.source_plan.command, "forge plan");
      assert.ok(artifact.workstream_contract.requiredFields.includes("blockedReason"));
      assert.ok(artifact.workstream_contract.categories.includes("blocked"));
      assert.ok(artifact.workstream_contract.constraintSources.includes("verification_readiness"));
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.workstreams.every((workstream) => workstream.id.startsWith("ws-")));
      assert.ok(artifact.workstreams.some((workstream) => workstream.blockedReason === null));
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.ok(artifact.merge_order.every((entry) => entry.id.length > 0));
      assert.ok(artifact.merge_order.every((entry) => entry.ruleType.length > 0));
      assert.ok(artifact.merge_order.every((entry) => Array.isArray(entry.mustMergeAfterWorkstreamIds)));
      assert.ok(artifact.merge_order.some((entry) => entry.sourceConstraintIds.length > 0));
      assert.ok(Array.isArray(artifact.blocked_items));
      assert.ok(
        artifact.blocked_items.every((item) => item.id.length > 0 && typeof item.partialMetadataAvailable === "boolean"),
      );
      assert.ok(artifact.carried_forward_constraints.stream_constraint_details.length > 0);
      assert.ok(
        artifact.carried_forward_constraints.stream_constraint_details.every((detail) =>
          Array.isArray(detail.mergeOrderRuleIds) && Array.isArray(detail.blockedItemIds),
        ),
      );
      assert.equal(artifact.split_diagnostics.usability_status, "actionable");
      assert.equal(artifact.split_readiness.status, "ready_with_warnings");
      assert.ok(artifact.files.debugArtifactPath.endsWith("split-debug.json"));
      assert.ok(artifact.files.debugWorkstreamsPath.endsWith("workstreams.json"));
      assert.ok(artifact.files.debugMergeOrderPath.endsWith("merge-order.json"));
      assert.ok(artifact.files.debugBlockedItemsPath.endsWith("blocked-items.json"));
      assert.ok(artifact.files.debugStreamConstraintsPath.endsWith("stream-constraints.json"));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
