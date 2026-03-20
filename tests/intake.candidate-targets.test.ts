import assert from "node:assert/strict";
import { join } from "node:path";

import { buildInferenceResult } from "../src/intake/inference.js";
import {
  NON_STRICT_FOCUS_WARNING,
  resolveCandidateTargeting,
  resolveCandidateTargets,
} from "../src/intake/candidate-targets.js";
import { scanRepoResult } from "../src/intake/repo-context.js";
import type {
  CandidateTarget,
  InferenceResult,
  NormalizedTaskInput,
  TaskParserResult,
  RepoContext,
} from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  writeRepoFile,
} from "./support/forge-cli.js";

interface FocusAwareTargetingOptions {
  focusPaths: string[];
  strictFocus: boolean;
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

function createNormalizedTaskInput(
  normalizedTaskText: string,
  focusPaths: string[] = [],
): NormalizedTaskInput {
  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: normalizedTaskText,
    },
    normalizedTaskText,
    parserInputText: normalizedTaskText,
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths,
    ambiguities: [],
    recommendedUserActions: [],
  };
}

function resolveWithFocus(
  taskInput: NormalizedTaskInput | null,
  repoContext: RepoContext,
  options: FocusAwareTargetingOptions,
): CandidateTarget[] {
  return (resolveCandidateTargets as unknown as (
    input: NormalizedTaskInput | null,
    context: RepoContext,
    focusOptions: FocusAwareTargetingOptions,
  ) => CandidateTarget[])(taskInput, repoContext, options);
}

function createRepoContext(overrides: Partial<RepoContext> = {}): RepoContext {
  return {
    grounded: true,
    sourceFiles: [],
    testFiles: [],
    manifestFiles: [],
    allFiles: [],
    gitContext: {
      status: "available",
      repoRoot: null,
      branch: null,
      recentFiles: [],
    },
    languages: [],
    frameworkHints: [],
    packageManager: null,
    keyDirectories: [],
    entryPoints: [],
    testFrameworkHints: [],
    testCommandHints: [],
    ciHints: [],
    layoutSummary: "",
    ...overrides,
  };
}

function createTaskParserResult(overrides: Partial<TaskParserResult> = {}): TaskParserResult {
  return {
    taskSpec: {
      title: "",
      summary: "",
      goal: "",
      scope: [],
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
      explicitRequirements: [],
      constraints: [],
      mentionedPaths: [],
      mentionedTests: [],
      mentionedModules: [],
      riskyPhrases: [],
      openQuestions: [],
      ...overrides.taskSpec,
    },
    signals: {
      hasGoal: true,
      hasAcceptanceCriteria: false,
      referencedPaths: [],
      promptIsThin: false,
      promptRequirementCandidateCount: 0,
      promptOpenQuestionCategories: [],
      ...overrides.signals,
    },
    ambiguityItems: overrides.ambiguityItems,
    warningItems: overrides.warningItems,
    ambiguities: overrides.ambiguities ?? [],
    warnings: overrides.warnings ?? [],
    recommendedUserActions: overrides.recommendedUserActions ?? [],
  };
}

function createInferenceResult(
  taskInput: NormalizedTaskInput | null,
  repoContext: RepoContext,
  taskParserResult: TaskParserResult,
): InferenceResult {
  return buildInferenceResult({
    taskInput,
    taskParserResult,
    repoScanResult: {
      repoContext,
      signals: {
        sourceFileCount: repoContext.sourceFiles.length,
        testFileCount: repoContext.testFiles.length,
        manifestFileCount: repoContext.manifestFiles.length,
        repoLooksSparse:
          repoContext.sourceFiles.length +
            repoContext.testFiles.length +
            repoContext.manifestFiles.length <=
          1,
        languages: repoContext.languages ?? [],
        packageManager: repoContext.packageManager ?? null,
        frameworkHints: repoContext.frameworkHints ?? [],
        testFrameworkHints: repoContext.testFrameworkHints ?? [],
        keyDirectories: repoContext.keyDirectories ?? [],
        entryPoints: repoContext.entryPoints ?? [],
        layoutSummary: repoContext.layoutSummary ?? "",
        testCommandHints: repoContext.testCommandHints ?? [],
        ciHints: repoContext.ciHints ?? [],
      },
      warnings: [],
    },
  });
}

