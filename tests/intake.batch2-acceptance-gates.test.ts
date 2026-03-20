import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { buildAmbiguityAnalysisResult, buildRiskAnalysisResult } from "../src/intake/analysis.js";
import { resolveCandidateTargets } from "../src/intake/candidate-targets.js";
import { buildInferenceResult } from "../src/intake/inference.js";
import { resolveIntakeInput } from "../src/intake/input.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { scanRepoResult } from "../src/intake/repo-context.js";
import { runIntakeCommand } from "../src/intake/runner.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import type {
  Ambiguity,
  CandidateTarget,
  ConfidenceSummary,
  IntakeRunResult,
  NextStepReadiness,
  NormalizedTaskInput,
  NormalizedTaskSpec,
  RepoContext,
  ResolvedIntakeInput,
  RiskAnalysis,
  VerificationTarget,
  WarningItem,
} from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeCli,
  writeRepoFile,
} from "./support/forge-cli.js";

const gate1TypeChecks = {
  resolvedInput: {
    inputMode: "prompt",
    sourceSelection: {
      specProvided: false,
      promptProvided: true,
    },
    primaryInput: {
      path: null,
      rawText: "Update src/app.ts.",
      loaded: true,
    },
    supplementalInputs: {
      notes: [],
      constraints: [],
      configPath: null,
      configLoaded: false,
      focusPaths: [],
      strictFocus: false,
    },
    normalizedTaskInput: {
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText: "Update src/app.ts.",
      },
      normalizedTaskText: "Update src/app.ts.",
      parserInputText: "Update src/app.ts.",
      notes: [],
      constraints: [],
      configPath: null,
      focusPaths: [],
      ambiguities: [],
      recommendedUserActions: [],
    } satisfies NormalizedTaskInput,
    blockingIssues: [],
    warnings: [],
    recommendedUserActions: [],
  } satisfies ResolvedIntakeInput,
  normalizedTaskSpec: {
    goal: "Update src/app.ts.",
    acceptanceCriteria: ["src/app.ts is updated"],
    hasAcceptanceCriteria: true,
    implementationNecessities: [
      "Add or update tests for the touched behavior.",
    ],
  } satisfies NormalizedTaskSpec,
  repoContext: {
    grounded: true,
    sourceFiles: ["src/app.ts"],
    testFiles: ["tests/app.test.ts"],
    manifestFiles: ["package.json"],
    allFiles: ["package.json", "src/app.ts", "tests/app.test.ts"],
    gitContext: {
      status: "not_repo",
      repoRoot: null,
      branch: null,
      recentFiles: [],
    },
    testCommandHints: ["npm test"],
    ciHints: ["GitHub Actions"],
  } satisfies RepoContext,
  candidateTargets: [
    {
      path: "src/app.ts",
      kind: "source",
      matchType: "explicit",
      reason: "Explicit task reference.",
      notes: ["Explicit task reference."],
      sharedRisk: false,
    },
  ] satisfies CandidateTarget[],
  riskAnalysis: {
    initialRiskZones: [],
  } satisfies RiskAnalysis,
  ambiguity: {
    type: "acceptance_criteria",
    severity: "high",
    message: "Acceptance criteria are missing from the task input.",
  } satisfies Ambiguity,
  warningItem: {
    code: "NO_TESTS_DETECTED",
    message: "No tests were detected during repo grounding.",
  } satisfies WarningItem,
  verificationTarget: {
    path: "tests/app.test.ts",
    kind: "test",
    category: "test_surface",
    reason: "Initial test surface related to the requested change.",
  } satisfies VerificationTarget,
  confidence: {
    level: "high",
    signals: {
      taskParsing: "strong",
      repoInspection: "strong",
      targeting: "strong",
    },
    reasons: [],
  } satisfies ConfidenceSummary,
  nextStepReadiness: {
    ready: true,
    blockingIssues: [],
    recommendedUserActions: [],
  } satisfies NextStepReadiness,
  runResult: {
    status: "success",
    artifact: null,
    artifactPath: null,
    reportPath: null,
    outputRoot: null,
    summary: "Forge intake is ready for forge plan.",
    nextStepReadiness: null,
    failure: null,
  } satisfies IntakeRunResult,
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

