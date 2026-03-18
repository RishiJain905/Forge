import assert from "node:assert/strict";

import { buildAmbiguityAnalysisResult, buildRiskAnalysisResult } from "../src/intake/analysis.js";
import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import type {
  InferenceResult,
  RepoContext,
  RepoScanResult,
  ResolvedRuntimeOptions,
  TaskParserResult,
  ValidatedIntakeInputs,
} from "../src/intake/types.js";
import { createGitContext } from "./support/forge-cli.js";

function createPromptInput(
  prompt: string,
  overrides: Partial<ValidatedIntakeInputs> = {},
): ValidatedIntakeInputs {
  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: prompt,
    },
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths: [],
    warnings: [],
    recommendedUserActions: [],
    ...overrides,
  };
}

function createRepoContext(overrides: Partial<RepoContext> = {}): RepoContext {
  return {
    grounded: true,
    sourceFiles: ["src/app.ts"],
    testFiles: ["tests/app.test.ts"],
    manifestFiles: ["package.json"],
    allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
    gitContext: createGitContext(),
    ...overrides,
  };
}

function createRepoScanResult(overrides: Partial<RepoScanResult> = {}): RepoScanResult {
  return {
    repoContext: createRepoContext(),
    signals: {
      sourceFileCount: 1,
      testFileCount: 1,
      manifestFileCount: 1,
      repoLooksSparse: false,
    },
    warnings: [],
    ...overrides,
  };
}

function createInferenceResult(overrides: Partial<InferenceResult> = {}): InferenceResult {
  return {
    candidateTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        matchType: "explicit",
        reason: "Matched a source file path mentioned in the task input.",
        notes: ["Matched an explicit task-to-file reference."],
        sharedRisk: true,
      },
    ],
    inferredRequirements: [],
    signals: {
      explicitTargetCount: 1,
      usedFallbackTargets: false,
      inferredRequirementCount: 0,
      focusApplied: false,
      strictFocusApplied: false,
      focusMatchedTargetCount: 0,
      outOfFocusTargetCount: 0,
    },
    warnings: [],
    ...overrides,
  };
}

function createTaskParserResult(
  prompt: string,
  overrides: Partial<ValidatedIntakeInputs> = {},
): {
  taskInput: ReturnType<typeof resolveLoadedIntakeInput>;
  taskParserResult: TaskParserResult;
} {
  const taskInput = resolveLoadedIntakeInput(createPromptInput(prompt, overrides));
  return {
    taskInput,
    taskParserResult: buildTaskParserResult(taskInput),
  };
}

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

await runScenario(
  "buildRiskAnalysisResult surfaces migration, api contract, coordination, config, and test risk through existing observable zones",
  async () => {
    const { taskParserResult } = createTaskParserResult(
      [
        "Migrate src/app.ts and package.json together while coordinating ownership and keeping the API contract stable.",
        "",
        "Acceptance Criteria",
        "- src/app.ts is updated for the migration",
        "- package.json stays aligned with the API contract",
      ].join("\n"),
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        testFiles: [],
        allFiles: ["src/app.ts", "src/worker.ts", "package.json"],
      }),
      signals: {
        sourceFileCount: 2,
        testFileCount: 0,
        manifestFileCount: 1,
        repoLooksSparse: false,
      },
    });
    const inferenceResult = createInferenceResult({
      candidateTargets: [
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "Matched a source file path mentioned in the task input.",
          notes: ["Matched an explicit task-to-file reference."],
          sharedRisk: true,
        },
        {
          path: "src/worker.ts",
          kind: "source",
          matchType: "fallback",
          reason: "Inferred a likely source target from the repo layout.",
          notes: ["Fell back to repo-layout targeting because the task had no explicit file match."],
          sharedRisk: true,
        },
        {
          path: "package.json",
          kind: "manifest",
          matchType: "explicit",
          reason: "Matched a manifest mentioned in the task input.",
          notes: ["Manifest/config surface can widen downstream impact."],
          sharedRisk: true,
        },
      ],
      signals: {
        explicitTargetCount: 2,
        usedFallbackTargets: true,
        inferredRequirementCount: 0,
        focusApplied: false,
        strictFocusApplied: false,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
    });

    const result = buildRiskAnalysisResult({
      taskParserResult,
      repoScanResult,
      inferenceResult,
    });

    const manifestRisk = result.initial_risk_zones.find((zone) => zone.code === "manifest_or_config_impact");
    assert.ok(manifestRisk);
    assert.match(manifestRisk?.reason ?? "", /migration/i);
    assert.match(manifestRisk?.reason ?? "", /API contract/i);
    assert.match(manifestRisk?.reason ?? "", /coordination/i);
    assert.ok(result.initial_risk_zones.some((zone) => zone.code === "no_tests_detected"));
  },
);