await runScenario(
  "ordinary prose does not create false-positive explicit file matches",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/payments/flow.ts", "src/service/plan.ts", "src/server.ts"],
      testFiles: ["tests/payments/flow.test.ts"],
      allFiles: [
        "src/payments/flow.ts",
        "src/service/plan.ts",
        "src/server.ts",
        "tests/payments/flow.test.ts",
      ],
      entryPoints: ["src/server.ts"],
    });
    const inferenceResult = createInferenceResult(
      createNormalizedTaskInput("Improve the rollout flow and plan the next step for the service."),
      repoContext,
      createTaskParserResult({
        taskSpec: {
          goal: "Improve the rollout flow and plan the next step for the service.",
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
          mentionedModules: [],
        },
      }),
    );

    assert.equal(inferenceResult.candidateTargets[0]?.path, "src/server.ts");
    assert.ok(!inferenceResult.candidateTargets.some((target) => target.path === "src/payments/flow.ts"));
    assert.ok(!inferenceResult.candidateTargets.some((target) => target.path === "src/service/plan.ts"));
    assert.ok(inferenceResult.candidateTargets.every((target) => target.matchType === "fallback"));
  },
);

await runScenario(
  "buildInferenceResult uses mentioned module signals to target module files when the raw prompt omits the full path",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/alpha.ts", "src/payments/flow.ts", "src/zebra.ts"],
      testFiles: ["tests/alpha.test.ts", "tests/payments/flow.test.ts"],
      allFiles: [
        "src/alpha.ts",
        "src/payments/flow.ts",
        "src/zebra.ts",
        "tests/alpha.test.ts",
        "tests/payments/flow.test.ts",
      ],
    });
    const taskInput = createNormalizedTaskInput("Harden retry handling.");
    const inferenceResult = createInferenceResult(
      taskInput,
      repoContext,
      createTaskParserResult({
        taskSpec: {
          goal: "Harden retry handling.",
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
          mentionedModules: ["payments"],
        },
      }),
    );

    assert.ok(
      inferenceResult.candidateTargets.some(
        (target) => target.path === "src/payments/flow.ts" && target.matchType === "explicit",
      ),
    );
    assert.ok(
      inferenceResult.candidateTargets.some(
        (target) => target.path === "tests/payments/flow.test.ts" && target.kind === "test",
      ),
    );
    assert.ok(
      !inferenceResult.candidateTargets.some((target) => target.path === "src/alpha.ts"),
    );
    assert.equal(inferenceResult.signals.usedFallbackTargets, false);
  },
);

await runScenario(
  "buildInferenceResult targets prose-only module mentions when the parser extracts a module signal",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/auth/login.ts", "src/billing/plan.ts", "src/server.ts"],
      testFiles: ["tests/auth/login.test.ts", "tests/billing/plan.test.ts"],
      allFiles: [
        "src/auth/login.ts",
        "src/billing/plan.ts",
        "src/server.ts",
        "tests/auth/login.test.ts",
        "tests/billing/plan.test.ts",
      ],
      entryPoints: ["src/server.ts"],
    });
    const inferenceResult = createInferenceResult(
      createNormalizedTaskInput("Update auth module retry handling."),
      repoContext,
      createTaskParserResult({
        taskSpec: {
          goal: "Update auth module retry handling.",
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
          mentionedModules: ["auth"],
        },
      }),
    );

    assert.ok(
      inferenceResult.candidateTargets.some(
        (target) => target.path === "src/auth/login.ts" && target.matchType === "explicit",
      ),
    );
    assert.ok(
      inferenceResult.candidateTargets.some(
        (target) => target.path === "tests/auth/login.test.ts" && target.kind === "test",
      ),
    );
    assert.ok(
      !inferenceResult.candidateTargets.some((target) => target.path === "src/billing/plan.ts"),
    );
    assert.ok(
      !inferenceResult.candidateTargets.some((target) => target.path === "src/server.ts"),
    );
  },
);

