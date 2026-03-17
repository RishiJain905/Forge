import assert from "node:assert/strict";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeCli,
  writeRepoFile,
} from "./support/forge-cli.js";

const STEP1_SUCCESS_CHECKLIST = [
  "spec mode works",
  "prompt mode works",
  "repo context is usable",
  "artifact is written",
  "report is written",
  "readiness is present",
  "confidence is present",
  "ambiguity is persisted",
] as const;

type Step1SuccessChecklistLabel = (typeof STEP1_SUCCESS_CHECKLIST)[number];

function collectStep1SuccessCriteriaFailures(input: {
  artifact: IntakeArtifact;
  report: string;
  expectedInputMode: "spec" | "prompt";
  expectPersistedAmbiguity: boolean;
}): Step1SuccessChecklistLabel[] {
  const failures: Step1SuccessChecklistLabel[] = [];

  if (input.expectedInputMode === "spec" && input.artifact.input_mode !== "spec") {
    failures.push("spec mode works");
  }

  if (input.expectedInputMode === "prompt" && input.artifact.input_mode !== "prompt") {
    failures.push("prompt mode works");
  }

  if (
    !input.artifact.repo_context.grounded ||
    input.artifact.repo_context.source_files.length +
      input.artifact.repo_context.test_files.length +
      input.artifact.repo_context.manifest_files.length ===
      0
  ) {
    failures.push("repo context is usable");
  }

  if (!input.artifact.files.artifactPath) {
    failures.push("artifact is written");
  }

  if (!input.artifact.files.reportPath || input.report.trim().length === 0) {
    failures.push("report is written");
  }

  if (
    typeof input.artifact.next_step_readiness.ready !== "boolean" ||
    !Array.isArray(input.artifact.next_step_readiness.blocking_issues)
  ) {
    failures.push("readiness is present");
  }

  if (
    !["high", "medium", "low"].includes(input.artifact.confidence.level) ||
    !Array.isArray(input.artifact.confidence.reasons)
  ) {
    failures.push("confidence is present");
  }

  if (input.expectPersistedAmbiguity && input.artifact.ambiguities.length === 0) {
    failures.push("ambiguity is persisted");
  }

  return failures;
}

function assertNoChecklistFailures(
  scenarioName: string,
  failures: Step1SuccessChecklistLabel[],
): void {
  assert.deepEqual(
    failures,
    [],
    `${scenarioName} failed checklist items: ${failures.join(", ")}`,
  );
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

async function loadRunArtifacts(repoRoot: string): Promise<{
  artifact: IntakeArtifact;
  report: string;
  artifactPath: string;
  reportPath: string;
}> {
  const artifactPath = join(repoRoot, ".forge", "intake.json");
  const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

  assert.equal(await fileExists(artifactPath), true, "expected intake artifact to be written");
  assert.equal(await fileExists(reportPath), true, "expected intake report to be written");

  return {
    artifact: await readJsonFile<IntakeArtifact>(artifactPath),
    report: await readTextFile(reportPath),
    artifactPath,
    reportPath,
  };
}

await runScenario(
  "forge intake satisfies the Step 1 checklist for a grounded spec with explicit targets",
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

      const { artifact, report, artifactPath, reportPath } = await loadRunArtifacts(repoRoot);
      assert.equal(artifact.input_mode, "spec");
      assert.equal(artifact.repo_context.grounded, true);
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.ok(artifact.confidence.level.length > 0);
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.match(report, /## Overview/);
      assert.match(report, /## Confidence/);

      const failures = collectStep1SuccessCriteriaFailures({
        artifact,
        report,
        expectedInputMode: "spec",
        expectPersistedAmbiguity: false,
      });

      assertNoChecklistFailures("spec scenario", failures);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake satisfies the Step 1 checklist for a warning prompt with persisted ambiguity",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts and keep tests aligned, but the exact scope is still open.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const { artifact, report, artifactPath, reportPath } = await loadRunArtifacts(repoRoot);
      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.repo_context.grounded, true);
      assert.equal(artifact.status, "warning");
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.ok(artifact.ambiguities.length > 0, "expected prompt ambiguity to be persisted");
      assert.match(report, /## Ambiguities/);
      assert.match(report, /## Next Step Readiness/);

      const failures = collectStep1SuccessCriteriaFailures({
        artifact,
        report,
        expectedInputMode: "prompt",
        expectPersistedAmbiguity: true,
      });

      assertNoChecklistFailures("prompt scenario", failures);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
