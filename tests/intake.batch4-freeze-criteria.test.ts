import assert from "node:assert/strict";
import { join } from "node:path";

import { runIntakeCommand } from "../src/intake/runner.js";
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

function assertBatch4HandoffShape(artifact: IntakeArtifact, report: string): void {
  assert.ok(typeof artifact.task_spec.title === "string");
  assert.ok(artifact.task_spec.goal.length > 0, "goal must be non-empty");
  assert.ok(Array.isArray(artifact.candidate_targets));
  assert.ok(Array.isArray(artifact.initial_verification_targets));
  assert.ok(Array.isArray(artifact.risk_analysis.initial_risk_zones));
  assert.ok(Array.isArray(artifact.risk_analysis.supporting_analysis.ambiguity_items));
  assert.ok(Array.isArray(artifact.risk_analysis.supporting_analysis.warning_items));
  assert.ok(["high", "medium", "low"].includes(artifact.confidence.level));
  assert.equal(typeof artifact.next_step_readiness.ready, "boolean");
  assert.ok(Array.isArray(artifact.next_step_readiness.blocking_issues));
  assert.ok(Array.isArray(artifact.next_step_readiness.recommended_user_actions));
  assert.match(report, /## Task Spec/);
  assert.match(report, /## Candidate Targets/);
  assert.match(report, /## Risk Analysis/);
  assert.match(report, /## Initial Verification Targets/);
  assert.match(report, /## Confidence/);
  assert.match(report, /## Next Step Readiness/);
}

await runScenario(
  "forge intake keeps low-confidence prompt runs stable across repeated executions",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const runPrompt = async (): Promise<{
        result: Awaited<ReturnType<typeof runForgeCli>>;
        artifact: IntakeArtifact;
        report: string;
      }> => {
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

        const artifactPath = join(repoRoot, ".forge", "intake.json");
        const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

        return {
          result,
          artifact: await readJsonFile<IntakeArtifact>(artifactPath),
          report: await readTextFile(reportPath),
        };
      };

      const firstRun = await runPrompt();
      const secondRun = await runPrompt();

      assert.equal(firstRun.artifact.status, "warning");
      assert.equal(firstRun.artifact.confidence.level, "low");
      assert.equal(firstRun.artifact.next_step_readiness.ready, true);
      assert.ok(firstRun.artifact.candidate_targets.length > 0);
      assert.notEqual(firstRun.artifact.startedAt, secondRun.artifact.startedAt);
      assert.notEqual(firstRun.artifact.finishedAt, secondRun.artifact.finishedAt);

      const {
        startedAt: firstStartedAt,
        finishedAt: firstFinishedAt,
        ...firstStableArtifact
      } = firstRun.artifact;
      const {
        startedAt: secondStartedAt,
        finishedAt: secondFinishedAt,
        ...secondStableArtifact
      } = secondRun.artifact;

      void firstStartedAt;
      void firstFinishedAt;
      void secondStartedAt;
      void secondFinishedAt;

      assert.deepEqual(firstStableArtifact, secondStableArtifact);
      assert.equal(firstRun.report, secondRun.report);
      assert.match(firstRun.result.stdout, /Status: warning/);
      assert.match(firstRun.report, /## Confidence/);
      assert.match(firstRun.report, /## Next Step Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake satisfies the Batch 4 freeze line for a grounded spec run",
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

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "spec");
      assert.equal(artifact.next_step_readiness.ready, true);
      assertBatch4HandoffShape(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake satisfies the Batch 4 freeze line for a warning prompt run",
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

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.status, "warning");
      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.next_step_readiness.ready, true);
      assert.ok(artifact.ambiguities.length > 0);
      assertBatch4HandoffShape(artifact, report);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake keeps debug and bounded assist usable under the Batch 4 freeze line",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      const result = await runIntakeCommand({
        repo: repoRoot,
        prompt: [
          "Refine retry wording in src/app.ts and keep tests/app.test.ts aligned.",
          "",
          "Acceptance Criteria",
          "- src/app.ts wording is clarified",
          "- tests/app.test.ts stays aligned",
        ].join("\n"),
        llmAssist: true,
      }, repoRoot, {
        optionalReasoningHook: async () => ({
          provider: "test-hook",
          taskWording: {
            summary: "Clarify the retry wording in src/app.ts while keeping tests aligned.",
            implementationNecessities: [
              "Verify the updated wording still matches the existing test intent.",
            ],
          },
        }),
      });

      assert.ok(result.status === "success" || result.status === "warning");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.runtime_options.llm_mode, "assist");
      assert.match(artifact.task_spec.summary, /retry wording/i);
      assert.ok(
        artifact.task_spec.implementation_necessities.some((value) =>
          /updated wording still matches the existing test intent/i.test(value),
        ),
      );
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "intake-debug.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "spec-parse.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "repo-scan.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "candidate-files.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "debug", "warnings.json")), true);
      assertBatch4HandoffShape(artifact, report);
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_INTAKE_DEBUG;
      } else {
        process.env.FORGE_INTAKE_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake mode-conflict (--spec and --prompt) fails with proper blocking issue at CLI level",
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

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--spec",
          specPath,
          "--prompt",
          "Update src/app.ts with a conflicting inline prompt.",
        ],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "mode conflict should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.next_step_readiness?.ready, false);
      assert.ok(
        artifact.next_step_readiness?.blocking_issues?.some((issue) =>
          /INPUT_CONFLICT|spec.*prompt|prompt.*spec/i.test(issue.code ?? "") ||
          /INPUT_CONFLICT|spec.*prompt|prompt.*spec/i.test(issue.message ?? ""),
        ),
        "expected INPUT_CONFLICT blocking issue for mode conflict",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
