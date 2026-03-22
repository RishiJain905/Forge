import assert from "node:assert/strict";

import { createIntakeArtifact } from "../src/intake/artifact.js";
import { STEP1_BOUNDARY_POLICY } from "../src/intake/constants.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { createIntakeReport } from "../src/intake/report.js";
import { createGitContext } from "./support/forge-cli.js";
import type {
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeArtifact,
  IntakeExecutionContext,
  NextStepReadiness,
  ResolvedRuntimeOptions,
} from "../src/intake/types.js";

const REQUIRED_HEADINGS = [
  "## Overview",
  "## Purpose",
  "## Source Inputs",
  "## Runtime Options",
  "## Task Spec",
  "## Repo Context",
  "## Candidate Targets",
  "## Assumptions",
  "## Risk Analysis",
  "## Initial Verification Targets",
  "## Ambiguities",
  "## Confidence",
  "## Next Step Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Warnings",
  "## Failure",
  "## Summary",
] as const;

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

function createReadyNextStepReadiness(): NextStepReadiness {
  return {
    ready: true,
    blockingIssues: [],
    recommendedUserActions: [],
  };
}

function createBaseAssembledResult(): AssembledIntakeResult {
  return {
    responsibilities: {
      taskParser: {
        taskSpec: {
          goal: "Update app behavior.",
          acceptanceCriteria: [
            "src/app.ts is updated",
            "tests/app.test.ts stays aligned",
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
          reasons: [
            "Task parsing, repo grounding, and target mapping are all explicit.",
          ],
        },
      },
    },
    taskSpec: {
      goal: "Update app behavior.",
      acceptanceCriteria: [
        "src/app.ts is updated",
        "tests/app.test.ts stays aligned",
      ],
      hasAcceptanceCriteria: true,
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
        reason: "The task explicitly references src/app.ts.",
      },
      {
        path: "tests/app.test.ts",
        kind: "test",
        matchType: "explicit",
        reason: "The task explicitly references tests/app.test.ts.",
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
      reasons: [
        "Task parsing, repo grounding, and target mapping are all explicit.",
      ],
    },
  };
}

function createBaseBoundarySafeResult(): BoundarySafeIntakeResult {
  return {
    taskSpec: {
      goal: "Update app behavior.",
      acceptanceCriteria: [
        "src/app.ts is updated",
        "tests/app.test.ts stays aligned",
      ],
      hasAcceptanceCriteria: true,
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
        reason: "The task explicitly references src/app.ts.",
      },
      {
        path: "tests/app.test.ts",
        kind: "test",
        matchType: "explicit",
        reason: "The task explicitly references tests/app.test.ts.",
      },
    ],
    initialVerificationTargets: [
      {
        path: "tests/app.test.ts",
        kind: "test",
        reason: "This existing test file should validate the intake target mapping.",
      },
    ],
    ambiguities: [],
    warnings: [],
    recommendedUserActions: [],
    boundaryNotes: [
      "Step 1 emits pointer-only verification targets and defers implementation work to later steps.",
    ],
  };
}

function createArtifact(params?: {
  runtimeOptions?: ResolvedRuntimeOptions;
  mutateAssembledResult?: (result: AssembledIntakeResult) => void;
  mutateBoundarySafeResult?: (result: BoundarySafeIntakeResult) => void;
  nextStepReadiness?: NextStepReadiness;
  failure?: IntakeArtifact["failure"];
}): IntakeArtifact {
  const assembledResult = createBaseAssembledResult();
  const boundarySafeResult = createBaseBoundarySafeResult();

  params?.mutateAssembledResult?.(assembledResult);
  params?.mutateBoundarySafeResult?.(boundarySafeResult);

  return createIntakeArtifact({
    context: createContext(),
    finishedAt: "2026-03-17T00:01:00.000Z",
    sourceInputs: {
      input_mode: "prompt",
      primary_input: {
        path: null,
        raw_text: "Update src/app.ts and tests/app.test.ts.",
      },
      normalized_task_text: "Update src/app.ts and tests/app.test.ts.",
      notes: [],
      constraints: [],
      config_path: null,
      focus_paths: [],
    },
    runtimeOptions: params?.runtimeOptions ?? resolveRuntimeOptions({}),
    assembledResult,
    boundarySafeResult,
    nextStepReadiness: params?.nextStepReadiness ?? createReadyNextStepReadiness(),
    failure: params?.failure ?? null,
  });
}

function extractLevelTwoHeadings(report: string): string[] {
  return report
    .split("\n")
    .filter((line) => line.startsWith("## "));
}

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

