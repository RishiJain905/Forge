import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runIntakeCommand } from "../src/intake/runner.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
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

await runScenario(
  "runIntakeCommand returns null durable paths when repo resolution hard fails",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts for output artifact persistence.";

    try {
      // Use a non-existent subdirectory as repo to trigger REPO_RESOLUTION_FAILED
      const nonExistentRepo = join(repoRoot, "this-subdir-does-not-exist");

      const result = await runIntakeCommand(
        {
          repo: nonExistentRepo,
          prompt,
        },
        repoRoot,
      );

      // Direct result object assertions - not CLI exit code
      assert.equal(result.status, "failed", "status must be 'failed'");
      assert.equal(result.outputRoot, null, "outputRoot must be null on repo resolution failure");
      assert.equal(result.artifactPath, null, "artifactPath must be null on repo resolution failure");
      assert.equal(result.reportPath, null, "reportPath must be null on repo resolution failure");
      assert.equal(result.artifact, null, "artifact must be null on repo resolution failure");
      assert.equal(result.failure?.code, "REPO_RESOLUTION_FAILED", "failure code must be REPO_RESOLUTION_FAILED");
      assert.ok(result.failure?.message.length > 0, "failure message must be non-empty");

      // Verify no artifact was written anywhere
      assert.equal(
        await fileExists(join(nonExistentRepo, ".forge", "intake.json")),
        false,
        "no artifact in non-existent repo",
      );
      assert.equal(
        await fileExists(join(repoRoot, ".forge", "intake.json")),
        false,
        "no artifact in parent repo either",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand returns fallback paths when configured-root persistence fails but fallback succeeds",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts for output artifact persistence.";

    try {
      // Create a file where a directory is expected to force persistence failure
      // on the configured output root
      await writeRepoFile(repoRoot, "broken-output/reports", "not-a-directory\n");

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          outputDir: "broken-output",
          prompt,
        },
        repoRoot,
      );

      // Fallback succeeded - verify via result object semantics
      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const fallbackReportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      // Result object must have non-null fallback paths
      // NOTE: status may be "failed" if task analysis itself failed, but
      // artifactPath/reportPath must still point to the fallback location
      // where the artifact was actually written
      assert.ok(result.artifactPath !== null, "artifactPath must be non-null when fallback succeeds");
      assert.ok(result.reportPath !== null, "reportPath must be non-null when fallback succeeds");
      assert.ok(result.outputRoot !== null, "outputRoot must be non-null when fallback succeeds");

      // Paths must point to fallback location, not configured location
      assert.equal(
        result.artifactPath,
        fallbackArtifactPath,
        "artifactPath must point to fallback .forge location",
      );
      assert.equal(
        result.reportPath,
        fallbackReportPath,
        "reportPath must point to fallback .forge location",
      );

      // Failure must indicate persistence failure that triggered fallback
      assert.equal(result.failure?.code, "PERSISTENCE_FAILED", "failure code must be PERSISTENCE_FAILED");
      assert.ok(result.failure?.fallbackReason != null, "fallbackReason must be set");

      // Verify artifacts actually exist in fallback location
      assert.equal(
        await fileExists(fallbackArtifactPath),
        true,
        "artifact must exist in fallback .forge location",
      );
      assert.equal(
        await fileExists(fallbackReportPath),
        true,
        "report must exist in fallback .forge location",
      );

      // The configured output root should NOT have a valid artifact
      assert.equal(
        await fileExists(join(repoRoot, "broken-output", "intake.json")),
        false,
        "configured root must not have artifact after fallback",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand preserves blocker failure details when configured-root persistence falls back successfully",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(repoRoot, "broken-output/reports", "not-a-directory\n");

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          outputDir: "broken-output",
          prompt: "fix",
          failOnLowConfidence: true,
        },
        repoRoot,
      );

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "LOW_CONFIDENCE_ESCALATED");
      assert.ok(result.failure?.fallbackReason?.includes("default .forge output root"));
      assert.equal(result.artifact?.failure?.code, "LOW_CONFIDENCE_ESCALATED");
      assert.ok(result.artifact?.failure?.fallbackReason?.includes("default .forge output root"));
      assert.equal(result.artifact?.next_step_readiness.ready, false);
      assert.ok(
        result.artifact?.next_step_readiness.blocking_issues.some((issue) =>
          issue.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand preserves TASK_GOAL_MISSING over low-confidence escalation for a goal-less spec",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "## Acceptance Criteria",
          "",
          "- `src/app.ts` is updated",
          "- `tests/app.test.ts` stays aligned",
        ].join("\n"),
      );

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          spec: specPath,
          failOnLowConfidence: true,
        },
        repoRoot,
      );

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "TASK_GOAL_MISSING");
      assert.ok(
        result.artifact?.next_step_readiness.blocking_issues.some((issue) =>
          issue.code === "TASK_GOAL_MISSING",
        ),
      );
      assert.ok(
        result.artifact?.next_step_readiness.blocking_issues.some((issue) =>
          issue.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
      assert.notEqual(result.failure?.code, "LOW_CONFIDENCE_ESCALATED");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand returns null paths when both configured-root and fallback persistence fail",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts for output artifact persistence.";

    try {
      // Create a file that occupies the .forge directory itself, so even the
      // fallback will fail because it cannot create subdirectories
      await writeRepoFile(repoRoot, ".forge", "blocker-file\n");
      // Also block the configured output root so it fails first
      await mkdir(join(repoRoot, "broken-output"), { recursive: true });
      await writeFile(join(repoRoot, "broken-output", "reports"), "blocker-file\n", "utf8");

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          outputDir: "broken-output",
          prompt,
        },
        repoRoot,
      );

      // Result object must have null paths when both roots fail
      assert.equal(result.status, "failed", "status must be 'failed' when both roots fail");
      assert.equal(result.artifactPath, null, "artifactPath must be null when both roots fail");
      assert.equal(result.reportPath, null, "reportPath must be null when both roots fail");
      assert.equal(result.artifact, null, "artifact must be null when both roots fail");

      // outputRoot must be the fallback root (the last one tried)
      assert.ok(result.outputRoot !== null, "outputRoot must be non-null (pointing to fallback root that was tried)");
      assert.ok(
        result.outputRoot?.endsWith(".forge") || result.outputRoot?.includes(".forge"),
        "outputRoot should be the .forge fallback path",
      );

      // Failure must indicate PERSISTENCE_FAILED
      assert.equal(result.failure?.code, "PERSISTENCE_FAILED", "failure code must be PERSISTENCE_FAILED");

      // No artifact should exist anywhere
      assert.equal(
        await fileExists(join(repoRoot, "broken-output", "intake.json")),
        false,
        "configured root must not have artifact",
      );
      assert.equal(
        await fileExists(join(repoRoot, ".forge", "intake.json")),
        false,
        "fallback root must not have artifact either",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand sets artifactPath but not reportPath in json-only mode",
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
          "Revise `src/app.ts`.",
        ].join("\n"),
      );

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          spec: specPath,
          jsonOnly: true,
        },
        repoRoot,
      );

      // Status can be success or warning depending on task analysis
      assert.ok(
        result.status === "success" || result.status === "warning",
        `status must be success or warning, got: ${result.status}`,
      );

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      // Direct result object path assertions - the key Stage 8 semantic
      assert.ok(result.artifactPath !== null, "artifactPath must be non-null in json-only mode");
      assert.equal(result.artifactPath, artifactPath, "artifactPath must point to .forge/intake.json");
      assert.equal(result.reportPath, null, "reportPath must be null in json-only mode");

      // Artifact must exist, report must NOT exist in json-only mode
      assert.equal(
        await fileExists(artifactPath),
        true,
        "artifact must exist in json-only mode",
      );
      assert.equal(
        await fileExists(reportPath),
        false,
        "report must not exist in json-only mode",
      );

      // Read the artifact to verify it was written correctly
      const artifact = await readJsonFile<{ status: string }>(artifactPath);
      assert.ok(
        artifact.status === "success" || artifact.status === "warning",
        "artifact status should be success or warning (not failed)",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand sets reportPath but not artifactPath in report-only mode",
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
          "Revise `src/app.ts`.",
        ].join("\n"),
      );

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          spec: specPath,
          reportOnly: true,
        },
        repoRoot,
      );

      // Status can be success or warning depending on task analysis
      assert.ok(
        result.status === "success" || result.status === "warning",
        `status must be success or warning, got: ${result.status}`,
      );

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      // Direct result object path assertions - the key Stage 8 semantic
      assert.equal(result.artifactPath, null, "artifactPath must be null in report-only mode");
      assert.ok(result.reportPath !== null, "reportPath must be non-null in report-only mode");
      assert.equal(result.reportPath, reportPath, "reportPath must point to .forge/reports/intake-report.md");

      // Report must exist, artifact must NOT exist in report-only mode
      assert.equal(
        await fileExists(reportPath),
        true,
        "report must exist in report-only mode",
      );
      assert.equal(
        await fileExists(artifactPath),
        false,
        "artifact must not exist in report-only mode",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand places debug artifact in custom output root when specified and run succeeds",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;
    const specPath = join(repoRoot, "task.md");

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Update app behavior",
          "",
          "Revise `src/app.ts`.",
        ].join("\n"),
      );

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          spec: specPath,
          outputDir: "custom-output",
        },
        repoRoot,
      );

      // Status can be success or warning depending on task analysis
      assert.ok(
        result.status === "success" || result.status === "warning",
        `status must be success or warning, got: ${result.status}`,
      );

      const customDebugPath = join(repoRoot, "custom-output", "debug", "intake-debug.json");
      const defaultDebugPath = join(repoRoot, ".forge", "debug", "intake-debug.json");

      // Debug artifact must be in custom output, not in default .forge
      assert.equal(
        await fileExists(customDebugPath),
        true,
        "debug artifact must exist in custom output root",
      );
      assert.equal(
        await fileExists(defaultDebugPath),
        false,
        "debug artifact must not be in default .forge when custom output is specified",
      );
    } finally {
      process.env.FORGE_INTAKE_DEBUG = originalDebugEnv ?? "";
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_INTAKE_DEBUG;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "runIntakeCommand places debug artifact in fallback .forge when custom output root fails and fallback succeeds",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;
    const prompt = "Inspect src/app.ts for output artifact persistence.";

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      // Create a blocker that causes the custom output to fail
      await writeRepoFile(repoRoot, "broken-output/reports", "not-a-directory\n");

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          prompt,
          outputDir: "broken-output",
        },
        repoRoot,
      );

      // Status may be "failed" if task analysis itself failed, but paths
      // should still reflect the fallback location
      assert.ok(result.outputRoot !== null, "outputRoot must be non-null when fallback is attempted");
      assert.ok(
        result.outputRoot?.endsWith(".forge") || result.outputRoot?.includes(".forge"),
        "outputRoot should point to fallback .forge location",
      );

      const fallbackDebugPath = join(repoRoot, ".forge", "debug", "intake-debug.json");
      const customDebugPath = join(repoRoot, "broken-output", "debug", "intake-debug.json");

      // Debug artifact should be in fallback .forge/
      assert.equal(
        await fileExists(fallbackDebugPath),
        true,
        "debug artifact must exist in fallback .forge when custom output fails",
      );
      assert.equal(
        await fileExists(customDebugPath),
        false,
        "debug artifact must not be in failed custom output",
      );
    } finally {
      process.env.FORGE_INTAKE_DEBUG = originalDebugEnv ?? "";
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_INTAKE_DEBUG;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
