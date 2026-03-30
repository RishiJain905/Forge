import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { createVerifyReport } from "../src/verify/report.js";
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
import { buildFormalVerifyArtifactFixture } from "./support/verify-formal-fixtures.js";

const REQUIRED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_plan",
  "verification_target_contract",
  "formal_lane_contract",
  "verification_targets",
  "verification_cases",
  "structural_verification",
  "formal_verification",
  "findings",
  "constraints",
  "carry_forward",
  "verification_diagnostics",
  "verification_readiness",
  "failure",
] as const;

const REQUIRED_REPORT_TITLE = "# Forge Verify Report";
const REQUIRED_HEADINGS = [
  "## Overview",
  "## Purpose",
  "## Source Plan",
  "## Verification Target Contract",
  "## Formal Lane Contract",
  "## Verification Targets",
  "## Verification Cases",
  "## Structural Verification",
  "## Formal Verification",
  "## Findings",
  "## Constraints",
  "## Carry-Forward Context",
  "## Verification Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Failure",
  "## Summary",
] as const;

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

function extractLevelTwoHeadings(report: string): string[] {
  return report
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("## "));
}

function cloneArtifact<T extends Record<string, any>>(artifact: T): T {
  return JSON.parse(JSON.stringify(artifact)) as T;
}

function makeReportArtifact(base: Record<string, any>, mutator: (artifact: Record<string, any>) => void): Record<string, any> {
  const artifact = cloneArtifact(base);
  mutator(artifact);
  return artifact;
}