await runScenario("intake report includes the full stable heading contract in order", () => {
  const report = createIntakeReport(createArtifact());

  assert.deepEqual(extractLevelTwoHeadings(report), [...REQUIRED_HEADINGS]);
  assert.match(report, /## Overview/);
  assert.match(report, /## Assumptions/);
  assert.match(report, /Git status:\s+`not_repo`/i);
  assert.match(report, /## Failure[\s\S]*?- none/);
});

await runScenario("intake report overview surfaces confidence and signal counts", () => {
  const report = createIntakeReport(createArtifact({
    mutateAssembledResult: (result) => {
      result.confidence = {
        level: "low",
        signals: {
          taskParsing: "weak",
          repoInspection: "partial",
          targeting: "weak",
        },
        reasons: [
          "The prompt leaves multiple open questions unresolved.",
        ],
      };
      result.responsibilities.analysis.confidence = result.confidence;
    },
    mutateBoundarySafeResult: (result) => {
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
        "No tests were detected during repo grounding.",
      ];
      result.ambiguities = [
        "Acceptance criteria are missing from the task input.",
        "The prompt is too short to identify concrete files confidently.",
        "The task references multiple surfaces.",
      ];
    },
    nextStepReadiness: {
      ready: false,
      blockingIssues: [
        {
          code: "MISSING_ACCEPTANCE_CRITERIA",
          message: "Acceptance criteria are missing from the task input.",
        },
      ],
      recommendedUserActions: [],
    },
  }));

  assert.match(
    report,
    /## Overview[\s\S]*Signal summary:\s+confidence\s+`low`,\s+2 warnings,\s+3 ambiguities,\s+1 blocking issue\./i,
  );
});

await runScenario("intake report explains readiness-blocked failures without bare none", () => {
  const report = createIntakeReport(createArtifact({
    nextStepReadiness: {
      ready: false,
      blockingIssues: [
        {
          code: "MISSING_ACCEPTANCE_CRITERIA",
          message: "Acceptance criteria are missing from the task input.",
        },
        {
          code: "CANDIDATE_TARGETS_MISSING",
          message: "Forge intake could not produce any plausible candidate targets for the next step.",
        },
      ],
      recommendedUserActions: [
        "Add concrete files or directories to the task input.",
      ],
    },
    failure: null,
  }));

  assert.match(report, /## Failure/);
  assert.match(report, /No runtime or persistence failure details were captured\./i);
  assert.match(report, /driven by readiness blockers/i);
  assert.match(report, /## Next Step Readiness[\s\S]*MISSING_ACCEPTANCE_CRITERIA/);
  assert.doesNotMatch(report, /## Failure[\s\S]*?- none/);
});

await runScenario("intake report renders available git context details when present", () => {
  const report = createIntakeReport(createArtifact({
    mutateBoundarySafeResult: (result) => {
      result.repoContext.gitContext = createGitContext({
        status: "available",
        repoRoot: "C:/repo",
        branch: "main",
        recentFiles: ["src/app.ts", "tests/app.test.ts"],
      });
    },
  }));

  assert.match(report, /Git status:\s+`available`/i);
  assert.match(report, /Git repo root:\s+`C:\/repo`/i);
  assert.match(report, /Git branch:\s+`main`/i);
  assert.match(report, /## Repo Context[\s\S]*## Candidate Targets/);
  assert.match(report, /Recent Git Files/);
  assert.match(report, /src\/app\.ts/);
});

await runScenario("intake report derives assumptions from artifact evidence without overstating certainty", () => {
  const report = createIntakeReport(createArtifact({
    mutateAssembledResult: (result) => {
      result.responsibilities.taskParser.signals.referencedPaths = ["package.json"];
      result.responsibilities.repoScan.repoContext.testFiles = [];
      result.responsibilities.repoScan.signals.testFileCount = 0;
      result.responsibilities.inference.candidateTargets = [
        {
          path: "package.json",
          kind: "manifest",
          matchType: "fallback",
          reason: "Fallback target from repo structure.",
        },
      ];
      result.responsibilities.inference.signals.explicitTargetCount = 0;
      result.responsibilities.inference.signals.usedFallbackTargets = true;
      result.responsibilities.analysis.ambiguities = [
        "Acceptance criteria are missing from the task input.",
      ];
      result.responsibilities.analysis.warnings = [
        "No tests were detected during repo grounding.",
      ];
      result.responsibilities.analysis.recommendedUserActions = [
        "Add explicit acceptance criteria before planning.",
      ];
      result.responsibilities.analysis.confidence = {
        level: "low",
        signals: {
          taskParsing: "weak",
          repoInspection: "partial",
          targeting: "partial",
        },
        reasons: [
          "Task input is still ambiguous.",
          "Targeting depends on fallback repo structure.",
        ],
      };
      result.taskSpec.acceptanceCriteria = [];
      result.taskSpec.hasAcceptanceCriteria = false;
      result.candidateTargets = [{
        path: "package.json",
        kind: "manifest",
        matchType: "fallback",
        reason: "Fallback target from repo structure.",
      }];
      result.ambiguities = [
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
        "No tests were detected during repo grounding.",
      ];
      result.recommendedUserActions = [
        "Add explicit acceptance criteria before planning.",
      ];
      result.confidence = result.responsibilities.analysis.confidence;
      result.repoContext.testFiles = [];
      result.repoContext.allFiles = ["package.json"];
    },
    mutateBoundarySafeResult: (result) => {
      result.candidateTargets = [{
        path: "package.json",
        kind: "manifest",
        matchType: "fallback",
        reason: "Fallback target from repo structure.",
      }];
      result.ambiguities = [
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
        "No tests were detected during repo grounding.",
      ];
      result.recommendedUserActions = [
        "Add explicit acceptance criteria before planning.",
      ];
      result.repoContext.testFiles = [];
      result.repoContext.allFiles = ["package.json"];
    },
    nextStepReadiness: {
      ready: true,
      blockingIssues: [],
      recommendedUserActions: [
        "Add explicit acceptance criteria before planning.",
      ],
    },
  }));

  assert.match(report, /## Assumptions/);
  assert.match(report, /inline prompt/i);
  assert.match(report, /fallback/i);
  assert.match(report, /no test files/i);
  assert.match(report, /## Confidence/);
  assert.match(report, /low/);
  assert.doesNotMatch(report, /\bhigh confidence\b|\bcertain\b|\bdefinitive\b/i);
});

await runScenario("intake report keeps useful repo context visible when candidate targets are missing", () => {
  const report = createIntakeReport(createArtifact({
    mutateAssembledResult: (result) => {
      result.responsibilities.inference.candidateTargets = [];
      result.responsibilities.inference.signals.explicitTargetCount = 0;
      result.responsibilities.inference.signals.usedFallbackTargets = false;
      result.taskSpec.acceptanceCriteria = [];
      result.taskSpec.hasAcceptanceCriteria = false;
      result.candidateTargets = [];
      result.ambiguities = [
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
      ];
    },
    mutateBoundarySafeResult: (result) => {
      result.candidateTargets = [];
      result.ambiguities = [
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
      ];
    },
    nextStepReadiness: {
      ready: false,
      blockingIssues: [
        {
          code: "CANDIDATE_TARGETS_MISSING",
          message: "Forge intake could not produce any plausible candidate targets for the next step.",
        },
      ],
      recommendedUserActions: [
        "Reference concrete files or directories in the task input to strengthen repo grounding.",
      ],
    },
    failure: {
      code: "CANDIDATE_TARGETS_MISSING",
      message: "Forge intake could not produce any plausible candidate targets for the next step.",
    },
  }));

  assert.match(report, /## Repo Context/);
  assert.match(report, /Source files found: 1/);
  assert.match(report, /## Candidate Targets[\s\S]*?- none/);
  assert.match(report, /## Next Step Readiness/);
  assert.match(report, /CANDIDATE_TARGETS_MISSING/);
});

await runScenario("intake report renders prompt-mode open questions and recommended follow-up actions", () => {
  const report = createIntakeReport(createArtifact({
    mutateAssembledResult: (result) => {
      result.ambiguities = [
        "The prompt is too short to identify concrete files confidently.",
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
      ];
      result.recommendedUserActions = [
        "Expand the prompt with the intended files and success criteria.",
      ];
      result.confidence = {
        level: "low",
        signals: {
          taskParsing: "weak",
          repoInspection: "partial",
          targeting: "weak",
        },
        reasons: [
          "The prompt leaves multiple open questions unresolved.",
        ],
      };
      result.responsibilities.analysis.ambiguities = [...result.ambiguities];
      result.responsibilities.analysis.warnings = [...result.warnings];
      result.responsibilities.analysis.recommendedUserActions = [...result.recommendedUserActions];
      result.responsibilities.analysis.confidence = result.confidence;
    },
    mutateBoundarySafeResult: (result) => {
      result.ambiguities = [
        "The prompt is too short to identify concrete files confidently.",
        "Acceptance criteria are missing from the task input.",
      ];
      result.warnings = [
        "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
      ];
      result.recommendedUserActions = [
        "Expand the prompt with the intended files and success criteria.",
      ];
    },
    nextStepReadiness: {
      ready: true,
      blockingIssues: [],
      recommendedUserActions: [
        "Expand the prompt with the intended files and success criteria.",
      ],
    },
  }));

  assert.match(report, /## Ambiguities/);
  assert.match(report, /too short/i);
  assert.match(report, /## Next Step Readiness/);
  assert.match(report, /Expand the prompt with the intended files and success criteria\./);
});

await runScenario("intake report renders richer Batch 3 task and repo metadata", () => {
  const report = createIntakeReport(createArtifact({
    mutateBoundarySafeResult: (result) => {
      result.taskSpec = {
        title: "Update app behavior",
        summary: "Spec summary",
        goal: "Revise src/app.ts and keep tests aligned.",
        scope: ["src/app.ts"],
        explicitRequirements: ["Keep the retry flow stable"],
        implementationNecessities: ["Add or update tests for the touched behavior."],
        constraints: ["Do not change public APIs."],
        mentionedPaths: ["src/app.ts", "tests/app.test.ts"],
        mentionedTests: ["tests/app.test.ts"],
        mentionedModules: ["app"],
        riskyPhrases: ["migration"],
        openQuestions: [
          {
            category: "scope",
            text: "Which surface should change?",
          },
        ],
        acceptanceCriteria: [
          "src/app.ts is updated",
        ],
        hasAcceptanceCriteria: true,
      };
      result.repoContext = {
        grounded: true,
        sourceFiles: ["src/app.ts"],
        testFiles: ["tests/app.test.ts"],
        manifestFiles: ["package.json"],
        allFiles: ["package.json", "src/app.ts", "tests/app.test.ts"],
        gitContext: createGitContext({
          status: "available",
          repoRoot: "C:/repo",
          branch: "main",
          recentFiles: ["src/app.ts"],
        }),
        languages: ["typescript"],
        frameworkHints: ["Node.js", "TypeScript"],
        packageManager: "npm",
        keyDirectories: ["src", "tests"],
        entryPoints: ["src/app.ts"],
        testFrameworkHints: ["Vitest"],
        testCommandHints: ["npm test"],
        ciHints: ["GitHub Actions"],
        layoutSummary:
          "languages: typescript; package manager: npm; key directories: src, tests; entry points: src/app.ts; manifests: package.json",
      };
    },
    mutateAssembledResult: (result) => {
      result.taskSpec = {
        title: "Update app behavior",
        summary: "Spec summary",
        goal: "Revise src/app.ts and keep tests aligned.",
        scope: ["src/app.ts"],
        explicitRequirements: ["Keep the retry flow stable"],
        implementationNecessities: ["Add or update tests for the touched behavior."],
        constraints: ["Do not change public APIs."],
        mentionedPaths: ["src/app.ts", "tests/app.test.ts"],
        mentionedTests: ["tests/app.test.ts"],
        mentionedModules: ["app"],
        riskyPhrases: ["migration"],
        openQuestions: [
          {
            category: "scope",
            text: "Which surface should change?",
          },
        ],
        acceptanceCriteria: [
          "src/app.ts is updated",
        ],
        hasAcceptanceCriteria: true,
      };
      result.repoContext = {
        grounded: true,
        sourceFiles: ["src/app.ts"],
        testFiles: ["tests/app.test.ts"],
        manifestFiles: ["package.json"],
        allFiles: ["package.json", "src/app.ts", "tests/app.test.ts"],
        gitContext: createGitContext({
          status: "available",
          repoRoot: "C:/repo",
          branch: "main",
          recentFiles: ["src/app.ts"],
        }),
        languages: ["typescript"],
        frameworkHints: ["Node.js", "TypeScript"],
        packageManager: "npm",
        keyDirectories: ["src", "tests"],
        entryPoints: ["src/app.ts"],
        testFrameworkHints: ["Vitest"],
        testCommandHints: ["npm test"],
        ciHints: ["GitHub Actions"],
        layoutSummary:
          "languages: typescript; package manager: npm; key directories: src, tests; entry points: src/app.ts; manifests: package.json",
      };
    },
  }));

  assert.match(report, /## Task Spec/);
  assert.match(report, /Title:\s+Update app behavior/);
  assert.match(report, /Summary:\s+Spec summary/);
  assert.match(report, /Scope:\s+src\/app\.ts/);
  assert.match(report, /### Explicit Requirements/);
  assert.match(report, /### Implementation Necessities/);
  assert.match(report, /Add or update tests for the touched behavior\./);
  assert.match(report, /### Open Questions/);
  assert.match(report, /## Repo Context/);
  assert.match(report, /Languages:\s+typescript/);
  assert.match(report, /Framework Hints:\s+Node\.js, TypeScript/);
  assert.match(report, /Package Manager:\s+npm/);
  assert.match(report, /Entry Points:\s+src\/app\.ts/);
  assert.match(report, /Test Framework Hints:\s+Vitest/);
  assert.match(report, /Test Command Hints:\s+npm test/);
  assert.match(report, /CI Hints:\s+GitHub Actions/);
  assert.match(report, /Layout Summary:\s+languages: typescript/i);
});

await runScenario("intake report keeps output file metadata accurate in report-only mode", () => {
  const report = createIntakeReport(createArtifact({
    runtimeOptions: resolveRuntimeOptions({ reportOnly: true }),
  }));

  assert.match(report, /## Output Files/);
  assert.match(report, /Artifact: none/i);
  assert.match(report, /Report:\s+`C:\/repo\/\.forge\/reports\/intake-report\.md`/i);
});

await runScenario("intake report renders strict focus in runtime options", () => {
  type IntakeArtifactWithStrictFocus = IntakeArtifact & {
    runtime_options: NonNullable<IntakeArtifact["runtime_options"]> & {
      strict_focus?: boolean;
    };
  };

  const artifact = createArtifact() as IntakeArtifactWithStrictFocus;
  artifact.runtime_options = {
    ...artifact.runtime_options,
    strict_focus: true,
  };

  const report = createIntakeReport(artifact as IntakeArtifact);

  assert.match(report, /## Runtime Options[\s\S]*Strict focus:\s+`true`/i);
});

await runScenario("intake report renders nested targeting and typed analysis detail under existing headings", () => {
  const report = createIntakeReport(createArtifact({
    mutateAssembledResult: (result) => {
      result.responsibilities.analysis.ambiguityItems = [
        {
          type: "scope",
          severity: "medium",
          message: "The exact implementation surface is still unclear.",
        },
      ];
      result.responsibilities.analysis.warningItems = [
        {
          code: "NO_TESTS_DETECTED",
          message: "No tests were detected during repo grounding.",
        },
      ];
      result.riskAnalysis = {
        initialRiskZones: [
          {
            code: "manifest_or_config_impact",
            level: "medium",
            reason: "Manifest impact should be reviewed.",
            evidencePaths: ["package.json"],
          },
        ],
        typedRiskZones: [
          {
            code: "api_compatibility_risk",
            level: "medium",
            reason: "Downstream API callers may need explicit validation.",
            evidencePaths: ["package.json", "src/app.ts"],
          },
        ],
      };
      result.verificationTargets = [
        {
          path: "src/app.ts",
          kind: "source",
          category: "retry_logic",
          reason: "Retry behavior around `src/app.ts` should be verified before execution planning.",
        },
      ];
    },
    mutateBoundarySafeResult: (result) => {
      result.candidateTargets = [
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "The task explicitly references src/app.ts.",
          notes: ["Referenced directly by the task.", "Touches shared retry behavior."],
          sharedRisk: true,
        },
      ];
    },
  }));

  assert.match(report, /## Candidate Targets[\s\S]*Referenced directly by the task\./);
  assert.match(report, /## Candidate Targets[\s\S]*Shared risk:\s+yes/i);
  assert.match(report, /## Risk Analysis[\s\S]*Derived Risk Zones/);
  assert.match(report, /api_compatibility_risk/);
  assert.doesNotMatch(report, /## Risk Analysis[\s\S]*weak_repo_grounding[\s\S]*Derived Risk Zones[\s\S]*weak_repo_grounding/);
  assert.match(report, /## Risk Analysis[\s\S]*Supporting Analysis/);
  assert.match(report, /## Risk Analysis[\s\S]*Ambiguity Items/);
  assert.match(report, /`scope` \(medium\)/i);
  assert.match(report, /## Risk Analysis[\s\S]*Warning Items/);
  assert.match(report, /NO_TESTS_DETECTED/);
  assert.match(report, /## Initial Verification Targets[\s\S]*retry_logic/);
  assert.deepEqual(extractLevelTwoHeadings(report), [...REQUIRED_HEADINGS]);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
