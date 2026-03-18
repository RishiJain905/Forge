import assert from "node:assert/strict";
import { join } from "node:path";

import { buildInferenceResult } from "../src/intake/inference.js";
import { resolveCandidateTargets } from "../src/intake/candidate-targets.js";
import { scanRepoResult } from "../src/intake/repo-context.js";
import type {
  CandidateTarget,
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

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