async function loadRunArtifacts(repoRoot: string): Promise<{
  artifact: IntakeArtifact;
  report: string;
  artifactPath: string;
  reportPath: string;
}> {
  const artifactPath = join(repoRoot, ".forge", "intake.json");
  const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

  assert.equal(await fileExists(artifactPath), true, "expected intake artifact to be written");
  assert.equal(await fileExists(reportPath), true, "expected intake report to be written");

  return {
    artifact: await readJsonFile<IntakeArtifact>(artifactPath),
    report: await readTextFile(reportPath),
    artifactPath,
    reportPath,
  };
}

type IntakeArtifact = import("../src/intake/types.js").IntakeArtifact;

function assertExport(
  value: Record<string, unknown>,
  exportName: string,
): void {
  assert.equal(
    typeof value[exportName],
    "function",
    `expected ${exportName} to be exported`,
  );
}

await runScenario(
  "Gate 1 - shared contracts stay stable",
  async () => {
    const inputModule = await import("../src/intake/input.js");
    const taskParserModule = await import("../src/intake/task-parser.js");
    const analysisModule = await import("../src/intake/analysis.js");
    const candidateTargetsModule = await import("../src/intake/candidate-targets.js");
    const verificationTargetsModule = await import("../src/intake/verification-targets.js");
    const runnerModule = await import("../src/intake/runner.js");
    const reportModule = await import("../src/intake/report.js");
    const artifactModule = await import("../src/intake/artifact.js");
    const persistenceModule = await import("../src/intake/persistence.js");

    void gate1TypeChecks;

    assertExport(inputModule, "resolveIntakeInput");
    assertExport(taskParserModule, "buildTaskParserResult");
    assertExport(analysisModule, "buildRiskAnalysisResult");
    assertExport(analysisModule, "buildAmbiguityAnalysisResult");
    assertExport(candidateTargetsModule, "resolveCandidateTargets");
    assertExport(verificationTargetsModule, "buildVerificationTargets");
    assertExport(runnerModule, "runIntakeCommand");
    assertExport(reportModule, "createIntakeReport");
    assertExport(artifactModule, "createIntakeArtifact");
    assertExport(persistenceModule, "persistIntakeOutputs");
  },
);

