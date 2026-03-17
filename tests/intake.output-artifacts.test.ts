import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
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

await runScenario(
  "forge intake cleans configured-root partial writes before falling back to .forge",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts and tests/app.test.ts for output artifact persistence.";

    try {
      await writeRepoFile(repoRoot, "broken-output/reports", "not a directory\n");

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--output-dir",
          "broken-output",
          "--prompt",
          prompt,
        ],
        repoRoot,
      );

      assert.equal(result.code, 1);
      assert.equal(await fileExists(join(repoRoot, "broken-output", "intake.json")), false);
      assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "reports", "intake-report.md")), true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake writes an internal debug artifact when FORGE_INTAKE_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Inspect src/app.ts and tests/app.test.ts for output artifact persistence.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const debugArtifactPath = join(repoRoot, ".forge", "debug", "intake-debug.json");
      const debugArtifact = await readJsonFile<{
        runtimeOptions?: { outputMode?: string };
        responsibilities?: { taskParser?: unknown };
      }>(debugArtifactPath);

      assert.equal(await fileExists(debugArtifactPath), true);
      assert.equal(debugArtifact.runtimeOptions?.outputMode, "default");
      assert.ok(debugArtifact.responsibilities?.taskParser);
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
  "forge intake includes failure details in CLI output when persistence leaves no durable artifact",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts and tests/app.test.ts for output artifact persistence.";

    try {
      await writeFile(join(repoRoot, ".forge"), "not a directory\n", "utf8");

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", prompt],
        repoRoot,
      );

      assert.equal(result.code, 1);
      assert.match(result.stderr, /Failure:/);
      assert.match(result.stderr, /PERSISTENCE_FAILED|write|directory|output/i);
      assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
