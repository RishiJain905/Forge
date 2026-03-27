import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import { createVerifyReport } from "../src/verify/report.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";
import { buildFormalVerifyArtifactFixture } from "./support/verify-formal-fixtures.js";

type Part4VerifyArtifact = {
  files: {
    artifactPath: string;
    reportPath: string;
    debugArtifactPath: string;
    debugVerificationCasesPath: string;
    debugStructuralFindingsPath: string;
    debugStateModelsPath: string;
    debugTlaSpecsPath: string;
    debugTlcResultsPath: string;
  };
  findings: Array<{
    id: string;
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
    status: string;
    summary: string;
    tla_spec_id: string | null;
    tlc_result_id: string | null;
    trace: string | null;
    errors: string[];
  }>;
  constraints: Array<{
    id: string;
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
    summary: string;
  }>;
  structural_verification: {
    findings: string[];
    constraints: string[];
  };
  formal_verification: {
    findings: string[];
    constraints: string[];
    state_models: Array<{ id: string }>;
    tla_specs: Array<{ id: string }>;
    tlc_results: Array<{ id: string; trace: string | null; errors: string[] }>;
  };
};

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

async function seedSpecRepo(repoRoot: string): Promise<void> {
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
}

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

async function prepareReadyPlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  await seedSpecRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

await runScenario(
  "forge verify exposes structured findings and constraints on a ready run",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-artifact-");

    try {
      await prepareReadyPlanArtifact(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<Part4VerifyArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(artifact.findings.length > 0, true);
      assert.equal(artifact.constraints.length > 0, true);
      assert.equal(artifact.findings.some((finding) => finding.lane === "structural"), true);
      assert.equal(artifact.findings.some((finding) => finding.lane === "formal"), true);
      assert.equal(artifact.constraints.some((constraint) => constraint.lane === "structural"), true);
      assert.equal(artifact.constraints.some((constraint) => constraint.lane === "formal"), true);
      assert.equal(artifact.findings.every((finding) => finding.tla_spec_id !== undefined), true);
      assert.equal(
        artifact.findings.some((finding) => finding.trace !== null || finding.errors.length > 0),
        true,
      );
      assert.equal(artifact.structural_verification.findings.length > 0, true);
      assert.equal(artifact.formal_verification.state_models.length > 0, true);
      assert.equal(artifact.formal_verification.tla_specs.length > 0, true);
      assert.equal(artifact.formal_verification.tlc_results.length > 0, true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify report separates structural and formal findings without changing the heading order",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-report-");

    try {
      const planArtifact = await prepareReadyPlanArtifact(repoRoot);
      const report = createVerifyReport(
        buildFormalVerifyArtifactFixture({
          repoRoot,
          planArtifact,
        }) as never,
      );

      assert.match(report, /## Findings/);
      assert.match(report, /### Structural Findings/);
      assert.match(report, /### Formal Findings/);
      assert.match(report, /verify-debug\.json/);
      assert.match(report, /verification-cases\.json/);
      assert.match(report, /structural-findings\.json/);
      assert.match(report, /state-models\.json/);
      assert.match(report, /tla-specs\.json/);
      assert.match(report, /tlc-results\.json/);
      assert.equal(
        report
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .filter((line) => line.startsWith("## "))
          .join("|")
          .includes("## Findings|## Constraints"),
        true,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
