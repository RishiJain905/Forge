import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { createVerifyReport } from "../src/verify/report.js";
import {
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
import { buildFormalVerifyArtifactFixture } from "./support/verify-formal-fixtures.js";

type VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  failure: { code: string; message: string; fallbackReason?: string } | null;
  source_plan: {
    artifactPath: string;
    readyForVerification: boolean;
    planningReadinessStatus: string;
  };
  verification_targets: Array<{
    id: string;
    verificationCaseIds: string[];
  }>;
  verification_cases: Array<{
    id: string;
    lanes: string[];
    mitigations: string[];
    constraints: string[];
    formalDetails: {
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      scenarioKind: string;
      trace: string | null;
      errors: string[];
    } | null;
  }>;
  structural_verification: {
    status: string;
    summary: string;
    findings: string[];
    constraints: string[];
  };
  formal_verification: {
    status: string;
    summary: string;
    state_models: Array<{ id: string; verification_case_id: string; scenario_kind: string }>;
    tla_specs: Array<{ id: string; verification_case_id: string; state_model_id: string; scenario_kind: string }>;
    tlc_results: Array<{
      id: string;
      verification_case_id: string;
      tla_spec_id: string;
      scenario_kind: string;
      status: string;
      trace: string | null;
      errors: string[];
    }>;
    findings: string[];
    constraints: string[];
  };
  findings: Array<{
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
    tlc_result_id: string | null;
  }>;
  constraints: Array<{
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
  }>;
  carry_forward: {
    ambiguities: string[];
    warnings: string[];
    confidence: { level: "high" | "medium" | "low" };
  };
  verification_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
  };
  verification_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
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

