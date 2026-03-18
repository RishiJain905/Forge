import assert from "node:assert/strict";

import { createIntakeArtifact } from "../src/intake/artifact.js";
import {
  INTAKE_ARTIFACT_TOP_LEVEL_KEYS,
  validateIntakeArtifact,
} from "../src/intake/artifact-schema.js";
import { FORGE_SCHEMA_VERSION, STEP1_BOUNDARY_POLICY } from "../src/intake/constants.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { createGitContext } from "./support/forge-cli.js";
import type {
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeArtifact,
  IntakeExecutionContext,
  NextStepReadiness,
} from "../src/intake/types.js";

async function runScenario(name: string, scenario: () => Promise<void> | void): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function createContext(): IntakeExecutionContext {
  return {
    command: "intake",
    repoRoot: "C:/repo",
    startedAt: "2026-03-17T00:00:00.000Z",
    boundaryPolicy: STEP1_BOUNDARY_POLICY,
    paths: {
      requestedOutputRoot: null,
      outputRoot: "C:/repo/.forge",
      usedFallbackRoot: false,
      fallbackReason: null,
      artifactPath: "C:/repo/.forge/intake.json",
      reportPath: "C:/repo/.forge/reports/intake-report.md",
      debugArtifactPath: "C:/repo/.forge/debug/intake-debug.json",
    },
  };
}

function createNextStepReadiness(): NextStepReadiness {
  return {
    ready: true,
    blockingIssues: [],
    recommendedUserActions: [],
  };
}

function createAssembledResult(): AssembledIntakeResult {
  return {
    responsibilities: {
      taskParser: {
        taskSpec: {
          goal: "Update src/app.ts",
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
        },
        signals: {
          hasGoal: true,
          hasAcceptanceCriteria: false,
          referencedPaths: ["src/app.ts"],
          promptIsThin: false,
          promptRequirementCandidateCount: 1,
          promptOpenQuestionCategories: [],
        },
        ambiguities: [],
        warnings: [],
        recommendedUserActions: [],
      },
      repoScan: {
        repoContext: {
          grounded: true,
          sourceFiles: ["src/app.ts"],
          testFiles: ["tests/app.test.ts"],
          manifestFiles: ["package.json"],
          allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
          gitContext: createGitContext(),
        },
        signals: {
          sourceFileCount: 1,
          testFileCount: 1,
          manifestFileCount: 1,
          repoLooksSparse: false,
        },
        warnings: [],
      },
      inference: {
        candidateTargets: [
          {
            path: "src/app.ts",
            kind: "source",
            matchType: "explicit",
            reason: "Explicitly mentioned in task input.",
          },
        ],
        inferredRequirements: [],
        signals: {
          explicitTargetCount: 1,
          usedFallbackTargets: false,
          inferredRequirementCount: 0,
        },
        warnings: [],
      },
      analysis: {
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
    },
    taskSpec: {
      goal: "Update src/app.ts",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
    repoContext: {
      grounded: true,
      sourceFiles: ["src/app.ts"],
      testFiles: ["tests/app.test.ts"],
      manifestFiles: ["package.json"],
      allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
      gitContext: createGitContext(),
    },
    candidateTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        matchType: "explicit",
        reason: "Explicitly mentioned in task input.",
      },
    ],
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
  };
}

function createBoundarySafeResult(): BoundarySafeIntakeResult {
  return {
    taskSpec: {
      goal: "Update src/app.ts",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
    repoContext: {
      grounded: true,
      sourceFiles: ["src/app.ts"],
      testFiles: ["tests/app.test.ts"],
      manifestFiles: ["package.json"],
      allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
      gitContext: createGitContext(),
    },
    candidateTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        matchType: "explicit",
        reason: "Explicitly mentioned in task input.",
      },
    ],
    initialVerificationTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        reason: "Initial verification surface.",
      },
    ],
    ambiguities: [],
    warnings: [],
    recommendedUserActions: [],
    boundaryNotes: ["Step 1 writes only intake outputs."],
  };
}

function createValidArtifact(): IntakeArtifact {
  return createIntakeArtifact({
    context: createContext(),
    finishedAt: "2026-03-17T00:01:00.000Z",
    sourceInputs: {
      input_mode: "prompt",
      primary_input: {
        path: null,
        raw_text: "Update src/app.ts",
      },
      normalized_task_text: "Update src/app.ts",
      notes: [],
      constraints: [],
      config_path: null,
      focus_paths: [],
    },
    runtimeOptions: resolveRuntimeOptions({}),
    assembledResult: createAssembledResult(),
    boundarySafeResult: createBoundarySafeResult(),
    nextStepReadiness: createNextStepReadiness(),
    failure: null,
  });
}

await runScenario("intake artifact exposes the exact expected top-level keys", () => {
  const artifact = createValidArtifact();

  assert.deepEqual(
    Object.keys(artifact).sort(),
    [...INTAKE_ARTIFACT_TOP_LEVEL_KEYS].sort(),
  );
});

await runScenario("intake artifact preserves schema, command, and stage metadata", () => {
  const artifact = createValidArtifact();

  assert.equal(artifact.schemaVersion, FORGE_SCHEMA_VERSION);
  assert.notEqual(
    artifact.schemaVersion,
    "1.0.0",
    "breaking artifact contract changes must advance the schema version",
  );
  assert.equal(artifact.command, "forge intake");
  assert.equal(artifact.stage, STEP1_BOUNDARY_POLICY.stage);
  assert.equal(artifact.repo_context.git_context.status, "not_repo");
  assert.equal(artifact.repo_context.git_context.repo_root, null);
});