await runScenario(
  "buildInferenceResult uses structured task signals to target files that raw prompt text does not name",
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
          '  "type": "module"',
          "}",
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "src/app.ts", "export const app = true;\n");
      await writeRepoFile(repoRoot, "src/goal.ts", "export const goal = true;\n");
      await writeRepoFile(repoRoot, "src/summary.ts", "export const summary = true;\n");
      await writeRepoFile(repoRoot, "src/zebra.ts", "export const zebra = true;\n");
      await writeRepoFile(repoRoot, "tests/app.test.ts", "export const appTest = true;\n");
      await writeRepoFile(repoRoot, "tests/zebra.test.ts", "export const zebraTest = true;\n");

      const taskInput: NormalizedTaskInput = {
        inputMode: "prompt",
        primaryInput: {
          path: null,
          rawText: "Refine rollout behavior.",
        },
        normalizedTaskText: "Refine rollout behavior.",
        parserInputText: "Refine rollout behavior.",
        notes: [],
        constraints: [],
        configPath: null,
        focusPaths: [],
        ambiguities: [],
        recommendedUserActions: [],
      };
      const taskParserResult: TaskParserResult = {
        taskSpec: {
          title: "Refine rollout behavior",
          summary: "",
          goal: "Refine rollout behavior.",
          scope: ["src/zebra.ts"],
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
          explicitRequirements: [],
          constraints: [],
          mentionedPaths: ["src/zebra.ts"],
          mentionedTests: ["tests/zebra.test.ts"],
          mentionedModules: ["zebra"],
          riskyPhrases: ["migration"],
          openQuestions: [],
        },
        signals: {
          hasGoal: true,
          hasAcceptanceCriteria: false,
          referencedPaths: [],
          promptIsThin: false,
          promptRequirementCandidateCount: 0,
          promptOpenQuestionCategories: [],
        },
        ambiguities: [],
        warnings: [],
        recommendedUserActions: [],
      };

      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });

      assert.ok(
        inferenceResult.candidateTargets.some(
          (target) => target.path === "src/zebra.ts" && target.matchType === "explicit",
        ),
      );
      assert.ok(
        inferenceResult.candidateTargets.some(
          (target) => target.path === "tests/zebra.test.ts" && target.kind === "test",
        ),
      );
      assert.ok(
        !inferenceResult.candidateTargets.some(
          (target) => target.path === "src/summary.ts" && target.matchType === "explicit",
        ),
      );
      assert.ok(
        !inferenceResult.candidateTargets.some(
          (target) => target.path === "src/goal.ts" && target.matchType === "explicit",
        ),
      );
      assert.ok(
        inferenceResult.candidateTargets.every((target) => target.path !== "src/app.ts" || target.matchType !== "fallback"),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "fallback ordering prefers layout signals over unrelated recent files",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/alpha.ts", "src/server.ts", "src/zebra.ts"],
      testFiles: ["tests/alpha.test.ts", "tests/server.test.ts", "tests/zebra.test.ts"],
      allFiles: [
        "src/alpha.ts",
        "src/server.ts",
        "src/zebra.ts",
        "tests/alpha.test.ts",
        "tests/server.test.ts",
        "tests/zebra.test.ts",
      ],
      entryPoints: ["src/server.ts", "src/alpha.ts"],
      gitContext: {
        status: "available",
        repoRoot: null,
        branch: null,
        recentFiles: ["tests/zebra.test.ts", "src/zebra.ts"],
      },
    });
    const targets = resolveCandidateTargets(
      createNormalizedTaskInput("Improve startup resilience for the service."),
      repoContext,
      {
        focusPaths: [],
        strictFocus: false,
      },
    );

    assert.deepEqual(
      targets.map((target) => target.path),
      ["src/server.ts", "tests/server.test.ts"],
    );
  },
);

await runScenario(
  "candidate targeting prefers entry-point fallback targets instead of the first alphabetical file",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/alpha.ts", "src/server.ts", "src/zebra.ts"],
      testFiles: ["tests/alpha.test.ts", "tests/server.test.ts"],
      allFiles: [
        "src/alpha.ts",
        "src/server.ts",
        "src/zebra.ts",
        "tests/alpha.test.ts",
        "tests/server.test.ts",
      ],
      entryPoints: ["src/server.ts", "src/alpha.ts"],
      gitContext: {
        status: "available",
        repoRoot: null,
        branch: null,
        recentFiles: ["tests/server.test.ts", "src/server.ts"],
      },
    });
    const targets = resolveCandidateTargets(
      createNormalizedTaskInput("Improve startup resilience for the service."),
      repoContext,
      {
        focusPaths: [],
        strictFocus: false,
      },
    );

    assert.deepEqual(
      targets.map((target) => target.path),
      ["src/server.ts", "tests/server.test.ts"],
    );
    assert.equal(targets[0]?.sharedRisk, true);
    assert.ok(targets.every((target) => target.matchType === "fallback"));
  },
);