function sectionBody(report: string, heading: string): string[] {
  const lines = report.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = lines.indexOf(`## ${heading}`);

  if (startIndex === -1) {
    throw new Error(`Missing report heading: ${heading}`);
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertStep4HandoffSections(artifact: VerifyArtifact, report: string): void {
  assert.ok(artifact.source_plan.artifactPath.length > 0);
  assert.ok(Array.isArray(artifact.verification_targets));
  assert.ok(Array.isArray(artifact.verification_cases));
  assert.ok(Array.isArray(artifact.findings));
  assert.ok(Array.isArray(artifact.constraints));
  assert.ok(Array.isArray(artifact.carry_forward.ambiguities));
  assert.ok(Array.isArray(artifact.carry_forward.warnings));
  assert.ok(["high", "medium", "low"].includes(artifact.carry_forward.confidence.level));
  assert.equal(typeof artifact.verification_readiness.ready, "boolean");
  assert.ok(Array.isArray(artifact.verification_readiness.constraining_concern_ids));
  assert.ok(Array.isArray(artifact.verification_readiness.recommended_user_actions));
  assert.match(report, /## Source Plan/);
  assert.match(report, /## Verification Targets/);
  assert.match(report, /## Verification Cases/);
  assert.match(report, /## Structural Verification/);
  assert.match(report, /## Formal Verification/);
  assert.match(report, /## Findings/);
  assert.match(report, /## Constraints/);
  assert.match(report, /## Carry-Forward Context/);
  assert.match(report, /## Verification Readiness/);
  assert.match(report, /Forge Split Gate:/);
}

async function loadPersistedOutputs(repoRoot: string, outputDir = ".forge"): Promise<{
  artifact: VerifyArtifact;
  report: string;
}> {
  const artifactPath = verifyArtifactPath(repoRoot, outputDir);
  const reportPath = verifyReportPath(repoRoot, outputDir);

  assert.equal(await fileExists(artifactPath), true, "expected verify artifact to be written");
  assert.equal(await fileExists(reportPath), true, "expected verify report to be written");

  return {
    artifact: await readJsonFile<VerifyArtifact>(artifactPath),
    report: await readTextFile(reportPath),
  };
}

await runScenario(
  "forge verify exposes a full Step 4 handoff contract for grounded spec runs",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-step4-handoff-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Verification Readiness").join("\n");

      assert.equal(artifact.source_plan.readyForVerification, true);
      assert.equal(artifact.verification_readiness.ready, true);
      assert.ok(["ready", "ready_with_warnings"].includes(artifact.verification_readiness.status));
      assert.ok(artifact.verification_targets.length > 0);
      assert.ok(artifact.verification_cases.length > 0);
      assert.ok(artifact.findings.length > 0);
      assert.ok(artifact.constraints.length > 0);
      assert.ok(
        artifact.verification_cases.some((verificationCase) => verificationCase.mitigations.length > 0),
        "expected verification-case mitigations for Step 4 guidance",
      );
      assertStep4HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Split Gate:\s+can proceed(?: with warnings)?/i);
      assert.ok(readinessBody.includes(artifact.verification_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps warning-heavy Step 4 handoffs split-ready with explicit caution guidance",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-step4-handoff-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Verification Readiness").join("\n");

      assert.equal(artifact.verification_readiness.ready, true);
      assert.equal(artifact.verification_readiness.status, "ready_with_warnings");
      assert.ok(artifact.carry_forward.ambiguities.length > 0);
      assert.ok(artifact.carry_forward.warnings.length > 0);
      assert.ok(artifact.verification_readiness.warning_items.length > 0);
      assert.ok(artifact.verification_readiness.recommended_user_actions.length > 0);
      assertStep4HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Split Gate:\s+can proceed with warnings/i);
      assert.ok(readinessBody.includes(artifact.verification_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps blocked Step 4 handoffs diagnostically useful instead of forcing split to re-verify",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-step4-handoff-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(verifyResult.code, 0);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Verification Readiness").join("\n");

      assert.equal(artifact.source_plan.readyForVerification, false);
      assert.equal(artifact.verification_readiness.ready, false);
      assert.equal(artifact.verification_readiness.status, "blocked");
      assert.notEqual(artifact.verification_diagnostics.usability_status, "actionable");
      assert.ok(artifact.verification_readiness.blocking_issues.length > 0);
      assertStep4HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Split Gate:\s+blocked/i);
      assert.ok(readinessBody.includes(artifact.verification_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps failed fallback-output Step 4 handoffs diagnostically useful",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-step4-handoff-fallback-");
    const blockedOutputDir = join("..", "forge-verify-step4-handoff-fallback-output");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );
      assert.notEqual(verifyResult.code, 0);

      const { artifact, report } = await loadPersistedOutputs(repoRoot);
      const readinessBody = sectionBody(report, "Verification Readiness").join("\n");

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(artifact.verification_readiness.ready, false);
      assert.equal(artifact.verification_readiness.status, "blocked");
      assert.equal(artifact.requestedOutputRoot, join(repoRoot, blockedOutputDir));
      assert.equal(artifact.outputRoot, join(repoRoot, ".forge"));
      assertStep4HandoffSections(artifact, report);
      assert.match(readinessBody, /Forge Split Gate:\s+blocked/i);
      assert.ok(readinessBody.includes(artifact.verification_readiness.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps formal references, mitigations, and mixed outcomes inspectable for Step 4",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-step4-handoff-formal-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const planArtifact = await readJsonFile<Record<string, unknown>>(join(repoRoot, ".forge", "plan.json"));
      const artifact = buildFormalVerifyArtifactFixture({
        repoRoot,
        planArtifact: planArtifact as never,
      }) as VerifyArtifact;
      const report = createVerifyReport(artifact as never);

      const formalCases = artifact.verification_cases.filter((verificationCase) => verificationCase.lanes.includes("formal"));
      const structuralCases = artifact.verification_cases.filter((verificationCase) =>
        verificationCase.lanes.includes("structural"),
      );

      assert.equal(formalCases.length, 4);
      assert.equal(structuralCases.length, 1);
      assert.equal(artifact.formal_verification.state_models.length, formalCases.length);
      assert.equal(artifact.formal_verification.tla_specs.length, formalCases.length);
      assert.equal(artifact.formal_verification.tlc_results.length, formalCases.length);
      assert.ok(formalCases.every((verificationCase) => verificationCase.mitigations.length > 0));
      assert.ok(
        formalCases.every((verificationCase) =>
          Boolean(verificationCase.formalDetails?.stateModelId)
          && Boolean(verificationCase.formalDetails?.tlaSpecId)
          && Boolean(verificationCase.formalDetails?.tlcResultId)
          && Boolean(verificationCase.formalDetails?.scenarioKind),
        ),
      );
      assert.ok(artifact.formal_verification.tlc_results.some((result) => result.trace !== null || result.errors.length > 0));
      assert.ok(artifact.findings.some((finding) => finding.lane === "formal" && finding.tlc_result_id !== null));
      assert.ok(artifact.constraints.some((constraint) => constraint.lane === "formal"));
      assert.ok(artifact.constraints.some((constraint) => constraint.lane === "structural"));
      assertStep4HandoffSections(artifact, report);
      assert.match(report, /Mitigations:/);
      assert.match(report, /State Model ID:/);
      assert.match(report, /TLA Spec ID:/);
      assert.match(report, /TLC Result ID:/);
      assert.match(report, /Scenario Kind:/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
