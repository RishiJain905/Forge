import assert from "node:assert/strict";

import { buildArtifactSections } from "../src/intake/artifact-sections.js";
import { createIntakeArtifact } from "../src/intake/artifact.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { STEP1_BOUNDARY_POLICY } from "../src/intake/constants.js";
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
    ready: false,
    blockingIssues: [
      {
        code: "TASK_GOAL_MISSING",
        message: "Task goal is missing.",
      },
    ],
    recommendedUserActions: [
      "Provide a concrete task goal.",
    ],
  };
}

function createAssembledResult(overrides?: Partial<AssembledIntakeResult>): AssembledIntakeResult {
  const base: AssembledIntakeResult = {
    responsibilities: {
      taskParser: {
        taskSpec: {
          goal: "",
          acceptanceCriteria: [],
          hasAcceptanceCriteria: false,
        },
        signals: {
          hasGoal: false,
          hasAcceptanceCriteria: false,
          referencedPaths: ["package.json", "src/missing.ts"],
          promptIsThin: true,
          promptRequirementCandidateCount: 1,
          promptOpenQuestionCategories: ["acceptance_criteria", "scope", "constraints"],
        },
        ambiguities: ["Acceptance criteria are missing from the task input."],
        warnings: [],
        recommendedUserActions: ["Add explicit acceptance criteria to the task input before planning."],
      },
      repoScan: {
        repoContext: {
          grounded: true,
          sourceFiles: [],
          testFiles: [],
          manifestFiles: ["package.json"],
          allFiles: ["package.json"],
          gitContext: createGitContext(),
        },
        signals: {
          sourceFileCount: 0,
          testFileCount: 0,
          manifestFileCount: 1,
          repoLooksSparse: true,
        },
        warnings: [],
      },
      inference: {
        candidateTargets: [
          {
            path: "package.json",
            kind: "manifest",
            matchType: "fallback",
            reason: "Fallback target from repo structure.",
          },
        ],
        inferredRequirements: ["Review manifest impact before planning implementation steps."],
        signals: {
          explicitTargetCount: 0,
          usedFallbackTargets: true,
          inferredRequirementCount: 1,
        },
        warnings: ["Inference relied on fallback repo targets because the task input did not strongly map to explicit files."],
      },
      analysis: {
        ambiguities: ["Acceptance criteria are missing from the task input."],
        warnings: ["No tests were detected during repo grounding."],
        recommendedUserActions: ["Reference concrete files or directories in the task input to strengthen repo grounding."],
        confidence: {
          level: "low",
          signals: {
            taskParsing: "weak",
            repoInspection: "partial",
            targeting: "partial",
          },
          reasons: ["task parsing signals are weak", "targeting signals are only partial"],
        },
      },
    },
    taskSpec: {
      goal: "",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
    repoContext: {
      grounded: true,
      sourceFiles: [],
      testFiles: [],
      manifestFiles: ["package.json"],
      allFiles: ["package.json"],
      gitContext: createGitContext(),
    },
    candidateTargets: [
      {
        path: "package.json",
        kind: "manifest",
        matchType: "fallback",
        reason: "Fallback target from repo structure.",
      },
    ],
    ambiguities: ["Acceptance criteria are missing from the task input."],
    warnings: ["No tests were detected during repo grounding."],
    recommendedUserActions: ["Reference concrete files or directories in the task input to strengthen repo grounding."],
    confidence: {
      level: "low",
      signals: {
        taskParsing: "weak",
        repoInspection: "partial",
        targeting: "partial",
      },
      reasons: ["task parsing signals are weak", "targeting signals are only partial"],
    },
  };

  return {
    ...base,
    responsibilities: {
      ...base.responsibilities,
      ...overrides?.responsibilities,
    },
    ...overrides,
  };
}

function createBoundarySafeResult(): BoundarySafeIntakeResult {
  return {
    taskSpec: {
      goal: "",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
    repoContext: {
      grounded: true,
      sourceFiles: [],
      testFiles: [],
      manifestFiles: ["package.json"],
      allFiles: ["package.json"],
      gitContext: createGitContext(),
    },
    candidateTargets: [
      {
        path: "package.json",
        kind: "manifest",
        matchType: "fallback",
        reason: "Fallback target from repo structure.",
      },
    ],
    initialVerificationTargets: [],
    ambiguities: ["Acceptance criteria are missing from the task input."],
    warnings: ["No tests were detected during repo grounding."],
    recommendedUserActions: ["Reference concrete files or directories in the task input to strengthen repo grounding."],
    boundaryNotes: ["Step 1 emits pointer-only verification targets."],
  };
}

function createArtifact(overrides?: {
  assembledResult?: Partial<AssembledIntakeResult>;
  boundarySafeResult?: Partial<BoundarySafeIntakeResult>;
  nextStepReadiness?: NextStepReadiness;
  failure?: IntakeArtifact["failure"];
}): IntakeArtifact {
  const assembledResult = createAssembledResult(overrides?.assembledResult);
  const boundarySafeResult: BoundarySafeIntakeResult = {
    ...createBoundarySafeResult(),
    ...overrides?.boundarySafeResult,
  };

  return createIntakeArtifact({
    context: createContext(),
    finishedAt: "2026-03-17T00:01:00.000Z",
    sourceInputs: {
      input_mode: "prompt",
      primary_input: {
        path: null,
        raw_text: "Review package.json",
      },
      normalized_task_text: "Review package.json",
      notes: [],
      constraints: [],
      config_path: null,
      focus_paths: [],
    },
    runtimeOptions: resolveRuntimeOptions({}),
    assembledResult,
    boundarySafeResult,
    nextStepReadiness: overrides?.nextStepReadiness ?? createNextStepReadiness(),
    failure: overrides?.failure ?? null,
  });
}

await runScenario("intake artifact exposes snake_case public section keys and omits legacy camelCase keys", () => {
  const artifact = createArtifact();
  const artifactRecord = artifact as unknown as Record<string, unknown>;

  assert.ok("task_spec" in artifactRecord);
  assert.ok("repo_context" in artifactRecord);
  assert.ok("candidate_targets" in artifactRecord);
  assert.ok("risk_analysis" in artifactRecord);
  assert.ok("initial_verification_targets" in artifactRecord);
  assert.ok("confidence" in artifactRecord);
  assert.ok("next_step_readiness" in artifactRecord);
  assert.ok("git_context" in artifact.repo_context);

  assert.equal("taskSpec" in artifactRecord, false);
  assert.equal("repoContext" in artifactRecord, false);
  assert.equal("candidateTargets" in artifactRecord, false);
  assert.equal("initialVerificationTargets" in artifactRecord, false);
  assert.equal("nextStepReadiness" in artifactRecord, false);
  assert.equal("gitContext" in artifact.repo_context, false);
});

await runScenario("intake artifact normalizes section field names and keeps empty/default sections present", () => {
  const artifact = createArtifact({
    boundarySafeResult: {
      initialVerificationTargets: [],
      ambiguities: [],
      warnings: [],
      recommendedUserActions: [],
    },
    nextStepReadiness: {
      ready: true,
      blockingIssues: [],
      recommendedUserActions: [],
    },
  });

  assert.equal(artifact.task_spec.has_acceptance_criteria, false);
  assert.deepEqual(artifact.task_spec.acceptance_criteria, []);
  assert.deepEqual(artifact.repo_context.source_files, []);
  assert.deepEqual(artifact.repo_context.test_files, []);
  assert.deepEqual(artifact.initial_verification_targets, []);
  assert.equal(artifact.repo_context.git_context.status, "not_repo");
  assert.equal(artifact.repo_context.git_context.repo_root, null);
  assert.deepEqual(artifact.next_step_readiness.blocking_issues, []);
  assert.deepEqual(artifact.next_step_readiness.recommended_user_actions, []);
  assert.ok(Array.isArray(artifact.risk_analysis.initial_risk_zones));
  assert.ok(artifact.confidence);
});

await runScenario("intake artifact includes deterministic typed risk analysis zones", () => {
  const artifact = createArtifact();
  const codes = artifact.risk_analysis.initial_risk_zones.map((zone) => zone.code);

  assert.deepEqual(codes, [
    "weak_repo_grounding",
    "unresolved_referenced_paths",
    "fallback_targeting_only",
    "no_tests_detected",
    "manifest_or_config_impact",
  ]);

  for (const zone of artifact.risk_analysis.initial_risk_zones) {
    assert.match(zone.reason, /\S/);
    assert.ok(["medium", "high"].includes(zone.level));
    assert.ok(Array.isArray(zone.evidence_paths));
  }
});

await runScenario("intake artifact does not flag referenced repo files outside classified buckets as unresolved", () => {
  const artifact = createArtifact({
    assembledResult: {
      responsibilities: {
        ...createAssembledResult().responsibilities,
        taskParser: {
          ...createAssembledResult().responsibilities.taskParser,
          signals: {
            ...createAssembledResult().responsibilities.taskParser.signals,
            referencedPaths: ["docs/guide.md"],
          },
        },
      },
    },
    boundarySafeResult: {
      repoContext: {
        grounded: true,
        sourceFiles: [],
        testFiles: [],
        manifestFiles: ["package.json"],
        allFiles: ["package.json", "docs/guide.md"],
        gitContext: createGitContext(),
      },
    },
  });

  const unresolvedZone = artifact.risk_analysis.initial_risk_zones.find(
    (zone) => zone.code === "unresolved_referenced_paths",
  );

  assert.equal(unresolvedZone, undefined);
});

await runScenario("intake artifact exposes confidence as a stable public section", () => {
  const artifact = createArtifact();

  assert.equal(artifact.confidence.level, "low");
  assert.equal(artifact.confidence.signals.task_parsing, "weak");
  assert.equal(artifact.confidence.signals.repo_inspection, "partial");
  assert.equal(artifact.confidence.signals.targeting, "partial");
  assert.ok(artifact.confidence.reasons.some((reason) => /task parsing/i.test(reason)));
});

await runScenario("intake artifact projects ordered confidence reasons and weak repo inspection when test references are missing", () => {
  const artifact = createArtifact({
    assembledResult: {
      responsibilities: {
        ...createAssembledResult().responsibilities,
        analysis: {
          ambiguities: [],
          warnings: [],
          recommendedUserActions: [],
          confidence: {
            level: "low",
            signals: {
              taskParsing: "partial",
              repoInspection: "weak",
              targeting: "partial",
            },
            reasons: [
              "acceptance criteria are missing from the task input",
              "explicitly referenced test paths were not found during repo grounding",
              "candidate targeting relies on fallback repo structure",
            ],
          },
        },
      },
      confidence: {
        level: "low",
        signals: {
          taskParsing: "partial",
          repoInspection: "weak",
          targeting: "partial",
        },
        reasons: [
          "acceptance criteria are missing from the task input",
          "explicitly referenced test paths were not found during repo grounding",
          "candidate targeting relies on fallback repo structure",
        ],
      },
    },
  });

  assert.equal(artifact.confidence.level, "low");
  assert.equal(artifact.confidence.signals.repo_inspection, "weak");
  assert.deepEqual(artifact.confidence.reasons, [
    "acceptance criteria are missing from the task input",
    "explicitly referenced test paths were not found during repo grounding",
    "candidate targeting relies on fallback repo structure",
  ]);
});

await runScenario(
  "artifact sections projects prebuilt risk analysis and verification targets instead of deriving them",
  () => {
    const sections = buildArtifactSections({
      assembledResult: createAssembledResult(),
      boundarySafeResult: createBoundarySafeResult(),
      nextStepReadiness: createNextStepReadiness(),
      riskAnalysis: {
        initial_risk_zones: [
          {
            code: "manual_risk",
            level: "high",
            reason: "Manual risk should be projected without recomputation.",
            evidence_paths: ["src/app.ts"],
          },
        ],
      },
      initialVerificationTargets: [
        {
          path: "src/app.ts",
          kind: "source",
          reason: "Manual verification target should be projected without recomputation.",
        },
      ],
    } as any);

    assert.deepEqual(
      sections.risk_analysis.initial_risk_zones.map((zone) => zone.code),
      ["manual_risk"],
    );
    assert.deepEqual(
      sections.initial_verification_targets.map((target) => target.path),
      ["src/app.ts"],
    );
  },
);

await runScenario("failed artifacts still include detailed sections with safe defaults", () => {
  const artifact = createArtifact({
    assembledResult: {
      responsibilities: {
        ...createAssembledResult().responsibilities,
        inference: {
          candidateTargets: [],
          inferredRequirements: [],
          signals: {
            explicitTargetCount: 0,
            usedFallbackTargets: false,
            inferredRequirementCount: 0,
          },
          warnings: ["Inference could not produce candidate targets from the current task and repo evidence."],
        },
      },
      candidateTargets: [],
      warnings: ["Inference could not produce candidate targets from the current task and repo evidence."],
    },
    boundarySafeResult: {
      candidateTargets: [],
      initialVerificationTargets: [],
      warnings: ["Inference could not produce candidate targets from the current task and repo evidence."],
      ambiguities: [],
      recommendedUserActions: [],
    },
    nextStepReadiness: {
      ready: false,
      blockingIssues: [
        {
          code: "CANDIDATE_TARGETS_MISSING",
          message: "Forge intake could not produce any plausible candidate targets for the next step.",
        },
      ],
      recommendedUserActions: [],
    },
    failure: {
      code: "INPUT_VALIDATION_FAILED",
      message: "Forge intake found blocking input validation issues.",
    },
  });

  assert.equal(artifact.status, "failed");
  assert.deepEqual(artifact.candidate_targets, []);
  assert.deepEqual(artifact.initial_verification_targets, []);
  assert.ok(Array.isArray(artifact.risk_analysis.initial_risk_zones));
  assert.equal(artifact.next_step_readiness.ready, false);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