await runScenario(
  "Gate 2 - input resolution and parsing stay stable",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
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

      const specResolution = await resolveIntakeInput({
        options: {
          spec: specPath,
        },
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });

      assert.equal(specResolution.blockingIssues.length, 0);
      assert.ok(specResolution.normalizedTaskInput);
      assert.equal(specResolution.normalizedTaskInput?.inputMode, "spec");
      assert.equal(specResolution.primaryInput.loaded, true);
      assert.equal(specResolution.primaryInput.path, specPath);

      const specParserResult = buildTaskParserResult(specResolution.normalizedTaskInput);
      assert.equal(specParserResult.signals.hasGoal, true);
      assert.equal(specParserResult.signals.hasAcceptanceCriteria, true);
      assert.deepEqual(specParserResult.signals.referencedPaths, [
        "src/app.ts",
        "tests/app.test.ts",
      ]);

      const promptResolution = await resolveIntakeInput({
        options: {
          prompt: "fix",
        },
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });

      assert.equal(promptResolution.blockingIssues.length, 0);
      assert.equal(promptResolution.normalizedTaskInput?.inputMode, "prompt");
      assert.ok(
        promptResolution.normalizedTaskInput?.promptDetails?.openQuestions.some((question) =>
          question.category === "acceptance_criteria",
        ),
      );
      assert.ok(
        promptResolution.normalizedTaskInput?.ambiguities.some((ambiguity) => /too short/i.test(ambiguity)),
      );

      const promptParserResult = buildTaskParserResult(promptResolution.normalizedTaskInput);
      assert.equal(promptParserResult.signals.promptIsThin, true);
      assert.deepEqual(promptParserResult.signals.promptOpenQuestionCategories, [
        "acceptance_criteria",
        "scope",
        "constraints",
      ]);

      const invalidResolution = await resolveIntakeInput({
        options: {},
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });

      assert.equal(invalidResolution.normalizedTaskInput, null);
      assert.ok(
        invalidResolution.blockingIssues.some((issue) => issue.code === "INPUT_REQUIRED"),
      );

      const fallbackParserResult = buildTaskParserResult(invalidResolution.normalizedTaskInput);
      assert.equal(fallbackParserResult.taskSpec.goal, "");
      assert.ok(
        fallbackParserResult.warnings.some((warning) =>
          /normalized task input/i.test(warning),
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 3 - repo mapping stays stable for focus exclusion and no-git repos",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        [
          "{",
          '  "name": "fixture-repo",',
          '  "private": true,',
          '  "type": "module",',
          '  "scripts": {',
          '    "test": "vitest run"',
          "  },",
          '  "devDependencies": {',
          '    "vitest": "^1.0.0"',
          "  }",
          "}",
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "tsconfig.json",
        [
          "{",
          '  "compilerOptions": {',
          '    "target": "ES2022",',
          '    "module": "NodeNext"',
          "  }",
          "}",
        ].join("\n"),
      );

      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      assert.equal(repoScanResult.repoContext.grounded, true);
      assert.equal(repoScanResult.repoContext.gitContext.status, "not_repo");
      assert.equal(repoScanResult.signals.packageManager, "npm");
      assert.ok(repoScanResult.signals.languages?.includes("typescript"));
      assert.ok(repoScanResult.signals.frameworkHints?.some((hint) => /node\.js|typescript/i.test(hint)));
      assert.ok(repoScanResult.signals.testFrameworkHints?.some((hint) => /vitest/i.test(hint)));
      assert.match(repoScanResult.signals.layoutSummary ?? "", /src/i);
      assert.match(repoScanResult.signals.layoutSummary ?? "", /tests/i);
      assert.match(repoScanResult.signals.layoutSummary ?? "", /package\.json/i);

      const resolvedInput = await resolveIntakeInput({
        options: {
          prompt: [
            "Revise src/app.ts and tests/app.test.ts.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/app.test.ts stays aligned",
          ].join("\n"),
          focus: ["tests"],
          strictFocus: true,
        },
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });

      const candidateTargets = resolveCandidateTargets(
        resolvedInput.normalizedTaskInput,
        repoScanResult.repoContext,
        {
          focusPaths: resolvedInput.normalizedTaskInput?.focusPaths ?? [],
          strictFocus: true,
        },
      );

      assert.deepEqual(
        candidateTargets.map((target) => target.path),
        ["tests/app.test.ts"],
      );
      assert.ok(
        candidateTargets.every((target) => target.path.startsWith("tests/")),
        "expected strict focus to remove out-of-focus targets",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 4 - analysis stays stable for no-tests repos and vague prompts",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await rm(join(repoRoot, "tests"), { force: true, recursive: true });

      const resolvedInput = await resolveIntakeInput({
        options: {
          prompt: "Build a customer support dashboard for the product.",
        },
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });
      const taskParserResult = buildTaskParserResult(resolvedInput.normalizedTaskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput: resolvedInput.normalizedTaskInput,
        taskParserResult,
        repoScanResult,
      });
      const riskAnalysis = buildRiskAnalysisResult({
        taskParserResult,
        repoScanResult,
        inferenceResult,
      });
      const ambiguityAnalysis = buildAmbiguityAnalysisResult({
        taskInput: resolvedInput.normalizedTaskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        runtimeOptions: resolveRuntimeOptions({}),
        failure: null,
        validationBlockingIssues: [],
        validationWarnings: [],
        validationRecommendedUserActions: [],
      });

      assert.ok(
        riskAnalysis.initialRiskZones.some((zone) => zone.code === "no_tests_detected"),
      );
      assert.equal(ambiguityAnalysis.confidence.level, "low");
      assert.ok(
        ambiguityAnalysis.ambiguityItems?.some(
          (item) => item.type === "acceptance_criteria" && item.severity === "high",
        ),
      );
      assert.ok(
        ambiguityAnalysis.warningItems?.some((item) => item.code === "NO_TESTS_DETECTED"),
      );
      assert.ok(
        ambiguityAnalysis.recommendedUserActions.some((action) =>
          /acceptance criteria|test files/i.test(action),
        ),
      );
      assert.ok(
        ambiguityAnalysis.warnings.some((warning) => /confidence/i.test(warning)),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 5 - output stays stable for a healthy spec run",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
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

      const result = await runForgeCli(["intake", "--repo", repoRoot, "--spec", specPath], repoRoot);

      assert.equal(result.code, 0, result.stderr);

      const { artifact, report, artifactPath, reportPath } = await loadRunArtifacts(repoRoot);
      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "spec");
      assert.equal(artifact.source_inputs?.input_mode, "spec");
      assert.equal(artifact.files.artifactPath, artifactPath);
      assert.equal(artifact.files.reportPath, reportPath);
      assert.match(report, /## Overview/);
      assert.match(report, /## Source Inputs/);
      assert.match(report, /## Task Spec/);
      assert.match(report, /## Repo Context/);
      assert.match(report, /## Candidate Targets/);
      assert.match(report, /## Confidence/);
      assert.match(report, /## Next Step Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 6 - orchestration stays stable for warning and failure runs",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const warningResult = await runIntakeCommand(
        {
          prompt: "Update src/app.ts and keep tests aligned, but the exact scope is still open.",
        },
        repoRoot,
      );

      assert.equal(warningResult.status, "warning");
      assert.ok(warningResult.artifact);
      assert.equal(warningResult.artifact?.status, "warning");
      assert.match(warningResult.artifactPath ?? "", /intake\.json$/i);
      assert.match(warningResult.reportPath ?? "", /intake-report\.md$/i);
      assert.match(warningResult.summary, /ready for forge plan with warnings/i);

      const failureResult = await runIntakeCommand({}, repoRoot);

      assert.equal(failureResult.status, "failed");
      assert.ok(failureResult.artifact);
      assert.equal(failureResult.artifact?.status, "failed");
      assert.equal(failureResult.failure?.code, "INPUT_VALIDATION_FAILED");
      assert.ok(
        failureResult.artifact?.next_step_readiness.blocking_issues.some(
          (issue) => issue.code === "INPUT_REQUIRED",
        ),
      );
      assert.match(failureResult.summary, /not ready for forge plan/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 7 - stage 5 and 6 artifact surfaces stay stable for risk, fallback, focus, and low-confidence runs",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(
        repoRoot,
        "tsconfig.json",
        [
          "{",
          '  "compilerOptions": {',
          '    "target": "ES2022",',
          '    "module": "NodeNext"',
          "  }",
          "}",
        ].join("\n"),
      );

      const riskResult = await runIntakeCommand(
        {
          prompt: [
            "Update src/app.ts and tsconfig.json to handle the retry migration safely.",
            "",
            "Acceptance Criteria",
            "- src/app.ts preserves retry behavior during the migration",
            "- tsconfig.json remains aligned with the migration rollout",
          ].join("\n"),
        },
        repoRoot,
      );

      assert.equal(riskResult.status, "warning");
      assert.equal(riskResult.artifact?.next_step_readiness.ready, true);
      assert.ok(
        riskResult.artifact?.candidate_targets.some((candidate) =>
          candidate.path === "src/app.ts"
            && candidate.match_type === "explicit"
            && candidate.shared_risk === true
            && candidate.notes.length > 0
        ),
        "expected shared-risk source target detail",
      );
      assert.ok(
        riskResult.artifact?.candidate_targets.some((candidate) =>
          candidate.path === "tsconfig.json"
            && candidate.match_type === "explicit"
            && candidate.shared_risk === true
            && candidate.notes.length > 0
        ),
        "expected shared-risk config target detail",
      );
      assert.ok(
        riskResult.artifact?.risk_analysis.derived_risk_zones.some((zone) => zone.code === "migration_risk"),
      );
      assert.ok(
        riskResult.artifact?.risk_analysis.derived_risk_zones.length,
        "expected at least one derived risk zone",
      );
      assert.ok(
        riskResult.artifact?.risk_analysis.initial_risk_zones.some((zone) => zone.code === "manifest_or_config_impact"),
        "expected manifest or config impact to remain visible",
      );
      assert.ok(Array.isArray(riskResult.artifact?.risk_analysis.supporting_analysis.ambiguity_items));
      assert.ok(Array.isArray(riskResult.artifact?.risk_analysis.supporting_analysis.warning_items));
      assert.ok(
        riskResult.artifact?.initial_verification_targets.some((target) =>
          target.path === "src/app.ts" && target.category === "retry_logic"
        ),
      );
      assert.ok(
        riskResult.artifact?.initial_verification_targets.some((target) =>
          target.path === "src/app.ts" && target.category === "parallel_overlap"
        ),
      );
      assert.ok(
        riskResult.artifact?.initial_verification_targets.some((target) =>
          target.path === "tsconfig.json" && target.category === "config_surface"
        ),
      );

      const fallbackPrompt = [
        "Improve the checkout retry flow without changing behavior outside the current repo.",
        "",
        "Acceptance Criteria",
        "- the existing implementation remains covered by the current tests",
      ].join("\n");

      const fallbackResult = await runIntakeCommand(
        {
          prompt: fallbackPrompt,
        },
        repoRoot,
      );
      assert.equal(fallbackResult.status, "warning");
      assert.equal(fallbackResult.artifact?.next_step_readiness.ready, true);
      assert.ok(
        fallbackResult.artifact?.candidate_targets.every((candidate) => candidate.match_type === "fallback"),
      );
      assert.ok(
        fallbackResult.artifact?.risk_analysis.initial_risk_zones.some((zone) => zone.code === "fallback_targeting_only"),
      );

      const strictFocusResult = await runIntakeCommand(
        {
          prompt: [
            "Revise src/app.ts and tests/app.test.ts.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/app.test.ts stays aligned",
          ].join("\n"),
          focus: ["tests"],
          strictFocus: true,
        },
        repoRoot,
      );
      assert.equal(strictFocusResult.status, "warning");
      assert.equal(strictFocusResult.artifact?.next_step_readiness.ready, true);
      assert.equal(strictFocusResult.artifact?.repo_context.grounded, true);
      assert.deepEqual(
        strictFocusResult.artifact?.candidate_targets.map((candidate) => candidate.path),
        ["tests/app.test.ts"],
      );
      assert.ok(
        strictFocusResult.artifact?.warnings.some((warning) => /strict focus/i.test(warning)),
      );

      const lowConfidenceDefault = await runIntakeCommand(
        {
          prompt: "fix",
        },
        repoRoot,
      );
      assert.equal(lowConfidenceDefault.status, "warning");
      assert.equal(lowConfidenceDefault.artifact?.next_step_readiness.ready, true);
      assert.equal(
        lowConfidenceDefault.artifact?.next_step_readiness.blocking_issues.some(
          (issue) => issue.code === "LOW_CONFIDENCE_ESCALATED",
        ),
        false,
      );

      const lowConfidenceEscalated = await runIntakeCommand(
        {
          prompt: "fix",
          failOnLowConfidence: true,
        },
        repoRoot,
      );
      assert.equal(lowConfidenceEscalated.status, "failed");
      assert.equal(lowConfidenceEscalated.artifact?.next_step_readiness.ready, false);
      assert.ok(
        lowConfidenceEscalated.artifact?.next_step_readiness.blocking_issues.some(
          (issue) => issue.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
