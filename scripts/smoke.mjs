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
    await writeFile(
      join(tempRepo, "package.json"),
      JSON.stringify(
        {
          name: "forge-smoke-repo",
          private: true,
          type: "module",
          scripts: {
            test: "node --test",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
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

    await rm(join(tempRepo, "task.md"), { force: true });
    await rm(join(tempRepo, "src", "app.ts"), { force: true });
    await rm(join(tempRepo, "tests", "app.test.ts"), { force: true });

    const planResult = spawnSync(process.execPath, [
      entryPointPath,
      "plan",
      "--repo",
      tempRepo,
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (planResult.error) {
      throw planResult.error;
    }

    assert.equal(planResult.status, 0);
    assert.match(planResult.stdout, /Status: ready/);
    assert.match(planResult.stdout, /Artifact:/);
    assert.match(planResult.stdout, /Report:/);
    assert.equal(planResult.stdout.includes("# Forge Plan Report"), false);
    assert.equal(planResult.stdout.includes("## Plan Items"), false);
    assert.equal(planResult.stdout.includes("## Source Intake"), false);

    const planArtifactPath = join(tempRepo, ".forge", "plan.json");
    const planReportPath = join(tempRepo, ".forge", "reports", "plan-report.md");
    const planArtifact = JSON.parse(await readFile(planArtifactPath, "utf8"));
    const planReport = await readFile(planReportPath, "utf8");

    assert.equal(planArtifact.status, "ready");
    assert.equal(planArtifact.command, "forge plan");
    assert.equal(planArtifact.outputRoot, resolve(tempRepo, ".forge"));
    assert.equal(planArtifact.source_intake.artifactPath, join(tempRepo, ".forge", "intake.json"));
    assert.equal(planArtifact.planning_readiness.ready, true);
    assert.ok(Array.isArray(planArtifact.plan_items));
    assert.ok(planArtifact.plan_items.length > 0);
    assert.ok(planArtifact.dependency_graph.length > 0);
    assert.ok(planArtifact.conflict_zones.length > 0);
    assert.ok(planArtifact.test_obligations.length > 0);
    assert.ok(planArtifact.parallelization_signals.length > 0);
    assert.ok(planArtifact.plan_items.some((item) => item.category === "implementation"));
    assert.ok(planArtifact.plan_items.some((item) => item.category === "test"));
    assert.ok(
      planArtifact.plan_items.some((item) => item.dependencies.length > 0),
      "expected aligned source/test items to carry dependencies",
    );
    assert.match(planReport, /Forge Plan Report/);
    assert.match(planReport, /## Source Intake/);
    assert.match(planReport, /## Test Obligations/);
    assert.match(planReport, /## Parallelization/);
    assert.match(planReport, /## Planning Readiness/);

    await writeFile(join(tempRepo, "src", "app.ts"), "export const smoke = true;\n", "utf8");
    await writeFile(
      join(tempRepo, "tests", "app.test.ts"),
      "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
      "utf8",
    );

    // Test prompt mode with supplemental inputs (notes, constraints, focus)
    await writeFile(
      join(tempRepo, "notes.md"),
      "Keep focus on the retry logic only.\n",
      "utf8",
    );
    await writeFile(
      join(tempRepo, "constraints.md"),
      "Do not change public API.\n",
      "utf8",
    );

    const promptWithSupplementalResult = spawnSync(process.execPath, [
      entryPointPath,
      "intake",
      "--repo",
      tempRepo,
      "--prompt",
      "Inspect src/app.ts for retry ownership.",
      "--notes",
      join(tempRepo, "notes.md"),
      "--constraints",
      join(tempRepo, "constraints.md"),
      "--focus",
      "src",
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (promptWithSupplementalResult.error) {
      throw promptWithSupplementalResult.error;
    }

    assert.equal(promptWithSupplementalResult.status, 0);
    assert.match(promptWithSupplementalResult.stdout, /Status: (success|warning)/);

    const promptArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const promptReport = await readFile(reportPath, "utf8");

    assert.equal(promptArtifact.input_mode, "prompt");
    assert.deepEqual(promptArtifact.source_inputs.notes, ["Keep focus on the retry logic only."]);
    assert.deepEqual(promptArtifact.source_inputs.constraints, ["Do not change public API."]);
    assert.deepEqual(promptArtifact.source_inputs.focus_paths, ["src"]);

    // Validate meaningful Step 1 content for prompt mode
    assert.ok(promptArtifact.task_spec?.goal, "prompt artifact must have task_spec.goal");
    assert.ok(promptArtifact.next_step_readiness?.ready === true, "prompt should be ready");
    assert.ok(promptArtifact.confidence?.level, "prompt artifact must have confidence.level");
    assert.ok(Array.isArray(promptArtifact.candidate_targets), "prompt should produce candidate targets");
    assert.ok(promptArtifact.candidate_targets.length > 0, "prompt should have at least one target");

    // Validate report sections and supplemental input metadata
    assert.match(promptReport, /Notes count:\s+1/);
    assert.match(promptReport, /Constraints count:\s+1/);
    assert.match(promptReport, /Focus paths:\s+src/);
    assert.match(promptReport, /## Task Spec/);
    assert.match(promptReport, /## Candidate Targets/);
    assert.match(promptReport, /## Confidence/);
    assert.match(promptReport, /## Next Step Readiness/);
    assert.match(promptReport, /## Risk Analysis/);
    // Constraint content renders in the report; note content does not (only count is shown)
    assert.match(promptReport, /Do not change public API/);

    const lowConfidencePromptResult = spawnSync(process.execPath, [
      entryPointPath,
      "intake",
      "--repo",
      tempRepo,
      "--prompt",
      "fix",
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (lowConfidencePromptResult.error) {
      throw lowConfidencePromptResult.error;
    }

    assert.equal(lowConfidencePromptResult.status, 0);
    assert.match(lowConfidencePromptResult.stdout, /Status: warning/);

    const lowConfidenceArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const lowConfidenceReport = await readFile(reportPath, "utf8");

    assert.equal(lowConfidenceArtifact.input_mode, "prompt");
    assert.equal(lowConfidenceArtifact.status, "warning");
    assert.equal(lowConfidenceArtifact.runtime_options.llm_mode, "deterministic");
    assert.equal(lowConfidenceArtifact.confidence.level, "low");
    assert.equal(lowConfidenceArtifact.next_step_readiness.ready, true);
    assert.ok(Array.isArray(lowConfidenceArtifact.candidate_targets));
    assert.ok(lowConfidenceArtifact.candidate_targets.length > 0);
    assert.match(lowConfidenceReport, /## Task Spec/);
    assert.match(lowConfidenceReport, /## Confidence/);
    assert.match(lowConfidenceReport, /## Next Step Readiness/);

    const assistFallbackResult = spawnSync(process.execPath, [
      entryPointPath,
      "intake",
      "--repo",
      tempRepo,
      "--prompt",
      "fix",
      "--llm-assist",
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (assistFallbackResult.error) {
      throw assistFallbackResult.error;
    }

    assert.equal(assistFallbackResult.status, 0);
    assert.match(assistFallbackResult.stdout, /Status: warning/);

    const assistFallbackArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const assistFallbackReport = await readFile(reportPath, "utf8");

    assert.equal(assistFallbackArtifact.input_mode, "prompt");
    assert.equal(assistFallbackArtifact.status, "warning");
    assert.equal(assistFallbackArtifact.runtime_options.llm_mode, "assist");
    assert.equal(assistFallbackArtifact.confidence.level, "low");
    assert.equal(assistFallbackArtifact.next_step_readiness.ready, true);
    assert.deepEqual(
      assistFallbackArtifact.candidate_targets,
      lowConfidenceArtifact.candidate_targets,
    );
    assert.ok(
      assistFallbackArtifact.warnings.some((warning) =>
        /no optional reasoning backend|continued in deterministic mode/i.test(warning),
      ),
    );
    assert.match(assistFallbackReport, /## Confidence/);
    assert.match(assistFallbackReport, /## Next Step Readiness/);

    // Test mode-conflict (--spec and --prompt together)
    const conflictResult = spawnSync(process.execPath, [
      entryPointPath,
      "intake",
      "--repo",
      tempRepo,
      "--spec",
      join(tempRepo, "task.md"),
      "--prompt",
      "Conflicting inline prompt.",
    ], {
      cwd: tempRepo,
      encoding: "utf8",
      env: {
        ...process.env,
      },
    });

    if (conflictResult.error) {
      throw conflictResult.error;
    }

    assert.notEqual(conflictResult.status, 0, "mode conflict should fail");
    assert.match(conflictResult.stderr, /Status: failed/);
    assert.match(conflictResult.stderr, /INPUT_VALIDATION_FAILED/i);

    const conflictArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(conflictArtifact.status, "failed");
    assert.equal(conflictArtifact.next_step_readiness.ready, false);
    assert.ok(
      conflictArtifact.next_step_readiness.blocking_issues.some((issue) =>
        /INPUT_CONFLICT|spec.*prompt|prompt.*spec/i.test(issue.code ?? "") ||
        /INPUT_CONFLICT|spec.*prompt|prompt.*spec/i.test(issue.message ?? ""),
      ),
      "expected INPUT_CONFLICT blocking issue for mode conflict",
    );
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
}

await main();
