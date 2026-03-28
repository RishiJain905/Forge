import assert from "node:assert/strict";

import { buildAmbiguityAnalysisResult, buildRiskAnalysisResult } from "../src/intake/analysis.js";
import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import type {
  InferenceResult,
  NormalizedTaskInput,
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
  const { supplementalInputs: supplementalOverrides, ...otherOverrides } = overrides;
  const supplementalInputs = {
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths: [],
    ...supplementalOverrides,
  };

  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: prompt,
    },
    supplementalInputs,
    warnings: [],
    recommendedUserActions: [],
    ...otherOverrides,
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

function createFallbackOnlyInferenceResult(paths: string[]): InferenceResult {
  return {
    candidateTargets: paths.map((path) => ({
      path,
      kind: path.endsWith(".json") ? "manifest" : "source",
      matchType: "fallback",
      reason: "Inferred a likely target from the repo layout.",
      notes: ["Fell back to repo-layout targeting because the task had no explicit file match."],
      sharedRisk: true,
    })),
    inferredRequirements: [],
    signals: {
      explicitTargetCount: 0,
      usedFallbackTargets: true,
      inferredRequirementCount: 0,
      focusApplied: false,
      strictFocusApplied: false,
      focusMatchedTargetCount: 0,
      outOfFocusTargetCount: 0,
    },
    warnings: [],
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

function createSpecTaskParserResult(specText: string): {
  taskInput: NormalizedTaskInput;
  taskParserResult: TaskParserResult;
} {
  const taskInput: ValidatedIntakeInputs = {
    inputMode: "spec",
    primaryInput: {
      path: "/repo/spec.md",
      rawText: specText,
    },
    supplementalInputs: {
      notes: [],
      constraints: [],
      configPath: null,
      focusPaths: [],
    },
    warnings: [],
    recommendedUserActions: [],
  };

  const resolvedTaskInput = resolveLoadedIntakeInput(taskInput);

  return {
    taskInput: resolvedTaskInput,
    taskParserResult: buildTaskParserResult(resolvedTaskInput),
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
  "buildRiskAnalysisResult records typed stage-6 risks for migration, api compatibility, coordination, and test coverage without fallback-only on mixed targeting",
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
        usedFallbackTargets: false,
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

    assert.deepEqual(
      result.typedRiskZones?.map((zone) => zone.code),
      [
        "no_tests_detected",
        "migration_risk",
        "api_compatibility_risk",
        "coordination_overlap_risk",
        "test_strategy_risk",
        "manifest_or_config_impact",
      ],
    );
    const migrationRisk = result.typedRiskZones?.find((zone) => zone.code === "migration_risk");
    assert.match(migrationRisk?.reason ?? "", /migration sequencing/i);
    const apiRisk = result.typedRiskZones?.find((zone) => zone.code === "api_compatibility_risk");
    assert.match(apiRisk?.reason ?? "", /API compatibility/i);
    const coordinationRisk = result.typedRiskZones?.find((zone) => zone.code === "coordination_overlap_risk");
    assert.match(coordinationRisk?.reason ?? "", /coordination|parallel/i);
    const testRisk = result.typedRiskZones?.find((zone) => zone.code === "test_strategy_risk");
    assert.match(testRisk?.reason ?? "", /test/i);
    assert.ok(result.typedRiskZones?.every((zone) => zone.code !== "fallback_targeting_only"));
    assert.ok(result.initialRiskZones.some((zone) => zone.code === "no_tests_detected"));
  },
);

await runScenario(
  "buildRiskAnalysisResult emits fallback-targeting-only only for valid all-fallback targeting and keeps shared codes aligned",
  async () => {
    const { taskParserResult } = createTaskParserResult(
      [
        "Migrate the runtime and package manifest while keeping the API contract stable.",
        "",
        "Acceptance Criteria",
        "- the migration plan is reflected in the runtime",
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
    const inferenceResult = createFallbackOnlyInferenceResult(["src/app.ts", "package.json"]);

    const result = buildRiskAnalysisResult({
      taskParserResult,
      repoScanResult,
      inferenceResult,
    });

    assert.ok(result.initialRiskZones.some((zone) => zone.code === "fallback_targeting_only"));
    assert.ok(result.typedRiskZones?.some((zone) => zone.code === "fallback_targeting_only"));

    const sharedCodes = new Set(result.initialRiskZones.map((zone) => zone.code));
    assert.ok(
      [...sharedCodes].every((code) => result.typedRiskZones?.some((zone) => zone.code === code)),
    );
  },
);

await runScenario(
  "buildRiskAnalysisResult records typed no-candidate and unresolved-path risks without relying on manifest impact",
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
    const inferenceResult = createInferenceResult({
      candidateTargets: [],
      signals: {
        explicitTargetCount: 0,
        usedFallbackTargets: false,
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

    assert.deepEqual(
      result.typedRiskZones?.map((zone) => zone.code),
      [
        "weak_repo_grounding",
        "unresolved_referenced_paths",
        "no_candidate_targets",
        "no_tests_detected",
        "test_strategy_risk",
      ],
    );
    assert.ok(
      result.typedRiskZones?.every((zone) => zone.code !== "manifest_or_config_impact"),
    );
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
      result.initialRiskZones.map((zone) => zone.code),
      [
        "weak_repo_grounding",
        "unresolved_referenced_paths",
        "no_tests_detected",
      ],
    );
    assert.equal(result.initialRiskZones[0]?.level, "high");
    assert.deepEqual(result.initialRiskZones[1]?.evidencePaths, [
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
        supplementalInputs: {
          notes: [],
          constraints: [],
          configPath: null,
          focusPaths: ["tests"],
        },
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
  "buildAmbiguityAnalysisResult keeps git-context failure messaging stable regardless of repo warning order",
  async () => {
    const { taskInput, taskParserResult } = createTaskParserResult(
      "Update src/app.ts for intake readiness.",
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        gitContext: createGitContext({
          status: "error",
        }),
      }),
      warnings: [
        "Some unrelated repo scan warning.",
        "Git enrichment failed, so filesystem grounding was used instead.",
      ],
    });
    const inferenceResult = createInferenceResult();

    const result = buildAmbiguityAnalysisResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions: resolveRuntimeOptions({}) as ResolvedRuntimeOptions,
      validationBlockingIssues: [],
      validationWarnings: [],
      validationRecommendedUserActions: [],
    });

    assert.ok(
      result.warningItems?.some((item) =>
        item.code === "GIT_CONTEXT_FAILED" &&
        item.message === "Git enrichment failed, so filesystem grounding was used instead."
      ),
      "expected git-context failure warning to use the stable canonical message",
    );
  },
);

await runScenario(
  "buildAmbiguityAnalysisResult emits strict-focus and fallback-targeting warnings with spec-aware repo-alignment wording",
  async () => {
    const { taskInput, taskParserResult } = createSpecTaskParserResult(
      [
        "# Tighten intake targeting",
        "",
        "Update src/missing.ts while keeping tests/missing.test.ts aligned.",
        "",
        "Acceptance Criteria",
        "- src/missing.ts behavior is updated",
      ].join("\n"),
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
      }),
    });
    const inferenceResult = {
      ...createFallbackOnlyInferenceResult(["src/app.ts"]),
      signals: {
        ...createFallbackOnlyInferenceResult(["src/app.ts"]).signals,
        focusApplied: true,
        strictFocusApplied: true,
        outOfFocusTargetCount: 1,
      },
    } satisfies InferenceResult;

    const result = buildAmbiguityAnalysisResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions: resolveRuntimeOptions({}) as ResolvedRuntimeOptions,
      validationBlockingIssues: [
        {
          code: "EXAMPLE_BLOCKER",
          message: "A blocking issue exists but should not be mirrored as a generic warning.",
        },
      ],
      validationWarnings: [],
      validationRecommendedUserActions: [],
    });

    assert.ok(
      result.warningItems?.some((item) => item.code === "STRICT_FOCUS_EXCLUDED_TARGETS"),
    );
    assert.ok(
      result.warningItems?.some((item) => item.code === "FALLBACK_TARGETING"),
    );
    const repoAlignment = result.ambiguityItems?.find((item) => item.type === "repo_alignment");
    assert.match(repoAlignment?.message ?? "", /^Spec references repo paths/i);
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /widen --focus or drop --strict-focus/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /reference concrete files or directories in the spec/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /fix the missing repo references in the spec/i.test(action),
      ),
    );
    assert.ok(
      result.warnings.every((warning) => !/blocking issue exists/i.test(warning)),
    );
  },
);

await runScenario(
  "buildAmbiguityAnalysisResult uses natural fallback wording when input mode is unavailable",
  async () => {
    const { taskParserResult } = createTaskParserResult(
      "Update src/missing.ts while keeping tests/missing.test.ts aligned.",
    );
    const repoScanResult = createRepoScanResult({
      repoContext: createRepoContext({
        allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
      }),
    });
    const inferenceResult = createFallbackOnlyInferenceResult(["src/app.ts"]);

    const result = buildAmbiguityAnalysisResult({
      taskInput: null,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions: resolveRuntimeOptions({}) as ResolvedRuntimeOptions,
      validationBlockingIssues: [],
      validationWarnings: [],
      validationRecommendedUserActions: [],
    });

    assert.ok(
      result.recommendedUserActions.some((action) =>
        /reference concrete files or directories in the task input/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.some((action) =>
        /fix the missing repo references in the input or clarify the intended replacement paths/i.test(action),
      ),
    );
    assert.ok(
      result.recommendedUserActions.every((action) => !/task input's/i.test(action)),
    );
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
    assert.ok(
      result.warningItems?.some((item) => item.code === "CONFIDENCE_DEGRADED"),
      "expected a structured confidence-degradation warning item",
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
