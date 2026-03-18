import assert from "node:assert/strict";

import { assembleIntakeResult } from "../src/intake/assemble.js";
import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import type { ValidatedIntakeInputs } from "../src/intake/types.js";

function createPromptInput(prompt: string): ValidatedIntakeInputs {
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
  "assembled intake result keeps all four responsibility outputs on the final path",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        [
          "Revise src/app.ts and tests/app.test.ts.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- tests/app.test.ts is updated",
        ].join("\n"),
      ),
    );

    const assembled = assembleIntakeResult({
      taskInput,
      taskParserResult: {
        taskSpec: {
          goal: "Revise src/app.ts and tests/app.test.ts.",
          acceptanceCriteria: [
            "src/app.ts is updated",
            "tests/app.test.ts is updated",
          ],
          hasAcceptanceCriteria: true,
        },
        signals: {
          hasGoal: true,
          hasAcceptanceCriteria: true,
          referencedPaths: ["src/app.ts", "tests/app.test.ts"],
          promptIsThin: false,
          promptRequirementCandidateCount: 2,
          promptOpenQuestionCategories: [],
        },
        ambiguities: [],
        warnings: [],
        recommendedUserActions: [],
      },
      repoScanResult: {
        repoContext: {
          grounded: true,
          sourceFiles: ["src/app.ts"],
          testFiles: ["tests/app.test.ts"],
          manifestFiles: ["package.json"],
          allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
          gitContext: {
            status: "not_repo",
            repoRoot: null,
            branch: null,
            recentFiles: [],
          },
        },
        signals: {
          sourceFileCount: 1,
          testFileCount: 1,
          manifestFileCount: 1,
          repoLooksSparse: false,
        },
        warnings: [],
      },
      inferenceResult: {
        candidateTargets: [
          {
            path: "src/app.ts",
            kind: "source",
            matchType: "explicit",
            reason: "The task explicitly references src/app.ts.",
          },
          {
            path: "tests/app.test.ts",
            kind: "test",
            matchType: "explicit",
            reason: "The task explicitly references tests/app.test.ts.",
          },
        ],
        inferredRequirements: [],
        signals: {
          explicitTargetCount: 2,
          usedFallbackTargets: false,
          inferredRequirementCount: 0,
          focusApplied: false,
          strictFocusApplied: false,
          focusMatchedTargetCount: 0,
          outOfFocusTargetCount: 0,
        },
        warnings: [],
      },
      ambiguityAnalysisResult: {
        ambiguities: [],
        warnings: [],
        recommendedUserActions: [],
        confidence: {
          level: "high",
          signals: {
            taskParsing: "strong",
            repoInspection: "strong",
            targeting: "strong",
          },
          reasons: [],
        },
      },
    });

    assert.equal(assembled.responsibilities.taskParser.taskSpec.goal, "Revise src/app.ts and tests/app.test.ts.");
    assert.deepEqual(assembled.responsibilities.taskParser.taskSpec.acceptanceCriteria, [
      "src/app.ts is updated",
      "tests/app.test.ts is updated",
    ]);
    assert.deepEqual(assembled.responsibilities.taskParser.signals.referencedPaths, [
      "src/app.ts",
      "tests/app.test.ts",
    ]);
    assert.equal(assembled.responsibilities.repoScan.repoContext.sourceFiles[0], "src/app.ts");
    assert.equal(assembled.responsibilities.repoScan.repoContext.testFiles[0], "tests/app.test.ts");
    assert.equal(assembled.responsibilities.repoScan.signals.sourceFileCount, 1);
    assert.equal(assembled.responsibilities.inference.candidateTargets[0]?.path, "src/app.ts");
    assert.equal(assembled.responsibilities.inference.signals.explicitTargetCount, 2);
    assert.equal(assembled.responsibilities.analysis.confidence.level, "high");
    assert.deepEqual(assembled.taskSpec.acceptanceCriteria, [
      "src/app.ts is updated",
      "tests/app.test.ts is updated",
    ]);
    assert.ok(assembled.riskAnalysis, "expected assembled result to carry riskAnalysis");
    assert.ok(assembled.verificationTargets, "expected assembled result to carry verificationTargets");
    assert.equal(assembled.repoContext.manifestFiles[0], "package.json");
    assert.equal(assembled.candidateTargets[1]?.path, "tests/app.test.ts");
    assert.deepEqual(assembled.ambiguities, []);
    assert.deepEqual(assembled.warnings, []);
    assert.deepEqual(assembled.recommendedUserActions, []);
    assert.equal(assembled.confidence.level, "high");
  },
);

await runScenario(
  "input module exposes one runner-facing resolver for loading, validation, and normalization",
  async () => {
    const inputModule = (await import("../src/intake/input.js")) as Record<string, unknown>;

    assert.equal(
      typeof inputModule.resolveLoadedIntakeInput,
      "function",
      "expected input.ts to export resolveLoadedIntakeInput",
    );
    assert.equal(
      typeof inputModule.resolveIntakeInput,
      "function",
      "expected input.ts to export resolveIntakeInput",
    );
  },
);

await runScenario(
  "task parser exposes direct task-spec normalization",
  async () => {
    const taskParserModule = (await import("../src/intake/task-parser.js")) as Record<string, unknown>;

    assert.equal(
      typeof taskParserModule.normalizeTaskSpec,
      "function",
      "expected task-parser.ts to export normalizeTaskSpec",
    );
  },
);

await runScenario(
  "analysis module exposes direct risk analysis construction",
  async () => {
    const analysisModule = (await import("../src/intake/analysis.js")) as Record<string, unknown>;

    assert.equal(
      typeof analysisModule.buildRiskAnalysisResult,
      "function",
      "expected analysis.ts to export buildRiskAnalysisResult",
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
