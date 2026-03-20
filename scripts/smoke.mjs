import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDirectory, "..");
const entryPointPath = resolve(repoRoot, "dist", "src", "index.js");

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
    await writeFile(
      join(tempRepo, "task.md"),
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
      "utf8",
    );

    const result = spawnSync(process.execPath, [
      entryPointPath,
      "intake",
      "--repo",
      tempRepo,
      "--spec",
      join(tempRepo, "task.md"),
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (result.error) {
      throw result.error;
    }

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Status: success/);
    assert.match(result.stdout, /Artifact:/);
    assert.match(result.stdout, /Report:/);

    const artifactPath = join(tempRepo, ".forge", "intake.json");
    const reportPath = join(tempRepo, ".forge", "reports", "intake-report.md");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const report = await readFile(reportPath, "utf8");

    assert.equal(artifact.status, "success");
    assert.equal(artifact.outputRoot, resolve(tempRepo, ".forge"));
    assert.equal(artifact.input_mode, "spec");
    assert.equal(artifact.source_inputs.input_mode, "spec");
    assert.equal(artifact.runtime_options.output_mode, "default");
    assert.equal(artifact.runtime_options.llm_mode, "deterministic");
    assert.equal(artifact.runtime_options.fail_on_low_confidence, false);
    assert.equal(artifact.source_inputs.config_path, null);
    assert.deepEqual(artifact.source_inputs.focus_paths, []);
    assert.equal(artifact.task_spec.has_acceptance_criteria, true);
    assert.equal(artifact.next_step_readiness.ready, true);
    assert.ok(Array.isArray(artifact.risk_analysis.initial_risk_zones));
    assert.equal(artifact.confidence.level, "high");
    assert.match(report, /Forge Intake Report/);
    assert.match(report, /Source Inputs/);
    assert.match(report, /Runtime Options/);
    assert.match(report, /Risk Analysis/);
    assert.match(report, /Confidence/);
    assert.match(report, /Next Step Readiness/);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
}

await main();