await runScenario("artifact schema rejects a missing schemaVersion", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown>;
  delete artifact.schemaVersion;

  assert.throws(() => validateIntakeArtifact(artifact), /schemaVersion/i);
});

await runScenario("artifact schema rejects a missing top-level sub-result", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown>;
  delete artifact.task_spec;

  assert.throws(() => validateIntakeArtifact(artifact), /task_spec/i);
});

await runScenario("artifact schema rejects an invalid status value", () => {
  const artifact = {
    ...createValidArtifact(),
    status: "pending",
  };

  assert.throws(() => validateIntakeArtifact(artifact), /status/i);
});

await runScenario("artifact schema rejects extra top-level fields", () => {
  const artifact = {
    ...createValidArtifact(),
    unexpected_top_level_field: true,
  };

  assert.throws(() => validateIntakeArtifact(artifact), /unrecognized|unexpected/i);
});

await runScenario("artifact schema rejects legacy camelCase section keys", () => {
  const artifact = {
    ...createValidArtifact(),
    taskSpec: {
      goal: "legacy",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
  };

  assert.throws(() => validateIntakeArtifact(artifact), /unrecognized|unexpected|taskSpec/i);
});

await runScenario("artifact schema preserves strict_focus inside runtime_options", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown> & {
    runtime_options: Record<string, unknown>;
  };

  artifact.runtime_options = {
    ...artifact.runtime_options,
    strict_focus: true,
  };

  const parsed = validateIntakeArtifact(artifact);

  assert.equal(
    (parsed.runtime_options as { strict_focus?: boolean }).strict_focus,
    true,
  );
});

await runScenario("artifact schema accepts richer Batch 3 task and repo context fields", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown> & {
    task_spec: Record<string, unknown>;
    repo_context: Record<string, unknown>;
  };

  artifact.task_spec = {
    ...artifact.task_spec,
    title: "Update app behavior",
    summary: "Spec summary",
    scope: ["src/app.ts"],
    explicit_requirements: ["Keep the retry flow stable"],
    constraints: ["Do not change public APIs."],
    mentioned_paths: ["src/app.ts", "tests/app.test.ts"],
    mentioned_tests: ["tests/app.test.ts"],
    mentioned_modules: ["app"],
    risky_phrases: ["migration"],
    open_questions: [
      {
        category: "scope",
        text: "Which surface should change?",
      },
    ],
  };

  artifact.repo_context = {
    ...artifact.repo_context,
    languages: ["typescript"],
    framework_hints: ["Node.js", "TypeScript"],
    package_manager: "npm",
    key_directories: ["src", "tests"],
    entry_points: ["src/app.ts"],
    test_framework_hints: ["Vitest"],
    layout_summary:
      "languages: typescript; package manager: npm; key directories: src, tests; entry points: src/app.ts; manifests: package.json",
  };

  const parsed = validateIntakeArtifact(artifact) as unknown as {
    task_spec: {
      title?: string | null;
      summary?: string | null;
      scope?: string[];
      explicit_requirements?: string[];
      constraints?: string[];
      mentioned_paths?: string[];
      mentioned_tests?: string[];
      mentioned_modules?: string[];
      risky_phrases?: string[];
      open_questions?: Array<{ category: string; text: string }>;
    };
    repo_context: {
      languages?: string[];
      framework_hints?: string[];
      package_manager?: string | null;
      key_directories?: string[];
      entry_points?: string[];
      test_framework_hints?: string[];
      layout_summary?: string | null;
    };
  };

  assert.equal(parsed.task_spec.title, "Update app behavior");
  assert.equal(parsed.task_spec.summary, "Spec summary");
  assert.deepEqual(parsed.task_spec.scope, ["src/app.ts"]);
  assert.deepEqual(parsed.task_spec.explicit_requirements, ["Keep the retry flow stable"]);
  assert.deepEqual(parsed.task_spec.constraints, ["Do not change public APIs."]);
  assert.deepEqual(parsed.task_spec.mentioned_paths, ["src/app.ts", "tests/app.test.ts"]);
  assert.deepEqual(parsed.task_spec.mentioned_tests, ["tests/app.test.ts"]);
  assert.deepEqual(parsed.task_spec.mentioned_modules, ["app"]);
  assert.deepEqual(parsed.task_spec.risky_phrases, ["migration"]);
  assert.deepEqual(parsed.task_spec.open_questions, [
    {
      category: "scope",
      text: "Which surface should change?",
    },
  ]);
  assert.deepEqual(parsed.repo_context.languages, ["typescript"]);
  assert.deepEqual(parsed.repo_context.framework_hints, ["Node.js", "TypeScript"]);
  assert.equal(parsed.repo_context.package_manager, "npm");
  assert.deepEqual(parsed.repo_context.key_directories, ["src", "tests"]);
  assert.deepEqual(parsed.repo_context.entry_points, ["src/app.ts"]);
  assert.deepEqual(parsed.repo_context.test_framework_hints, ["Vitest"]);
  assert.match(parsed.repo_context.layout_summary ?? "", /languages: typescript/i);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
