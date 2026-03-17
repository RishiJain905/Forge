import assert from "node:assert/strict";
import { join } from "node:path";

import { runCli } from "../src/cli.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  status: "success" | "warning" | "failed";
  source_inputs?: {
    input_mode?: "spec" | "prompt";
    primary_input?: {
      raw_text?: string;
    } | null;
    focus_paths?: string[];
  } | null;
  runtime_options?: {
    output_mode?: "default" | "json-only" | "report-only";
    llm_mode?: "deterministic" | "assist";
    fail_on_low_confidence?: boolean;
  } | null;
  confidence?: {
    level?: "high" | "medium" | "low";
  } | null;
  next_step_readiness?: {
    ready?: boolean;
    blocking_issues?: Array<{
      code?: string;
      message?: string;
    }>;
  };
  warnings?: string[];
  files?: {
    artifactPath?: string | null;
    reportPath?: string | null;
  };
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

await runScenario("forge intake writes both outputs by default", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      ["intake", "--repo", repoRoot, "--prompt", "Update src/app.ts for CLI flag behavior."],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(await fileExists(artifactPath), true);
    assert.equal(await fileExists(reportPath), true);
    assert.equal(artifact.runtime_options?.output_mode, "default");
    assert.equal(artifact.runtime_options?.llm_mode, "deterministic");
    assert.equal(artifact.runtime_options?.fail_on_low_confidence, false);
    assert.match(result.stdout, /Artifact:/);
    assert.match(result.stdout, /Report:/);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake supports --json-only", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--json-only",
      ],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(await fileExists(artifactPath), true);
    assert.equal(await fileExists(reportPath), false);
    assert.equal(artifact.runtime_options?.output_mode, "json-only");
    assert.equal(artifact.files?.artifactPath, artifactPath);
    assert.equal(artifact.files?.reportPath ?? null, null);
    assert.match(result.stdout, /Artifact:/);
    assert.doesNotMatch(result.stdout, /Report:/);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake supports --report-only", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--report-only",
      ],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const report = await readTextFile(reportPath);

    assert.equal(await fileExists(artifactPath), false);
    assert.equal(await fileExists(reportPath), true);
    assert.equal(artifactPath === null, false);
    assert.match(report, /report-only/i);
    assert.doesNotMatch(result.stdout, /Artifact:/);
    assert.match(result.stdout, /Report:/);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake rejects conflicting output selectors", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--json-only",
        "--report-only",
      ],
      repoRoot,
    );

    assert.equal(result.code, 1);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(await fileExists(artifactPath), true);
    assert.equal(await fileExists(reportPath), true);
    assert.equal(artifact.status, "failed");
    assert.equal(artifact.source_inputs?.input_mode, "prompt");
    assert.equal(
      artifact.source_inputs?.primary_input?.raw_text,
      "Update src/app.ts for CLI flag behavior.",
    );
    assert.equal(artifact.next_step_readiness?.ready, false);
    assert.ok(
      artifact.next_step_readiness?.blocking_issues?.some((issue) =>
        /json-only|report-only|output mode/i.test(issue.code ?? "") ||
        /json-only|report-only|output mode/i.test(issue.message ?? ""),
      ),
    );
    assert.ok(
      !artifact.next_step_readiness?.blocking_issues?.some((issue) =>
        /TASK_GOAL_MISSING|CANDIDATE_TARGETS_MISSING|REPO_CONTEXT_MISSING/.test(issue.code ?? ""),
      ),
      "unexpected unrelated blocking issues from skipped validation",
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake omits suppressed artifact file metadata in report-only mode", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--report-only",
      ],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const report = await readTextFile(reportPath);

    assert.match(report, /Report:\s+`.+intake-report\.md`/i);
    assert.match(report, /Artifact:\s+none/i);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake rejects conflicting llm selectors", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--llm-assist",
        "--no-llm",
      ],
      repoRoot,
    );

    assert.equal(result.code, 1);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(artifact.status, "failed");
    assert.ok(
      artifact.next_step_readiness?.blocking_issues?.some((issue) =>
        /llm/i.test(issue.code ?? "") || /llm/i.test(issue.message ?? ""),
      ),
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake records deferred llm assist intent", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--llm-assist",
      ],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(artifact.runtime_options?.llm_mode, "assist");
    assert.equal(artifact.runtime_options?.fail_on_low_confidence, false);
    assert.ok(
      artifact.warnings?.some((warning) => /llm assist|deferred/i.test(warning)),
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake fails low-confidence output when --fail-on-low-confidence is set", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
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

    const artifactPath = join(repoRoot, ".forge", "intake.json");
    const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(await fileExists(artifactPath), true);
    assert.equal(await fileExists(reportPath), true);
    assert.equal(artifact.status, "failed");
    assert.equal(artifact.runtime_options?.fail_on_low_confidence, true);
    assert.equal(artifact.confidence?.level, "low");
    assert.equal(artifact.next_step_readiness?.ready, false);
    assert.ok(
      artifact.next_step_readiness?.blocking_issues?.some((issue) =>
        /LOW_CONFIDENCE_ESCALATED|low confidence/i.test(issue.code ?? "") ||
        /LOW_CONFIDENCE_ESCALATED|low confidence/i.test(issue.message ?? ""),
      ),
      "expected low-confidence escalation blocking issue",
    );
    assert.match(result.stderr, /Status: failed/);
    assert.match(result.stderr, /low confidence/i);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake keeps focus metadata with a custom output dir and --json-only", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runActualCli(
      [
        "intake",
        "--repo",
        repoRoot,
        "--output-dir",
        ".forge-custom",
        "--prompt",
        "Update src/app.ts for CLI flag behavior.",
        "--focus",
        "src",
        "--json-only",
      ],
      repoRoot,
    );

    assert.equal(result.code, 0, result.stderr);

    const artifactPath = join(repoRoot, ".forge-custom", "intake.json");
    const reportPath = join(repoRoot, ".forge-custom", "reports", "intake-report.md");
    const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

    assert.equal(await fileExists(artifactPath), true);
    assert.equal(await fileExists(reportPath), false);
    assert.deepEqual(artifact.source_inputs?.focus_paths, ["src"]);
    assert.equal(artifact.runtime_options?.output_mode, "json-only");
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
