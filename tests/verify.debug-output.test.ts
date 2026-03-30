import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type VerifyDebugArtifact = {
  command: string;
  stage: string;
  status: string;
  files: {
    debugArtifactPath: string;
    debugVerificationCasesPath: string;
    debugStructuralFindingsPath: string;
    debugVerificationReadinessPath: string;
    debugStateModelsPath: string;
    debugTlaSpecsPath: string;
    debugTlcResultsPath: string;
  };
  verification_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  verification_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  verification_cases: Array<{ id: string; lanes: string[] }>;
  structural_verification: {
    findings: Array<{
      id: string;
      lane: string;
      verification_case_id: string;
      verification_target_id: string;
      summary: string;
    }>;
  };
  formal_verification: {
    state_models: Array<{ id: string }>;
    tla_specs: Array<{ id: string }>;
    tlc_results: Array<{ id: string }>;
  };
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

type VerifyReadinessDebugArtifact = {
  verification_readiness: VerifyDebugArtifact["verification_readiness"];
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

function verifyDebugPath(repoRoot: string, fileName: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "debug", fileName);
}

async function prepareReadyVerifyRun(repoRoot: string, outputDir?: string): Promise<void> {
  await seedSpecRepo(repoRoot);

  const intakeArgs = ["intake", "--repo", repoRoot];
  if (outputDir) {
    intakeArgs.push("--output-dir", outputDir);
  }
  intakeArgs.push("--spec", join(repoRoot, "task.md"));

  const intakeResult = runForgeBinary(intakeArgs, repoRoot);
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planArgs = ["--repo", repoRoot];
  if (outputDir) {
    planArgs.push("--output-dir", outputDir);
  }
  const planResult = runForgePlanBinary(planArgs, repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);
}

async function prepareWarningHeavyVerifyRun(repoRoot: string): Promise<void> {
  const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);
}

async function prepareBlockedVerifyRun(repoRoot: string): Promise<void> {
  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
    repoRoot,
  );
  assert.equal(intakeResult.code, 1);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.notEqual(planResult.code, 0);
}

async function assertDebugReadinessMirror(repoRoot: string, outputDir = ".forge"): Promise<void> {
  const artifactPath = verifyArtifactPath(repoRoot, outputDir);
  const artifact = await readJsonFile<VerifyDebugArtifact>(artifactPath);
  const readinessPath = join(repoRoot, outputDir, "debug", "verification-readiness.json");

  assert.equal(artifact.files.debugVerificationReadinessPath, readinessPath);
  assert.equal(await fileExists(readinessPath), true);

  const readinessArtifact = await readJsonFile<VerifyReadinessDebugArtifact>(readinessPath);
  assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });

  const debugArtifact = await readJsonFile<VerifyDebugArtifact>(artifact.files.debugArtifactPath);
  assert.deepEqual(debugArtifact.verification_diagnostics, artifact.verification_diagnostics);
  assert.deepEqual(debugArtifact.verification_readiness, artifact.verification_readiness);
}