await runScenario(
  "buildRiskAnalysisResult flags weak grounding, unresolved referenced paths, and no-tests risk zones",
  async () => {
    const { taskParserResult } = createTaskParserResult(
      "Update src/missing.ts and keep tests/missing.test.ts aligned.",
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        grounded: false,
        testFiles: [],
        allFiles: ["src/app.ts", "package.json"],
      }),
      signals: {
        sourceFileCount: 1,
        testFileCount: 0,
        manifestFileCount: 1,
        repoLooksSparse: true,
      },
    });
    const inferenceResult = createInferenceResult();

    const result = buildRiskAnalysisResult({
      taskParserResult,
      repoScanResult,
      inferenceResult,
    });

    assert.deepEqual(
      result.initial_risk_zones.map((zone) => zone.code),
      [
        "weak_repo_grounding",
        "unresolved_referenced_paths",
        "no_tests_detected",
      ],
    );
    assert.equal(result.initial_risk_zones[0]?.level, "high");
    assert.deepEqual(result.initial_risk_zones[1]?.evidence_paths, [
      "src/missing.ts",
      "tests/missing.test.ts",
    ]);
  },
);

await runScenario(
  "buildAmbiguityAnalysisResult classifies missing acceptance criteria as a high-severity ambiguity and emits focus warnings",
  async () => {
    const { taskInput, taskParserResult } = createTaskParserResult(
      "Update src/app.ts and tests/app.test.ts.",
      {
        focusPaths: ["tests"],
      },
    );
    const repoScanResult = createRepoScanResult();
    const inferenceResult = createInferenceResult({
      candidateTargets: [
        {
          path: "tests/app.test.ts",
          kind: "test",
          matchType: "explicit",
          reason: "Matched a test file path mentioned in the task input.",
          notes: ["Matched an explicit test reference from the task input."],
          sharedRisk: false,
        },
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "Matched a source file path mentioned in the task input.",
          notes: ["Matched an explicit task-to-file reference."],
          sharedRisk: true,
        },
      ],
      signals: {
        explicitTargetCount: 2,
        usedFallbackTargets: false,
        inferredRequirementCount: 0,
        focusApplied: true,
        strictFocusApplied: false,
        focusMatchedTargetCount: 1,
        outOfFocusTargetCount: 1,
      },
    });

    const result = buildAmbiguityAnalysisResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions: {
        ...resolveRuntimeOptions({}),
        warnings: ["Runtime advisory from the CLI remains visible."],
        recommendedUserActions: ["Prefer deterministic mode for this task."],
      } as ResolvedRuntimeOptions,
      failure: null,
      validationBlockingIssues: [],
      validationWarnings: ["Validation warning survives into the final analysis."],
      validationRecommendedUserActions: ["Review the input before planning."],
    });

    assert.ok(
      result.ambiguityItems?.some(
        (item) => item.type === "acceptance_criteria" && item.severity === "high",
      ),
    );
    assert.ok(
      result.warningItems?.some((item) => item.code === "ACCEPTANCE_CRITERIA_MISSING"),
    );
    assert.ok(
      result.warningItems?.some((item) => item.code === "FOCUS_OUT_OF_COVERAGE"),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /deterministic mode/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /review the input before planning/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /broaden --focus/i.test(action),
      ),
    );
    assert.equal(result.confidence.level, "medium");
  },
);

await runScenario(
  "buildAmbiguityAnalysisResult reports no-tests warnings and preserves runtime, validation, and focus follow-up actions",
  async () => {
    const { taskInput, taskParserResult } = createTaskParserResult(
      [
        "Update src/app.ts for intake readiness.",
        "",
        "Acceptance Criteria",
        "- src/app.ts is updated",
      ].join("\n"),
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        testFiles: [],
        allFiles: ["src/app.ts", "package.json"],
      }),
      signals: {
        sourceFileCount: 1,
        testFileCount: 0,
        manifestFileCount: 1,
        repoLooksSparse: false,
      },
    });
    const inferenceResult = createInferenceResult({
      candidateTargets: [
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "Matched a source file path mentioned in the task input.",
          notes: ["Matched an explicit task-to-file reference."],
          sharedRisk: true,
        },
      ],
      signals: {
        explicitTargetCount: 1,
        usedFallbackTargets: false,
        inferredRequirementCount: 0,
        focusApplied: false,
        strictFocusApplied: false,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
    });

    const result = buildAmbiguityAnalysisResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions: {
        ...resolveRuntimeOptions({}),
        warnings: ["Runtime advisory from the CLI remains visible."],
        recommendedUserActions: ["Prefer deterministic mode for this task."],
      } as ResolvedRuntimeOptions,
      failure: null,
      validationBlockingIssues: [],
      validationWarnings: ["Validation warning survives into the final analysis."],
      validationRecommendedUserActions: ["Review the input before planning."],
    });

    assert.ok(
      result.warningItems?.some((item) => item.code === "NO_TESTS_DETECTED"),
    );
    assert.equal(result.confidence.signals.repoInspection, "partial");
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /prefer deterministic mode/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /review the input before planning/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /identify or add the test files/i.test(action),
      ),
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
