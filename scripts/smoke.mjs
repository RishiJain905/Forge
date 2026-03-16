import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDirectory, "..");
const cliModule = await import(
  pathToFileURL(resolve(repoRoot, "dist", "src", "cli.js")).href,
);

async function main() {
  const tempRepo = await mkdtemp(join(tmpdir(), "forge-smoke-"));

  try {
    await writeFile(join(tempRepo, "README.md"), "# smoke repo\n", "utf8");
    await mkdir(join(tempRepo, "src"), { recursive: true });
    await mkdir(join(tempRepo, "tests"), { recursive: true });
    await writeFile(join(tempRepo, "src", "app.ts"), "export const smoke = true;\n", "utf8");
    await writeFile(
      join(tempRepo, "tests", "app.test.ts"),
      "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      "utf8",
    );

    const originalCwd = process.cwd();
    process.chdir(tempRepo);

    try {
      const exitCode = await cliModule.runCli([
        "intake",
        "--repo",
        tempRepo,
        "--prompt",
        "Update src/app.ts and tests/app.test.ts for intake readiness.",
      ]);
      assert.equal(exitCode, 0);
    } finally {
      process.chdir(originalCwd);
    }

    const artifactPath = join(tempRepo, ".forge", "intake.json");
    const reportPath = join(tempRepo, ".forge", "reports", "intake-report.md");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const report = await readFile(reportPath, "utf8");

    assert.equal(artifact.status, "warning");
    assert.equal(artifact.outputRoot, resolve(tempRepo, ".forge"));
    assert.equal(artifact.nextStepReadiness.ready, true);
    assert.match(report, /Forge Intake Report/);
    assert.match(report, /Next Step Readiness/);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
}

await main();
