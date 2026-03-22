import assert from "node:assert/strict";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgeCli,
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

function assertStep2HandoffSections(artifact: IntakeArtifact, report: string): void {
  assert.ok(artifact.source_inputs, "expected source inputs for Step 2 handoff");
  assert.ok(artifact.task_spec.goal.length > 0, "expected normalized task goal");
  assert.ok(typeof artifact.repo_context.layout_summary === "string");
  assert.ok(Array.isArray(artifact.candidate_targets));
  assert.ok(Array.isArray(artifact.risk_analysis.initial_risk_zones));
  assert.ok(Array.isArray(artifact.ambiguities));
  assert.ok(Array.isArray(artifact.warnings));
  assert.ok(Array.isArray(artifact.initial_verification_targets));
  assert.ok(["high", "medium", "low"].includes(artifact.confidence.level));
  assert.equal(typeof artifact.next_step_readiness.ready, "boolean");
  assert.ok(Array.isArray(artifact.next_step_readiness.blocking_issues));
  assert.equal(typeof artifact.summary, "string");
  assert.match(report, /## Source Inputs/);
  assert.match(report, /## Task Spec/);
  assert.match(report, /## Repo Context/);
  assert.match(report, /## Candidate Targets/);
  assert.match(report, /## Risk Analysis/);
  assert.match(report, /## Initial Verification Targets/);
  assert.match(report, /## Confidence/);
  assert.match(report, /## Next Step Readiness/);
  assert.match(report, /## Failure/);
  assert.match(report, /## Summary/);
}

async function loadPersistedOutputs(repoRoot: string): Promise<{
  artifact: IntakeArtifact;
  report: string;
}> {
  const artifactPath = join(repoRoot, ".forge", "intake.json");
  const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

  assert.equal(await fileExists(artifactPath), true, "expected intake artifact to be written");
  assert.equal(await fileExists(reportPath), true, "expected intake report to be written");

  return {
    artifact: await readJsonFile<IntakeArtifact>(artifactPath),
    report: await readTextFile(reportPath),
  };
}

await runScenario(
  "forge intake exposes a full planning-ready handoff for grounded spec runs",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
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

      const result = await runForgeCli(["intake", "--repo", repoRoot, "--spec", specPath], repoRoot);
      assert.equal(result.code, 0, result.stderr);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);

      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "spec");
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.equal(artifact.failure, null);
      assert.match(artifact.summary, /ready for forge plan/i);
      assertStep2HandoffSections(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake keeps prompt warning handoffs plan-eligible with visible ambiguity context",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts and keep tests aligned, but the exact acceptance criteria are still open.",
        ],
        repoRoot,
      );
      assert.equal(result.code, 0, result.stderr);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);

      assert.equal(artifact.status, "warning");
      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.ok(artifact.ambiguities.length > 0);
      assert.ok(artifact.warnings.length > 0);
      assert.match(
        report,
        /ready for `forge plan`, but warnings and ambiguities should remain visible during planning\./i,
      );
      assertStep2HandoffSections(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake keeps failed-but-persisted handoffs diagnostically useful when planning is blocked",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = runForgeBinary(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "fix",
          "--fail-on-low-confidence",
        ],
        repoRoot,
      );
      assert.equal(result.code, 1);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.next_step_readiness.ready, false);
      assert.equal(artifact.failure?.code, "LOW_CONFIDENCE_ESCALATED");
      assert.ok(artifact.candidate_targets.length > 0);
      assert.ok(artifact.initial_verification_targets.length > 0);
      assert.match(
        report,
        /artifact sections below still capture the last normalized task, repo context, candidate targets, risks, and recommended actions for diagnosis\./i,
      );
      assertStep2HandoffSections(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake keeps low-confidence fallback handoffs informative without blocking planning by default",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "fix",
        ],
        repoRoot,
      );
      assert.equal(result.code, 0, result.stderr);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);

      assert.equal(artifact.status, "warning");
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.equal(artifact.confidence.level, "low");
      assert.ok(artifact.candidate_targets.some((item) => item.match_type === "fallback"));
      assert.match(
        report,
        /ready for `forge plan`, but the handoff should be treated as provisional because confidence is low\./i,
      );
      assertStep2HandoffSections(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake blocks planning on low-confidence escalation with an explicit blocking issue",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "fix",
          "--fail-on-low-confidence",
        ],
        repoRoot,
      );
      assert.equal(result.code, 1);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.next_step_readiness.ready, false);
      assert.ok(
        artifact.next_step_readiness.blocking_issues.some((issue) => issue.code === "LOW_CONFIDENCE_ESCALATED"),
      );
      assert.match(report, /LOW_CONFIDENCE_ESCALATED/);
      assert.match(artifact.summary, /not ready for forge plan/i);
      assertStep2HandoffSections(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
