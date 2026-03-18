import type {
  ArtifactCandidateTargetSectionItem,
  ArtifactGitContextSection,
  ArtifactConfidenceSection,
  ArtifactInitialVerificationTargetSectionItem,
  ArtifactNextStepReadinessSection,
  ArtifactRepoContextSection,
  ArtifactRiskAnalysisSection,
  ArtifactTaskSpecSection,
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  CandidateTarget,
  NextStepReadiness,
} from "./types.js";

function toArtifactTaskSpecSection(
  taskSpec: BoundarySafeIntakeResult["taskSpec"],
): ArtifactTaskSpecSection {
  return {
    goal: taskSpec.goal,
    acceptance_criteria: [...taskSpec.acceptanceCriteria],
    has_acceptance_criteria: taskSpec.hasAcceptanceCriteria,
  };
}

function toArtifactGitContextSection(
  gitContext: BoundarySafeIntakeResult["repoContext"]["gitContext"],
): ArtifactGitContextSection {
  return {
    status: gitContext.status,
    repo_root: gitContext.repoRoot,
    branch: gitContext.branch,
    recent_files: [...gitContext.recentFiles],
  };
}

function toArtifactRepoContextSection(
  repoContext: BoundarySafeIntakeResult["repoContext"],
): ArtifactRepoContextSection {
  return {
    grounded: repoContext.grounded,
    source_files: [...repoContext.sourceFiles],
    test_files: [...repoContext.testFiles],
    manifest_files: [...repoContext.manifestFiles],
    git_context: toArtifactGitContextSection(repoContext.gitContext),
  };
}

function toArtifactCandidateTargetSectionItem(
  target: CandidateTarget,
): ArtifactCandidateTargetSectionItem {
  return {
    path: target.path,
    kind: target.kind,
    match_type: target.matchType,
    reason: target.reason,
  };
}

function toArtifactInitialVerificationTargetSectionItem(
  target: BoundarySafeIntakeResult["initialVerificationTargets"][number],
): ArtifactInitialVerificationTargetSectionItem {
  return {
    path: target.path,
    kind: target.kind,
    reason: target.reason,
  };
}

function toArtifactConfidenceSection(
  confidence: AssembledIntakeResult["confidence"],
): ArtifactConfidenceSection {
  return {
    level: confidence.level,
    signals: {
      task_parsing: confidence.signals.taskParsing,
      repo_inspection: confidence.signals.repoInspection,
      targeting: confidence.signals.targeting,
    },
    reasons: [...confidence.reasons],
  };
}

function toArtifactNextStepReadinessSection(
  nextStepReadiness: NextStepReadiness,
): ArtifactNextStepReadinessSection {
  return {
    ready: nextStepReadiness.ready,
    blocking_issues: nextStepReadiness.blockingIssues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    })),
    recommended_user_actions: [...nextStepReadiness.recommendedUserActions],
  };
}

export function buildArtifactSections(params: {
  assembledResult: AssembledIntakeResult;
  boundarySafeResult: BoundarySafeIntakeResult;
  riskAnalysis: ArtifactRiskAnalysisSection;
  initialVerificationTargets: BoundarySafeIntakeResult["initialVerificationTargets"];
  nextStepReadiness: NextStepReadiness;
}): Pick<
  import("./types.js").IntakeArtifact,
  | "task_spec"
  | "repo_context"
  | "candidate_targets"
  | "risk_analysis"
  | "initial_verification_targets"
  | "ambiguities"
  | "confidence"
  | "next_step_readiness"
  | "boundaryNotes"
  | "warnings"
> {
  return {
    task_spec: toArtifactTaskSpecSection(params.boundarySafeResult.taskSpec),
    repo_context: toArtifactRepoContextSection(params.boundarySafeResult.repoContext),
    candidate_targets: params.boundarySafeResult.candidateTargets.map(
      toArtifactCandidateTargetSectionItem,
    ),
    risk_analysis: params.riskAnalysis,
    initial_verification_targets: params.initialVerificationTargets.map(
      toArtifactInitialVerificationTargetSectionItem,
    ),
    ambiguities: [...params.boundarySafeResult.ambiguities],
    confidence: toArtifactConfidenceSection(params.assembledResult.confidence),
    next_step_readiness: toArtifactNextStepReadinessSection(params.nextStepReadiness),
    boundaryNotes: [...params.boundarySafeResult.boundaryNotes],
    warnings: [...params.boundarySafeResult.warnings],
  };
}
