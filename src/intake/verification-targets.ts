import type {
  CandidateTarget,
  InitialVerificationTarget,
  TaskParserResult,
  VerificationTarget,
} from "./types.js";

function toVerificationReason(target: CandidateTarget): string {
  if (target.kind === "test") {
    return "Initial test surface related to the requested change.";
  }

  if (target.kind === "manifest") {
    return "Configuration or manifest surface that may constrain later verification.";
  }

  return "Initial code surface to inspect before later verification work.";
}

function pushVerificationTarget(
  targets: VerificationTarget[],
  target: VerificationTarget,
): void {
  const key = `${target.kind}:${target.path}:${target.category}`;

  if (targets.some((existing) => `${existing.kind}:${existing.path}:${existing.category}` === key)) {
    return;
  }

  targets.push(target);
}

function buildCategorizedReason(
  category: VerificationTarget["category"],
  pathValue: string,
): string {
  switch (category) {
    case "retry_logic":
      return `Retry behavior around \`${pathValue}\` should be verified before execution planning.`;
    case "ownership":
      return `Ownership-sensitive behavior around \`${pathValue}\` should be verified before execution planning.`;
    case "api_contract":
      return `API or configuration contract impact around \`${pathValue}\` should be verified before execution planning.`;
    case "migration_order":
      return `Migration ordering around \`${pathValue}\` should be verified before execution planning.`;
    case "parallel_overlap":
      return `Shared-risk overlap around \`${pathValue}\` should be verified before execution planning.`;
    case "stale_write":
      return `Potential stale-write behavior around \`${pathValue}\` should be verified before execution planning.`;
    case "test_surface":
    case "config_surface":
    case "code_surface":
    default:
      return toVerificationReason({
        path: pathValue,
        kind:
          category === "test_surface"
            ? "test"
            : category === "config_surface"
              ? "manifest"
              : "source",
        matchType: "fallback",
        reason: "",
        notes: [],
        sharedRisk: false,
      });
  }
}

function hasRiskPhrase(
  taskParserResult: TaskParserResult,
  phrase: string,
): boolean {
  return taskParserResult.taskSpec.riskyPhrases?.includes(phrase) === true;
}

export function buildVerificationTargets(input: {
  taskParserResult: TaskParserResult;
  candidateTargets: CandidateTarget[];
}): VerificationTarget[] {
  const targets: VerificationTarget[] = [];

  for (const candidateTarget of input.candidateTargets) {
    if (candidateTarget.kind === "test") {
      pushVerificationTarget(targets, {
        path: candidateTarget.path,
        kind: candidateTarget.kind,
        category: "test_surface",
        reason: buildCategorizedReason("test_surface", candidateTarget.path),
      });
      continue;
    }

    if (candidateTarget.kind === "manifest") {
      pushVerificationTarget(targets, {
        path: candidateTarget.path,
        kind: candidateTarget.kind,
        category: hasRiskPhrase(input.taskParserResult, "api contract") ? "api_contract" : "config_surface",
        reason: buildCategorizedReason(
          hasRiskPhrase(input.taskParserResult, "api contract") ? "api_contract" : "config_surface",
          candidateTarget.path,
        ),
      });
    }

    if (candidateTarget.kind === "source") {
      const categories: VerificationTarget["category"][] = [];

      if (hasRiskPhrase(input.taskParserResult, "retry")) {
        categories.push("retry_logic");
      }

      if (hasRiskPhrase(input.taskParserResult, "ownership")) {
        categories.push("ownership");
      }

      if (hasRiskPhrase(input.taskParserResult, "migration")) {
        categories.push("migration_order");
      }

      if (hasRiskPhrase(input.taskParserResult, "stale write")) {
        categories.push("stale_write");
      }

      if (candidateTarget.sharedRisk) {
        categories.push("parallel_overlap");
      }

      if (categories.length === 0) {
        categories.push("code_surface");
      }

      for (const category of categories) {
        pushVerificationTarget(targets, {
          path: candidateTarget.path,
          kind: candidateTarget.kind,
          category,
          reason: buildCategorizedReason(category, candidateTarget.path),
        });
      }
    }
  }

  return targets;
}

export function buildInitialVerificationTargets(
  candidateTargets: CandidateTarget[],
): InitialVerificationTarget[] {
  return buildVerificationTargets({
    taskParserResult: {
      taskSpec: {
        goal: "",
        acceptanceCriteria: [],
        hasAcceptanceCriteria: false,
        explicitRequirements: [],
        constraints: [],
        mentionedPaths: [],
        mentionedTests: [],
        mentionedModules: [],
        riskyPhrases: [],
        openQuestions: [],
      },
      signals: {
        hasGoal: false,
        hasAcceptanceCriteria: false,
        referencedPaths: [],
        promptIsThin: false,
        promptRequirementCandidateCount: 0,
        promptOpenQuestionCategories: [],
      },
      ambiguities: [],
      warnings: [],
      recommendedUserActions: [],
    },
    candidateTargets,
  }).map((target) => ({
    path: target.path,
    kind: target.kind,
    category: target.category,
    reason: target.reason,
  }));
}
