import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDirectory, "..");
const cliModule = await import(pathToFileURL(resolve(repoRoot, "dist", "cli.js")).href);

async function main() {
  const tempRepo = await mkdtemp(join(tmpdir(), "forge-smoke-"));

  try {
    await writeFile(join(tempRepo, "README.md"), "# smoke repo\n", "utf8");

    const originalCwd = process.cwd();
    process.chdir(tempRepo);

    try {
      const exitCode = await cliModule.runCli(["intake", "--repo", tempRepo]);
      assert.equal(exitCode, 0);
    } finally {
      process.chdir(originalCwd);
    }

    const artifactPath = join(tempRepo, ".forge", "intake.json");
    const reportPath = join(tempRepo, ".forge", "reports", "intake-report.md");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const report = await readFile(reportPath, "utf8");

    assert.equal(artifact.status, "success");
    assert.equal(artifact.outputRoot, resolve(tempRepo, ".forge"));
    assert.match(report, /Forge Intake Report/);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
}

await main();
