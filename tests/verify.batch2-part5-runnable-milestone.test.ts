import assert from "node:assert/strict";
import { chmod, readFile, rm } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlanArtifact } from "../src/plan/types.js";
import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";
import { buildBatch2Part3FormalPlanArtifact } from "./support/verify-formal-fixtures.js";

type VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  verification_targets: Array<{
    id: string;
    category: string;
    verificationCaseIds: string[];
    candidateLanes: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    category: string;
    lanes: string[];
    status: string;
    formalDetails: {
      enteredFormalLane: boolean;
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      trace: string | null;
      errors: string[];
    } | null;
  }>;
  structural_verification: {
    status: string;
    summary: string;
  };
  formal_verification: {
    status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec";
    summary: string;
    state_models: Array<{
      id: string;
      verification_case_id: string;
      verification_target_id: string;
    }>;
    tla_specs: Array<{
      id: string;
      verification_case_id: string;
      state_model_id: string;
      spec_path: string;
      config_path: string;
    }>;
    tlc_results: Array<{
      id: string;
      verification_case_id: string;
      tla_spec_id: string;
      status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec";
      trace: string | null;
      errors: string[];
    }>;
  };
  verification_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
  };
  files: {
    artifactPath: string;
    reportPath: string;
  };
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");

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

async function seedRunnableMilestoneRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Stabilize the shared workflow surface",
      "",
      "Revise `src/worker.ts`, `src/runtime.ts`, and `package.json` together.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/worker.ts` preserves ownership transitions and retry behavior",
      "- `src/runtime.ts` avoids duplicate execution and stale writes",
      "- `package.json` keeps migration order stable",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/worker.ts",
    [
      "export function claimOwnership() {",
      "  return 'claimed';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/runtime.ts",
    [
      "export function runRuntime() {",
      "  return 'ready';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "package.json",
    JSON.stringify(
      {
        name: "forge-stage5-runnable-milestone-fixture",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
}

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "src", "runtime.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
}

async function prepareRunnableMilestonePlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  await seedRunnableMilestoneRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  const rawPlanArtifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
  const supportedPlanArtifact = buildBatch2Part3FormalPlanArtifact({
    planArtifact: rawPlanArtifact,
  });

  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(supportedPlanArtifact, null, 2)}\n`);
  return supportedPlanArtifact;
}

async function createTlcStubEnv(repoRoot: string): Promise<Record<string, string>> {
  const toolsDir = join(repoRoot, "tools");
  await writeRepoFile(
    repoRoot,
    "tools/java.cmd",
    [
      "@echo off",
      "setlocal",
      "echo Model checking completed. No error has been found.",
      "exit /b 0",
    ].join("\r\n"),
  );
  await writeRepoFile(
    repoRoot,
    "tools/java",
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "echo 'Model checking completed. No error has been found.'",
      "exit 0",
    ].join("\n"),
  );
  await chmod(join(toolsDir, "java"), 0o755);
  await writeRepoFile(repoRoot, "tools/fake-tlc.jar", "");

  const pathValue = `${toolsDir}${delimiter}${process.env.PATH ?? ""}`;

  return {
    PATH: pathValue,
    Path: pathValue,
    FORGE_TLC_JAR_PATH: join(toolsDir, "fake-tlc.jar"),
  };
}

await runScenario(
  "default npm test must gate the full shipped Step 3 Batch 2 verify suites",
  async () => {
    const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
      scripts?: { test?: string };
    };
    const testScript = packageJson.scripts?.test;

    assert.equal(typeof testScript, "string");
    assert.match(testScript!, /verify\.part2-plan-consumption-structural-lane\.test\.js/);
    assert.match(testScript!, /verify\.debug-output\.test\.js/);
    assert.match(testScript!, /verify\.batch2-part4-artifacts-report-debug\.test\.js/);
    assert.match(testScript!, /verify\.batch2-part5-runnable-milestone\.test\.js/);
  },
);

await runScenario(
  "forge verify reaches the Batch 2 runnable milestone through the packaged CLI with TLC passing",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-stage5-runnable-");

    try {
      const planArtifact = await prepareRunnableMilestonePlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);

      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assert.match(verifyResult.stdout, /Status:\s+ready/);
      assert.match(verifyResult.stdout, /Summary:/);
      assert.match(verifyResult.stdout, /Artifact:/);
      assert.match(verifyResult.stdout, /Report:/);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifactPath = verifyArtifactPath(repoRoot);
      const reportPath = verifyReportPath(repoRoot);
      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<VerifyArtifact>(artifactPath);
      const report = await readTextFile(reportPath);
      const formalCase = artifact.verification_cases.find((entry) => entry.lanes.includes("formal"));
      const formalTarget = artifact.verification_targets.find((entry) => entry.category === "parallel_overlap");

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.equal(artifact.verification_readiness.ready, true);
      assert.equal(artifact.formal_verification.status, "passed");
      assert.equal(artifact.structural_verification.status, "passed");
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
      assert.ok(formalTarget);
      assert.deepEqual(formalTarget?.candidateLanes, ["structural", "formal"]);
      assert.ok(formalCase);
      assert.equal(formalCase?.status, "passed");
      assert.equal(formalCase?.formalDetails?.enteredFormalLane, true);
      assert.ok(formalCase?.formalDetails?.stateModelId);
      assert.ok(formalCase?.formalDetails?.tlaSpecId);
      assert.ok(formalCase?.formalDetails?.tlcResultId);
      assert.ok(artifact.formal_verification.state_models.length > 0);
      assert.ok(artifact.formal_verification.tla_specs.length > 0);
      assert.ok(artifact.formal_verification.tlc_results.length > 0);
      assert.ok(artifact.formal_verification.tlc_results.every((entry) => entry.status === "passed"));
      assert.ok(
        artifact.formal_verification.state_models.every(
          (entry) =>
            artifact.verification_cases.some((verificationCase) => verificationCase.id === entry.verification_case_id),
        ),
      );
      await Promise.all(
        artifact.formal_verification.tla_specs.flatMap((spec) => [
          fileExists(spec.spec_path),
          fileExists(spec.config_path),
        ]),
      );
      assert.ok(
        artifact.formal_verification.tla_specs.every(
          (spec) => spec.spec_path.endsWith(".tla") && spec.config_path.endsWith(".cfg"),
        ),
      );
      assert.match(artifact.summary, /forge verify can proceed|TLC validated/i);
      assert.equal(planArtifact.planning_readiness.ready, true);
      assert.match(report, /Forge Verify Report/);
      assert.match(report, /## Formal Verification/);
      assert.match(report, /passed/);
      assert.match(report, /TLC Results/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
