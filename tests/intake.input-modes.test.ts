import assert from "node:assert/strict";
import { join } from "node:path";

import { runCli } from "../src/cli.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
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
    notes?: string[];
    constraints?: string[];
  };
  status: "success" | "warning" | "failed";
  ambiguities?: string[];
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

await runScenario("forge intake emits input_mode and source_inputs for spec mode", async () => {
  const repoRoot = await createTempRepo();
  const specPath = join(repoRoot, "task.md");

  try {
    const specText = [
      "# Update app behavior",
      "",
      "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/app.ts` is updated",
      "- `tests/app.test.ts` stays aligned",
    ].join("\n");

    await writeRepoFile(repoRoot, "task.md", specText);

    const result = await runForgeCli(
      ["intake", "--repo", repoRoot, "--spec", specPath],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    assert.equal(await fileExists(artifactPath), true);
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
    const report = await readTextFile(reportPath);

    assert.equal(artifact.input_mode, "spec");
    assert.equal(artifact.source_inputs?.input_mode, "spec");
    assert.equal(artifact.source_inputs?.primary_input?.path, specPath);
    assert.equal(artifact.source_inputs?.primary_input?.raw_text, specText);
    assert.equal(artifact.source_inputs?.normalized_task_text, specText);
    assert.deepEqual(artifact.source_inputs?.notes, []);
    assert.deepEqual(artifact.source_inputs?.constraints, []);
    assert.equal("inputMode" in artifact, false);
    assert.match(report, /## Source Inputs/);
    assert.match(report, /Input mode: `spec`/);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake fails when neither --spec nor --prompt is provided", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runForgeCli(["intake", "--repo", repoRoot], repoRoot);

    assert.notEqual(result.code, 0, "missing primary input should fail");

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    assert.equal(await fileExists(artifactPath), true);

    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
    assert.equal(artifact.status, "failed");
    assert.match(artifact.ambiguities?.join("\n") ?? "", /acceptance criteria/i);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake emits input_mode and source_inputs for prompt mode", async () => {
  const repoRoot = await createTempRepo();
  const promptText = [
    "Revise src/app.ts and tests/app.test.ts.",
    "",
    "Acceptance Criteria",
    "- src/app.ts is updated",
    "- tests/app.test.ts stays aligned",
  ].join("\n");

  try {
    const result = await runForgeCli(
      ["intake", "--repo", repoRoot, "--prompt", promptText],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(artifact.input_mode, "prompt");
    assert.equal(artifact.source_inputs?.input_mode, "prompt");
    assert.equal(artifact.source_inputs?.primary_input?.path ?? null, null);
    assert.equal(artifact.source_inputs?.primary_input?.raw_text, promptText);
    assert.equal(artifact.source_inputs?.normalized_task_text, promptText);
    assert.deepEqual(artifact.source_inputs?.notes, []);
    assert.deepEqual(artifact.source_inputs?.constraints, []);
    assert.equal("inputMode" in artifact, false);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake fails when both --spec and --prompt are provided", async () => {
  const repoRoot = await createTempRepo();
  const specPath = join(repoRoot, "task.md");

  try {
    await writeRepoFile(
      repoRoot,
      "task.md",
      [
        "# Task",
        "",
        "Update `src/app.ts`.",
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
        "Update src/app.ts and tests/app.test.ts",
      ],
      repoRoot,
    );

    assert.notEqual(result.code, 0, "conflicting primary inputs should fail");

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    assert.equal(await fileExists(artifactPath), true);

    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
    assert.equal(artifact.status, "failed");
    assert.equal(artifact.input_mode ?? null, null);
    assert.equal(artifact.source_inputs ?? null, null);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario(
  "forge intake treats a too-short prompt as a prompt-mode ambiguity",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", "fix"],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.input_mode, "prompt");
      assert.equal(artifact.status, "warning");
      assert.ok(
        artifact.ambiguities?.some((value) => /too short|actionable|open question/i.test(value)),
        "expected prompt-too-short ambiguity",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake CLI accepts --spec through the real Commander parser and exposes input_mode",
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

      const result = await runActualCli(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Status: success/);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      assert.equal(artifact.input_mode, "spec");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