await runScenario(
  "candidate targeting falls back to manifests when no source or test files exist",
  async () => {
    const targets = resolveCandidateTargets(
      createNormalizedTaskInput("Tighten release metadata validation."),
      createRepoContext({
        grounded: true,
        manifestFiles: ["package.json", "tsconfig.json"],
        allFiles: ["package.json", "tsconfig.json"],
      }),
      {
        focusPaths: [],
        strictFocus: false,
      },
    );

    assert.deepEqual(targets.map((target) => target.path), ["package.json"]);
    assert.equal(targets[0]?.kind, "manifest");
    assert.equal(targets[0]?.sharedRisk, true);
  },
);

await runScenario(
  "candidate targeting enriches explicit source matches with sibling tests and manifest mentions",
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

      const taskInput = createNormalizedTaskInput(
        [
          "Update src/app.ts and package.json so the TypeScript build stays aligned.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- package.json stays aligned with the implementation",
          "- tsconfig.json stays aligned with the implementation",
        ].join("\n"),
      );
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const targets = resolveWithFocus(taskInput, repoScanResult.repoContext, {
        focusPaths: [],
        strictFocus: false,
      });

      assert.ok(targets.some((target) => target.path === "src/app.ts" && target.kind === "source"));
      assert.ok(
        targets.some((target) => target.path === "tests/app.test.ts" && target.kind === "test"),
      );
      assert.ok(
        targets.some((target) => target.path === "package.json" && target.kind === "manifest"),
      );
      assert.ok(
        targets.some((target) => target.path === "tsconfig.json" && target.kind === "manifest"),
      );
      assert.ok(
        targets.some((target) =>
          target.path === "package.json" &&
          target.sharedRisk === true &&
          (target.notes ?? []).some((note) => /manifest|shared-risk/i.test(note))
        ),
      );
      assert.ok(
        targets.some((target) =>
          target.path === "src/app.ts" &&
          (target.notes ?? []).some((note) => /explicit/i.test(note))
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "resolveCandidateTargeting keeps non-focused targets after focused matches in non-strict mode and reports focus signals",
  async () => {
    const resolution = resolveCandidateTargeting(
      createNormalizedTaskInput("Update src/app.ts and tests/app.test.ts for focus behavior.", ["tests"]),
      createRepoContext({
        sourceFiles: ["src/app.ts"],
        testFiles: ["tests/app.test.ts"],
        allFiles: ["src/app.ts", "tests/app.test.ts"],
      }),
      {
        focusPaths: ["tests"],
        strictFocus: false,
      },
    );

    assert.deepEqual(
      resolution.candidateTargets.map((target) => target.path),
      ["tests/app.test.ts", "src/app.ts"],
    );
    assert.deepEqual(resolution.warnings, [NON_STRICT_FOCUS_WARNING]);
    assert.deepEqual(resolution.signals, {
      focusApplied: true,
      strictFocusApplied: false,
      focusMatchedTargetCount: 1,
      outOfFocusTargetCount: 1,
    });
  },
);

await runScenario(
  "candidate targeting prioritizes focus paths and filters out non-focused targets when strict focus is enabled",
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
          '  "type": "module"',
          "}",
        ].join("\n"),
      );

      const taskInput = createNormalizedTaskInput(
        [
          "Update src/app.ts and tests/app.test.ts for the focused intake behavior.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- tests/app.test.ts stays aligned",
        ].join("\n"),
        ["tests"],
      );
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const targets = resolveWithFocus(taskInput, repoScanResult.repoContext, {
        focusPaths: ["tests"],
        strictFocus: true,
      });

      assert.equal(targets[0]?.path, "tests/app.test.ts");
      assert.ok(targets.every((target) => target.path.startsWith("tests/")));
      assert.ok(!targets.some((target) => target.path === "src/app.ts"));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "resolveCandidateTargeting and buildInferenceResult return warnings with no targets when task input is null",
  async () => {
    const repoContext = createRepoContext({
      sourceFiles: ["src/app.ts"],
      testFiles: ["tests/app.test.ts"],
      allFiles: ["src/app.ts", "tests/app.test.ts"],
    });
    const targetingResolution = resolveCandidateTargeting(null, repoContext, {
      focusPaths: [],
      strictFocus: false,
    });
    const inferenceResult = createInferenceResult(null, repoContext, createTaskParserResult());

    assert.deepEqual(targetingResolution.candidateTargets, []);
    assert.ok(
      targetingResolution.warnings.some((warning) => /no normalized task input/i.test(warning)),
    );
    assert.deepEqual(inferenceResult.candidateTargets, []);
    assert.ok(
      inferenceResult.warnings.some((warning) => /no normalized task input/i.test(warning)),
    );
    assert.equal(inferenceResult.signals.usedFallbackTargets, false);
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