await runScenario(
  "forge verify writes optional debug artifacts when FORGE_VERIFY_DEBUG=1 is set",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-debug-ready-");

    try {
      await prepareReadyVerifyRun(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });

      assert.equal(result.code, 0, result.stderr);

      const artifact = await readJsonFile<VerifyDebugArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(
        artifact.files.debugArtifactPath,
        verifyDebugPath(repoRoot, "verify-debug.json"),
      );
      assert.equal(
        artifact.files.debugVerificationCasesPath,
        verifyDebugPath(repoRoot, "verification-cases.json"),
      );
      assert.equal(
        artifact.files.debugStructuralFindingsPath,
        verifyDebugPath(repoRoot, "structural-findings.json"),
      );
      assert.equal(
        artifact.files.debugVerificationReadinessPath,
        verifyDebugPath(repoRoot, "verification-readiness.json"),
      );
      assert.equal(
        artifact.files.debugStateModelsPath,
        verifyDebugPath(repoRoot, "state-models.json"),
      );
      assert.equal(
        artifact.files.debugTlaSpecsPath,
        verifyDebugPath(repoRoot, "tla-specs.json"),
      );
      assert.equal(
        artifact.files.debugTlcResultsPath,
        verifyDebugPath(repoRoot, "tlc-results.json"),
      );
      assert.equal(await fileExists(artifact.files.debugArtifactPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationCasesPath), true);
      assert.equal(await fileExists(artifact.files.debugStructuralFindingsPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationReadinessPath), true);
      assert.equal(await fileExists(artifact.files.debugStateModelsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlaSpecsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlcResultsPath), true);
      const readinessArtifact = await readJsonFile<VerifyReadinessDebugArtifact>(
        artifact.files.debugVerificationReadinessPath,
      );
      assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });
      assert.ok(artifact.verification_cases.length > 0);
      assert.ok(artifact.structural_verification.findings.length > 0);
      assert.ok(artifact.formal_verification.state_models.length > 0);
      assert.ok(artifact.formal_verification.tla_specs.length > 0);
      assert.ok(artifact.formal_verification.tlc_results.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify writes optional debug artifacts to a custom repo-internal output root",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-debug-custom-root-");
    const outputDir = "custom-forge";

    try {
      await prepareReadyVerifyRun(repoRoot, outputDir);

      const result = runForgeVerifyBinary(["--repo", repoRoot, "--output-dir", outputDir], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });

      assert.equal(result.code, 0, result.stderr);

      const artifact = await readJsonFile<VerifyDebugArtifact>(verifyArtifactPath(repoRoot, outputDir));

      assert.equal(
        artifact.files.debugArtifactPath,
        verifyDebugPath(repoRoot, "verify-debug.json", outputDir),
      );
      assert.equal(
        artifact.files.debugVerificationCasesPath,
        verifyDebugPath(repoRoot, "verification-cases.json", outputDir),
      );
      assert.equal(
        artifact.files.debugStructuralFindingsPath,
        verifyDebugPath(repoRoot, "structural-findings.json", outputDir),
      );
      assert.equal(
        artifact.files.debugVerificationReadinessPath,
        verifyDebugPath(repoRoot, "verification-readiness.json", outputDir),
      );
      assert.equal(
        artifact.files.debugStateModelsPath,
        verifyDebugPath(repoRoot, "state-models.json", outputDir),
      );
      assert.equal(
        artifact.files.debugTlaSpecsPath,
        verifyDebugPath(repoRoot, "tla-specs.json", outputDir),
      );
      assert.equal(
        artifact.files.debugTlcResultsPath,
        verifyDebugPath(repoRoot, "tlc-results.json", outputDir),
      );
      assert.equal(await fileExists(artifact.files.debugArtifactPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationCasesPath), true);
      assert.equal(await fileExists(artifact.files.debugStructuralFindingsPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationReadinessPath), true);
      assert.equal(await fileExists(artifact.files.debugStateModelsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlaSpecsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlcResultsPath), true);
      assert.equal(await fileExists(verifyDebugPath(repoRoot, "verify-debug.json")), false);
      const readinessArtifact = await readJsonFile<VerifyReadinessDebugArtifact>(
        artifact.files.debugVerificationReadinessPath,
      );
      assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps blocked persisted runs debuggable when FORGE_VERIFY_DEBUG=1 is set",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-debug-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });

      assert.notEqual(result.code, 0);

      const artifact = await readJsonFile<VerifyDebugArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(
        artifact.files.debugArtifactPath,
        verifyDebugPath(repoRoot, "verify-debug.json"),
      );
      assert.equal(await fileExists(artifact.files.debugArtifactPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationCasesPath), true);
      assert.equal(await fileExists(artifact.files.debugStructuralFindingsPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationReadinessPath), true);
      assert.equal(await fileExists(artifact.files.debugStateModelsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlaSpecsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlcResultsPath), true);
      const debugArtifact = await readJsonFile<VerifyDebugArtifact>(artifact.files.debugArtifactPath);
      assert.deepEqual(debugArtifact.verification_diagnostics, artifact.verification_diagnostics);
      assert.deepEqual(debugArtifact.verification_readiness, artifact.verification_readiness);
      const readinessArtifact = await readJsonFile<VerifyReadinessDebugArtifact>(
        artifact.files.debugVerificationReadinessPath,
      );
      assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps blocked fallback runs debuggable when FORGE_VERIFY_DEBUG=1 is set",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-debug-fallback-");
    const blockedOutputDir = join("..", "forge-verify-debug-fallback-output");

    try {
      await prepareReadyVerifyRun(repoRoot);

      const result = runForgeVerifyBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
        {
          FORGE_VERIFY_DEBUG: "1",
        },
      );

      assert.notEqual(result.code, 0);

      const artifact = await readJsonFile<VerifyDebugArtifact>(verifyArtifactPath(repoRoot));

      assert.equal(
        artifact.files.debugArtifactPath,
        verifyDebugPath(repoRoot, "verify-debug.json"),
      );
      assert.equal(await fileExists(artifact.files.debugArtifactPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationCasesPath), true);
      assert.equal(await fileExists(artifact.files.debugStructuralFindingsPath), true);
      assert.equal(await fileExists(artifact.files.debugVerificationReadinessPath), true);
      assert.equal(await fileExists(artifact.files.debugStateModelsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlaSpecsPath), true);
      assert.equal(await fileExists(artifact.files.debugTlcResultsPath), true);
      const debugArtifact = await readJsonFile<VerifyDebugArtifact>(artifact.files.debugArtifactPath);
      assert.deepEqual(debugArtifact.verification_diagnostics, artifact.verification_diagnostics);
      assert.deepEqual(debugArtifact.verification_readiness, artifact.verification_readiness);
      const readinessArtifact = await readJsonFile<VerifyReadinessDebugArtifact>(
        artifact.files.debugVerificationReadinessPath,
      );
      assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
