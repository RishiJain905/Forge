import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { runCli } from "../src/cli.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeCli,
  writeRepoFile,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  input_mode?: "spec" | "prompt";
  source_inputs?: {
    input_mode?: "spec" | "prompt";
    primary_input?: {
      path?: string | null;
      raw_text?: string;
    };
    normalized_task_text?: string;
  };
  status: "success" | "warning" | "failed";
  taskSpec?: {
    goal?: string;
    acceptanceCriteria?: string[];
    hasAcceptanceCriteria?: boolean;
  };
  candidateTargets?: Array<{
    path?: string;
    matchType?: "explicit" | "fallback";
  }>;
  ambiguities?: string[];
  warnings?: string[];
  nextStepReadiness?: {
    ready?: boolean;
    blockingIssues?: Array<{
      code?: string;
      message?: string;
    }>;
    recommendedUserActions?: string[];
  };
  failure?: {
    code?: string;
    message?: string;
  } | null;
}

async function runActualCli(args: string[], cwd: string): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalCwd = process.cwd();

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  process.chdir(cwd);

  try {
    const code = await runCli(args);
    return {
      code,
      stdout: stdout.join(""),
      stderr: stderr.join(""),
    };
  } finally {
    process.chdir(originalCwd);
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
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

await runScenario("forge intake marks a grounded spec with explicit targets as success", async () => {
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
      ["intake", "--repo", repoRoot, "--spec", specPath],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(artifact.status, "success");
    assert.equal(artifact.input_mode, "spec");
    assert.equal(artifact.source_inputs?.input_mode, "spec");
    assert.equal(artifact.source_inputs?.primary_input?.path, specPath);
    assert.equal(artifact.nextStepReadiness?.ready, true);
    assert.equal(artifact.nextStepReadiness?.blockingIssues?.length, 0);
    assert.equal(artifact.taskSpec?.hasAcceptanceCriteria, true);
    assert.ok(
      artifact.candidateTargets?.some((candidate) => candidate.path?.endsWith("src/app.ts")),
      "expected src/app.ts candidate target",
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario(
  "forge intake marks a prompt with missing acceptance criteria as warning but still ready",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", "Update src/app.ts for intake readiness."],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "warning");
      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.source_inputs?.input_mode, "prompt");
      assert.equal(artifact.nextStepReadiness?.ready, true);
      assert.ok(
        artifact.ambiguities?.some((value) => /acceptance criteria/i.test(value)),
        "expected acceptance-criteria ambiguity",
      );
      assert.ok(
        artifact.nextStepReadiness?.recommendedUserActions?.some((value) =>
          /acceptance criteria/i.test(value),
        ),
        "expected recommended action for acceptance criteria",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake can resolve a structured prompt to success",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          [
            "Revise src/app.ts and tests/app.test.ts.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/app.test.ts stays aligned",
          ].join("\n"),
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.source_inputs?.input_mode, "prompt");
      assert.equal(artifact.taskSpec?.hasAcceptanceCriteria, true);
      assert.equal(artifact.nextStepReadiness?.ready, true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake treats missing repo tests as a non-blocking warning",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await rm(join(repoRoot, "tests"), { recursive: true, force: true });

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", "Update src/app.ts for intake readiness."],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "warning");
      assert.equal(artifact.nextStepReadiness?.ready, true);
      assert.ok(
        artifact.warnings?.some((value) => /test/i.test(value)),
        "expected missing-tests warning",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake fails when a spec only contains acceptance criteria and no goal prose",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "task.md",
        [
          "# Task",
          "",
          "## Acceptance Criteria",
          "",
          "- Update `src/app.ts`",
          "- Keep `tests/app.test.ts` aligned",
        ].join("\n"),
      );

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "spec without goal prose should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.nextStepReadiness?.ready, false);
      assert.ok(
        artifact.nextStepReadiness?.blockingIssues?.some((issue) =>
          /task goal/i.test(issue.message ?? ""),
        ),
        "expected blocking issue for missing task goal",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake fails when it cannot produce any plausible candidate targets",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await rm(join(repoRoot, "src"), { recursive: true, force: true });
      await rm(join(repoRoot, "tests"), { recursive: true, force: true });

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", "Refine the payment retry policy."],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "missing candidate targets should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.nextStepReadiness?.ready, false);
      assert.ok(
        artifact.nextStepReadiness?.blockingIssues?.some((issue) =>
          /candidate target/i.test(issue.message ?? ""),
        ),
        "expected blocking issue for candidate targets",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake CLI accepts --prompt through the real Commander parser",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runActualCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          [
            "Revise src/app.ts and tests/app.test.ts.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/app.test.ts stays aligned",
          ].join("\n"),
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status: success/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
