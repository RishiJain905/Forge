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
  splitReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

interface SplitArtifact {
  command: string;
  status: "ready" | "blocked" | "failed";
  summary: string;
  outputRoot: string;
  requestedOutputRoot: string | null;
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
  workstream_contract: {
    requiredFields: string[];
    categories: string[];
    constraintSources: string[];
  };
  workstreams: Array<{
    id: string;
    category: string;
  }>;
  dependency_edges: Array<Record<string, unknown>>;
  merge_order: Array<Record<string, unknown>>;
  blocked_items: Array<Record<string, unknown>>;
  split_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  split_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  failure: { code: string; message: string; fallbackReason?: string } | null;
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

async function readSplitArtifact(repoRoot: string, outputDir = ".forge"): Promise<SplitArtifact> {
  return readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot, outputDir));
}

await runScenario(
  "forge split rejects unsupported public flags and keeps the public surface limited to --repo and --output-dir",
  async () => {
    const repoRoot = await createTempRepo("forge-split-unsupported-flag-");

    try {
      const result = runForgeSplitBinary(
        ["--repo", repoRoot, "--output-dir", ".forge", "--json-only"],
        repoRoot,
      );

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /unknown (option|argument)/i);
      assert.doesNotMatch(result.stderr, /unknown command 'split'/i);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), false);
      assert.equal(await fileExists(splitReportPath(repoRoot)), false);
      assertForgeSplitOutputHasNoReportHeadings(result);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split writes ready outputs from a split-ready Step 3 handoff and keeps the CLI output minimal",
  async () => {
    const repoRoot = await createTempRepo("forge-split-ready-");

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
      assert.match(result.stdout, /Status:\s+ready/);
      assert.match(result.stdout, /Summary:/);
      assert.match(result.stdout, /Output root:/);
      assert.match(result.stdout, /Artifact:/);
      assert.match(result.stdout, /Report:/);
      assertForgeSplitOutputHasNoReportHeadings(result);

      const artifactPath = splitArtifactPath(repoRoot);
      const reportPath = splitReportPath(repoRoot);

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readSplitArtifact(repoRoot);
      assert.equal(artifact.command, "forge split");
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.equal(artifact.source_verify.artifactPath, join(repoRoot, ".forge", "verify.json"));
      assert.equal(artifact.source_verify.command, "forge verify");
      assert.equal(artifact.source_verify.readyForSplit, true);
      assert.equal(artifact.source_plan.artifactPath, join(repoRoot, ".forge", "plan.json"));
      assert.equal(artifact.source_plan.command, "forge plan");
      assert.equal(artifact.source_plan.readyForVerification, true);
      assert.ok(artifact.workstream_contract.requiredFields.includes("blockedReason"));
      assert.ok(artifact.workstream_contract.categories.includes("blocked"));
      assert.ok(artifact.workstream_contract.constraintSources.includes("verification_readiness"));
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(
        artifact.workstreams.every((workstream) =>
          artifact.workstream_contract.categories.includes(workstream.category),
        ),
      );
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.equal(artifact.split_diagnostics.usability_status, "actionable");
      assert.equal(artifact.split_readiness.ready, true);
      assert.equal(artifact.failure, null);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split preserves warning-heavy verify context while staying split-ready",
  async () => {
    const repoRoot = await createTempRepo("forge-split-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await removeUpstreamInputs(repoRoot);

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status:\s+ready/);
      assertForgeSplitOutputHasNoReportHeadings(result);

      const artifact = await readSplitArtifact(repoRoot);
      assert.equal(artifact.status, "ready");
      assert.ok(artifact.workstreams.length > 0);
      assert.equal(artifact.split_readiness.ready, true);
      assert.equal(artifact.split_readiness.status, "ready_with_warnings");
      assert.ok(artifact.split_diagnostics.warning_items.length > 0);
      assert.ok(artifact.split_readiness.warning_items.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split writes blocked outputs for an upstream-blocked Step 3 handoff",
  async () => {
    const repoRoot = await createTempRepo("forge-split-blocked-");

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

      const result = runForgeSplitBinary(["--repo", repoRoot], repoRoot);

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Status:\s+blocked/);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assertForgeSplitOutputHasNoReportHeadings(result);

      const artifact = await readSplitArtifact(repoRoot);
      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.split_diagnostics.usability_status, "upstream_blocked");
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.workstreams.every((workstream) => workstream.category === "blocked"));
      assert.equal(artifact.split_readiness.ready, false);
      assert.ok(artifact.split_diagnostics.blocking_items.length > 0);
      assert.ok(artifact.split_readiness.blocking_issues.length > 0);
      assert.ok(artifact.blocked_items.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge split handles missing and invalid verify artifacts without durable outputs",
  async () => {
    const missingRepoRoot = await createTempRepo("forge-split-missing-");
    const invalidRepoRoot = await createTempRepo("forge-split-invalid-");

    try {
      const missingResult = runForgeSplitBinary(["--repo", missingRepoRoot], missingRepoRoot);
      assert.notEqual(missingResult.code, 0);
      assert.match(missingResult.stderr, /SPLIT_INPUT_MISSING|verify\.json/i);
      assert.equal(await fileExists(splitArtifactPath(missingRepoRoot)), false);
      assert.equal(await fileExists(splitReportPath(missingRepoRoot)), false);
      assertForgeSplitOutputHasNoReportHeadings(missingResult);

      await writeRepoFile(
        invalidRepoRoot,
        ".forge/verify.json",
        JSON.stringify(
          {
            schemaVersion: "2.0.0",
            command: "forge verify",
          },
          null,
          2,
        ),
      );

      const invalidResult = runForgeSplitBinary(["--repo", invalidRepoRoot], invalidRepoRoot);
      assert.notEqual(invalidResult.code, 0);
      assert.match(invalidResult.stderr, /VERIFY_ARTIFACT_INVALID|invalid/i);
      assert.equal(await fileExists(splitArtifactPath(invalidRepoRoot)), false);
      assert.equal(await fileExists(splitReportPath(invalidRepoRoot)), false);
      assertForgeSplitOutputHasNoReportHeadings(invalidResult);
    } finally {
      await disposeTempRepo(missingRepoRoot);
      await disposeTempRepo(invalidRepoRoot);
    }
  },
);

await runScenario(
  "forge split honors a repo-internal custom output root and falls back safely for an unsafe output root",
  async () => {
    const safeRepoRoot = await createTempRepo("forge-split-custom-output-");
    const fallbackRepoRoot = await createTempRepo("forge-split-fallback-");
    const customOutputDir = "custom-forge";
    const blockedOutputDir = join("..", "forge-split-fallback-output");

    try {
      await seedSpecRepo(safeRepoRoot);

      const safeIntakeResult = runForgeBinary(
        ["intake", "--repo", safeRepoRoot, "--output-dir", customOutputDir, "--spec", join(safeRepoRoot, "task.md")],
        safeRepoRoot,
      );
      assert.equal(safeIntakeResult.code, 0, safeIntakeResult.stderr);

      const safePlanResult = runForgeBinary(
        ["plan", "--repo", safeRepoRoot, "--output-dir", customOutputDir],
        safeRepoRoot,
      );
      assert.equal(safePlanResult.code, 0, safePlanResult.stderr);

      const safeVerifyResult = runForgeBinary(
        ["verify", "--repo", safeRepoRoot, "--output-dir", customOutputDir],
        safeRepoRoot,
      );
      assert.equal(safeVerifyResult.code, 0, safeVerifyResult.stderr);

      await removeUpstreamInputs(safeRepoRoot);

      const safeSplitResult = runForgeSplitBinary(
        ["--repo", safeRepoRoot, "--output-dir", customOutputDir],
        safeRepoRoot,
      );

      assert.equal(safeSplitResult.code, 0, safeSplitResult.stderr);
      assert.equal(await fileExists(splitArtifactPath(safeRepoRoot, customOutputDir)), true);
      assert.equal(await fileExists(splitReportPath(safeRepoRoot, customOutputDir)), true);
      assert.equal(await fileExists(splitArtifactPath(safeRepoRoot)), false);
      assert.equal(await fileExists(splitReportPath(safeRepoRoot)), false);
      assertForgeSplitOutputHasNoReportHeadings(safeSplitResult);

      const safeArtifact = await readSplitArtifact(safeRepoRoot, customOutputDir);
      assert.equal(safeArtifact.outputRoot, join(safeRepoRoot, customOutputDir));
      assert.equal(safeArtifact.requestedOutputRoot, join(safeRepoRoot, customOutputDir));
      assert.equal(safeArtifact.source_verify.artifactPath, join(safeRepoRoot, customOutputDir, "verify.json"));
      assert.equal(safeArtifact.source_plan.artifactPath, join(safeRepoRoot, customOutputDir, "plan.json"));

      await seedSpecRepo(fallbackRepoRoot);

      const fallbackIntakeResult = runForgeBinary(
        ["intake", "--repo", fallbackRepoRoot, "--spec", join(fallbackRepoRoot, "task.md")],
        fallbackRepoRoot,
      );
      assert.equal(fallbackIntakeResult.code, 0, fallbackIntakeResult.stderr);

      const fallbackPlanResult = runForgeBinary(["plan", "--repo", fallbackRepoRoot], fallbackRepoRoot);
      assert.equal(fallbackPlanResult.code, 0, fallbackPlanResult.stderr);

      const fallbackVerifyResult = runForgeBinary(["verify", "--repo", fallbackRepoRoot], fallbackRepoRoot);
      assert.equal(fallbackVerifyResult.code, 0, fallbackVerifyResult.stderr);

      await removeUpstreamInputs(fallbackRepoRoot);

      const fallbackSplitResult = runForgeSplitBinary(
        ["--repo", fallbackRepoRoot, "--output-dir", blockedOutputDir],
        fallbackRepoRoot,
      );

      assert.notEqual(fallbackSplitResult.code, 0);
      assert.match(fallbackSplitResult.stderr, /OUTPUT_ROOT_FALLBACK/);
      assert.equal(await fileExists(splitArtifactPath(fallbackRepoRoot)), true);
      assert.equal(await fileExists(splitReportPath(fallbackRepoRoot)), true);
      assert.equal(await fileExists(splitArtifactPath(fallbackRepoRoot, blockedOutputDir)), false);
      assert.equal(await fileExists(splitReportPath(fallbackRepoRoot, blockedOutputDir)), false);
      assertForgeSplitOutputHasNoReportHeadings(fallbackSplitResult);

      const fallbackArtifact = await readSplitArtifact(fallbackRepoRoot);
      assert.equal(fallbackArtifact.outputRoot, join(fallbackRepoRoot, ".forge"));
      assert.equal(fallbackArtifact.requestedOutputRoot, join(fallbackRepoRoot, blockedOutputDir));
      assert.equal(fallbackArtifact.status, "failed");
      assert.equal(fallbackArtifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
    } finally {
      await disposeTempRepo(safeRepoRoot);
      await disposeTempRepo(fallbackRepoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