function assertReadinessReport(report: string, variantName: string): void {
  assert.match(report, new RegExp(`^${REQUIRED_REPORT_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.equal(extractLevelTwoHeadings(report).join("|"), [...REQUIRED_HEADINGS].join("|"));
  assert.match(report, /forge split/i, `${variantName}: report should mention the forge split gate`);
  assert.match(report, /Recommended Actions/i, `${variantName}: report should include recommended actions`);
  assert.match(report, /Constraining Concerns/i, `${variantName}: report should include constraining concerns`);
  assert.doesNotMatch(report, /### Planning Diagnostics/, `${variantName}: report should not use Planning Diagnostics`);
  assert.doesNotMatch(report, /### Planning Readiness/, `${variantName}: report should not use Planning Readiness`);
}

async function prepareWarningHeavyPlanArtifact(): Promise<{ repoRoot: string; planArtifact: Record<string, any> }> {
  const repoRoot = await createTempRepo("forge-verify-b3-part3-hardening-");

  const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  const planArtifact = await readJsonFile<Record<string, any>>(join(repoRoot, ".forge", "plan.json"));
  return { repoRoot, planArtifact };
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
  const artifact = await readJsonFile<Record<string, any>>(artifactPath);
  const readinessPath = join(repoRoot, outputDir, "debug", "verification-readiness.json");

  assert.equal(artifact.files.debugVerificationReadinessPath, readinessPath);
  assert.equal(await fileExists(readinessPath), true);

  const readinessArtifact = await readJsonFile<Record<string, any>>(readinessPath);
  assert.deepEqual(readinessArtifact, { verification_readiness: artifact.verification_readiness });

  const debugArtifact = await readJsonFile<Record<string, any>>(artifact.files.debugArtifactPath);
  assert.deepEqual(debugArtifact.verification_diagnostics, artifact.verification_diagnostics);
  assert.deepEqual(debugArtifact.verification_readiness, artifact.verification_readiness);
}

await runScenario(
  "forge verify artifact keeps Step 2 planning data under source_plan and Step 3 readiness separate",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      await removePlanningInputs(repoRoot);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<Record<string, any>>(verifyArtifactPath(repoRoot));

      assert.deepEqual(Object.keys(artifact).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());
      assert.equal(
        artifact.files.debugVerificationReadinessPath,
        join(repoRoot, ".forge", "debug", "verification-readiness.json"),
      );
      assert.deepEqual(artifact.source_plan.planning_diagnostics, planArtifact.planning_diagnostics);
      assert.deepEqual(artifact.source_plan.planning_readiness, planArtifact.planning_readiness);
      assert.ok(
        artifact.verification_diagnostics.warning_items.length >
          artifact.source_plan.planning_diagnostics.warning_items.length,
      );
      assert.ok(
        artifact.verification_diagnostics.warning_items.some(
          (item: { code: string; message: string }) => item.code === "FORMAL_TLC_NOT_RUN",
        ),
      );
      assert.notEqual(
        artifact.verification_readiness.summary,
        artifact.source_plan.planning_readiness.summary,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify report uses forge split readiness wording across structural-only, formal-not-run, inconclusive, blocked, and fallback-output shapes",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const baseArtifact = buildFormalVerifyArtifactFixture({
        repoRoot,
        planArtifact: planArtifact as never,
      }) as Record<string, any>;

      const reportVariants = [
        {
          name: "structural-only",
          artifact: makeReportArtifact(baseArtifact, (artifact) => {
            artifact.verification_targets = artifact.verification_targets.filter((target: Record<string, any>) =>
              target.candidateLanes.includes("structural"),
            );
            artifact.verification_cases = artifact.verification_cases.filter((verificationCase: Record<string, any>) =>
              verificationCase.lanes.includes("structural"),
            );
            artifact.findings = artifact.findings.filter((finding: Record<string, any>) => finding.lane === "structural");
            artifact.constraints = artifact.constraints.filter((constraint: Record<string, any>) => constraint.lane === "structural");
            artifact.formal_verification = {
              ...artifact.formal_verification,
              status: "not_run",
              summary: "No formal verification cases were selected.",
              caution_notes: [],
              state_models: [],
              tla_specs: [],
              tlc_results: [],
              findings: [],
              constraints: [],
            };
          }),
        },
        {
          name: "formal-not-run",
          artifact: makeReportArtifact(baseArtifact, (artifact) => {
            artifact.formal_verification = {
              ...artifact.formal_verification,
              status: "not_run",
              summary: "Formal verification was not run.",
              caution_notes: [],
              state_models: [],
              tla_specs: [],
              tlc_results: [],
              findings: [],
              constraints: [],
            };
          }),
        },
        {
          name: "inconclusive",
          artifact: makeReportArtifact(baseArtifact, (artifact) => {
            artifact.verification_diagnostics = {
              ...artifact.verification_diagnostics,
              warning_items: [
                {
                  code: "INCONCLUSIVE_EVIDENCE",
                  message: "Verification evidence is incomplete.",
                },
              ],
              blocking_items: [],
              partial_output: {
                code: "INCONCLUSIVE_OUTPUT",
                message: "Verification output is incomplete.",
                fallbackReason: "partial evidence",
              },
            };
            artifact.verification_readiness = {
              ...artifact.verification_readiness,
              ready: true,
              status: "ready_with_warnings",
              summary: "forge split can proceed with warnings.",
              warning_items: [
                {
                  code: "INCONCLUSIVE_EVIDENCE",
                  message: "Verification evidence is incomplete.",
                },
              ],
              blocking_issues: [],
              partial_output: {
                code: "INCONCLUSIVE_OUTPUT",
                message: "Verification output is incomplete.",
                fallbackReason: "partial evidence",
              },
              constraining_concern_ids: ["formal-coverage-gap"],
              recommended_user_actions: ["Run `forge split` again with fuller formal inputs."],
            };
            artifact.formal_verification = {
              ...artifact.formal_verification,
              status: "errored",
              summary: "Formal verification remains inconclusive.",
            };
          }),
        },
        {
          name: "blocked",
          artifact: makeReportArtifact(baseArtifact, (artifact) => {
            artifact.status = "blocked";
            artifact.verification_diagnostics = {
              ...artifact.verification_diagnostics,
              usability_status: "non_actionable",
              warning_items: [],
              blocking_items: [
                {
                  code: "VERIFY_INPUT_TOO_WEAK",
                  message: "Step 2 input is too weak for `forge split`.",
                },
              ],
              partial_output: {
                code: "VERIFY_INPUT_TOO_WEAK",
                message: "Step 2 input is too weak for `forge split`.",
                fallbackReason: "low-confidence planning input",
              },
            };
            artifact.verification_readiness = {
              ...artifact.verification_readiness,
              ready: false,
              status: "blocked",
              summary: "forge split is blocked until Step 2 inputs improve.",
              warning_items: [],
              blocking_issues: [
                {
                  code: "VERIFY_INPUT_TOO_WEAK",
                  message: "Step 2 input is too weak for `forge split`.",
                },
              ],
              partial_output: {
                code: "VERIFY_INPUT_TOO_WEAK",
                message: "Step 2 input is too weak for `forge split`.",
                fallbackReason: "low-confidence planning input",
              },
              constraining_concern_ids: ["plan-input-quality"],
              recommended_user_actions: ["Strengthen the Step 2 plan before running `forge split`."],
            };
            artifact.failure = {
              code: "VERIFY_INPUT_TOO_WEAK",
              message: "Step 2 input is too weak for `forge split`.",
              fallbackReason: "low-confidence planning input",
            };
          }),
        },
        {
          name: "fallback-output",
          artifact: makeReportArtifact(baseArtifact, (artifact) => {
            artifact.status = "failed";
            artifact.requestedOutputRoot = join(repoRoot, "..", "forge-verify-readiness-fallback");
            artifact.outputRoot = join(repoRoot, ".forge");
            artifact.verification_diagnostics = {
              ...artifact.verification_diagnostics,
              usability_status: "upstream_blocked",
              warning_items: [],
              blocking_items: [
                {
                  code: "OUTPUT_ROOT_FALLBACK",
                  message: "Unsafe output root fell back to `.forge`.",
                },
              ],
              partial_output: {
                code: "OUTPUT_ROOT_FALLBACK",
                message: "Unsafe output root fell back to `.forge`.",
                fallbackReason: "unsafe output root",
              },
            };
            artifact.verification_readiness = {
              ...artifact.verification_readiness,
              ready: false,
              status: "blocked",
              summary: "forge split fell back to the repo-safe output root.",
              warning_items: [],
              blocking_issues: [
                {
                  code: "OUTPUT_ROOT_FALLBACK",
                  message: "Unsafe output root fell back to `.forge`.",
                },
              ],
              partial_output: {
                code: "OUTPUT_ROOT_FALLBACK",
                message: "Unsafe output root fell back to `.forge`.",
                fallbackReason: "unsafe output root",
              },
              constraining_concern_ids: ["output-root-safety"],
              recommended_user_actions: ["Rerun `forge split` with a repo-safe output root."],
            };
            artifact.failure = {
              code: "OUTPUT_ROOT_FALLBACK",
              message: "Unsafe output root fell back to `.forge`.",
              fallbackReason: "unsafe output root",
            };
          }),
        },
      ];

      for (const variant of reportVariants) {
        const report = createVerifyReport(variant.artifact as never);
        assertReadinessReport(report, variant.name);
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify debug output writes verification-readiness.json for ready runs",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-part3-debug-ready-");

    try {
      await prepareReadyVerifyRun(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });
      assert.equal(result.code, 0, result.stderr);

      await assertDebugReadinessMirror(repoRoot);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify debug output writes verification-readiness.json for warning-heavy runs",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-part3-debug-warning-");

    try {
      await prepareWarningHeavyVerifyRun(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });
      assert.equal(result.code, 0, result.stderr);

      await assertDebugReadinessMirror(repoRoot);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify debug output writes verification-readiness.json for blocked runs",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-part3-debug-blocked-");

    try {
      await prepareBlockedVerifyRun(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_VERIFY_DEBUG: "1",
      });
      assert.notEqual(result.code, 0);

      await assertDebugReadinessMirror(repoRoot);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify debug output writes verification-readiness.json for fallback-output runs",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-part3-debug-fallback-");
    const blockedOutputDir = join("..", "forge-verify-readiness-fallback-output");

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
      assert.match(result.stderr, /OUTPUT_ROOT_FALLBACK/);

      await assertDebugReadinessMirror(repoRoot);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
