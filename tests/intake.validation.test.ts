import assert from "node:assert/strict";
import { join } from "node:path";

import { runCli } from "../src/cli.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeCli,
  writeRepoFile,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  status: "success" | "warning" | "failed";
  source_inputs?: {
    notes?: string[];
    constraints?: string[];
    normalized_task_text?: string;
    config_path?: string | null;
    focus_paths?: string[];
  } | null;
  warnings?: string[];
  next_step_readiness?: {
    ready?: boolean;
    blocking_issues?: Array<{
      code?: string;
      message?: string;
    }>;
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

await runScenario(
  "forge intake fails when --notes points to a missing file",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts for intake validation.",
          "--notes",
          "missing-notes.md",
        ],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "missing --notes file should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      assert.equal(await fileExists(artifactPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      assert.equal(artifact.status, "failed");
      assert.equal(artifact.next_step_readiness?.ready, false);
      assert.ok(
        artifact.next_step_readiness?.blocking_issues?.some((issue) =>
          /notes/i.test(issue.code ?? "") || /notes/i.test(issue.message ?? ""),
        ),
        "expected blocking issue for missing notes file",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake loads notes and constraints into source_inputs",
  async () => {
    const repoRoot = await createTempRepo();
    const notesPath = join(repoRoot, "notes.md");
    const constraintsPath = join(repoRoot, "constraints.md");
    const configPath = join(repoRoot, "forge-intake.json");

    try {
      await writeRepoFile(
        repoRoot,
        "notes.md",
        [
          "- Keep CLI output stable.",
          "",
          "- Preserve current report headings.",
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "constraints.md",
        [
          "- Do not edit files outside .forge output root.",
          "",
          "- Keep the implementation deterministic.",
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "forge-intake.json", "{\n  \"mode\": \"reserved\"\n}\n");

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts and tests/app.test.ts for intake validation.",
          "--notes",
          notesPath,
          "--constraints",
          constraintsPath,
          "--config",
          configPath,
          "--focus",
          "src",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.deepEqual(artifact.source_inputs?.notes, [
        "- Keep CLI output stable.",
        "- Preserve current report headings.",
      ]);
      assert.deepEqual(artifact.source_inputs?.constraints, [
        "- Do not edit files outside .forge output root.",
        "- Keep the implementation deterministic.",
      ]);
      assert.equal(artifact.source_inputs?.config_path, configPath);
      assert.deepEqual(artifact.source_inputs?.focus_paths, ["src"]);
      assert.match(artifact.source_inputs?.normalized_task_text ?? "", /Keep CLI output stable/i);
      assert.match(artifact.source_inputs?.normalized_task_text ?? "", /Keep the implementation deterministic/i);
      assert.ok(
        artifact.warnings?.some((value) => /focus/i.test(value)),
        "expected focus-related guidance in warnings",
      );
      assert.ok(
        !artifact.warnings?.some((value) => /deferred|later step/i.test(value)),
        "did not expect the old deferred-focus warning",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake fails when --focus points outside the repo root",
  async () => {
    const repoRoot = await createTempRepo();
    const externalRoot = await createTempRepo("forge-external-focus-");

    try {
      await writeRepoFile(externalRoot, "external.txt", "outside repo\n");

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts for intake validation.",
          "--focus",
          join(externalRoot, "external.txt"),
        ],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "outside-repo focus path should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      assert.equal(await fileExists(artifactPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      assert.equal(artifact.status, "failed");
      assert.ok(
        artifact.next_step_readiness?.blocking_issues?.some((issue) =>
          /focus/i.test(issue.code ?? "") || /focus/i.test(issue.message ?? ""),
        ),
        "expected blocking issue for invalid focus path",
      );
    } finally {
      await disposeTempRepo(repoRoot);
      await disposeTempRepo(externalRoot);
    }
  },
);

await runScenario(
  "forge intake fails when --strict-focus is provided without any focus paths",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts for intake validation.",
          "--strict-focus",
        ],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "strict focus without explicit focus paths should fail");

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      assert.equal(await fileExists(artifactPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);
      assert.equal(artifact.status, "failed");
      assert.equal(artifact.next_step_readiness?.ready, false);
      assert.ok(
        artifact.next_step_readiness?.blocking_issues?.some((issue) =>
          /strict focus|focus/i.test(issue.code ?? "") ||
          /strict focus|focus/i.test(issue.message ?? ""),
        ),
        "expected blocking issue for strict focus without focus paths",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake CLI accepts --notes, --constraints, --config, and --focus through Commander",
  async () => {
    const repoRoot = await createTempRepo();
    const notesPath = join(repoRoot, "notes.md");
    const constraintsPath = join(repoRoot, "constraints.md");
    const configPath = join(repoRoot, "forge-intake.json");

    try {
      await writeRepoFile(repoRoot, "notes.md", "- Keep CLI output stable.\n");
      await writeRepoFile(repoRoot, "constraints.md", "- Stay deterministic.\n");
      await writeRepoFile(repoRoot, "forge-intake.json", "{\n  \"mode\": \"reserved\"\n}\n");

      const result = await runActualCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Update src/app.ts and tests/app.test.ts for intake validation.",
          "--notes",
          notesPath,
          "--constraints",
          constraintsPath,
          "--config",
          configPath,
          "--focus",
          "src",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const artifact = await readJsonFile<IntakeArtifact>(artifactPath);

      assert.equal(artifact.source_inputs?.config_path, configPath);
      assert.deepEqual(artifact.source_inputs?.focus_paths, ["src"]);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "validation module enforces policy-only rules against loaded sources",
  async () => {
    const validationModule = (await import("../src/intake/validation.js")) as Record<string, unknown>;
    const validateLoadedIntakeInput = validationModule.validateLoadedIntakeInput;

    assert.equal(
      typeof validateLoadedIntakeInput,
      "function",
      "expected validation.ts to export validateLoadedIntakeInput",
    );

    const loadedInput = {
      inputMode: "spec" as const,
      primaryInput: {
        path: "/repo/spec.md",
        rawText: "",
      },
      promptText: "Update src/app.ts and tests/app.test.ts for validation behavior.",
      notes: [],
      constraints: [],
      configPath: "/repo/forge-intake.json",
      focusPaths: [],
      strictFocus: true,
      sourceSelection: {
        specProvided: true,
        promptProvided: true,
      },
    };

    const result = (validateLoadedIntakeInput as (value: typeof loadedInput) => {
      blockingIssues: Array<{
        code: string;
        message: string;
      }>;
      warnings: string[];
      recommendedUserActions: string[];
    })(loadedInput);

    assert.ok(result.blockingIssues.some((issue) => issue.code === "INPUT_CONFLICT"));
    assert.ok(result.blockingIssues.some((issue) => issue.code === "SPEC_EMPTY"));
    assert.ok(result.blockingIssues.some((issue) => issue.code === "STRICT_FOCUS_REQUIRES_FOCUS"));
    assert.ok(result.warnings.some((warning) => /config/i.test(warning)));
    assert.ok(
      result.recommendedUserActions.some(
        (action) => /config/i.test(action) || /focus/i.test(action),
      ),
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
