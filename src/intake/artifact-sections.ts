import type {
  ArtifactCandidateTargetSectionItem,
  ArtifactConfidenceSection,
  ArtifactInitialVerificationTargetSectionItem,
  ArtifactNextStepReadinessSection,
  ArtifactRepoContextSection,
  ArtifactRiskAnalysisSection,
  ArtifactRiskZone,
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

function toArtifactRepoContextSection(
  repoContext: BoundarySafeIntakeResult["repoContext"],
): ArtifactRepoContextSection {
  return {
    grounded: repoContext.grounded,
    source_files: [...repoContext.sourceFiles],
    test_files: [...repoContext.testFiles],
    manifest_files: [...repoContext.manifestFiles],
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

function buildInitialRiskZones(params: {
  assembledResult: AssembledIntakeResult;
  boundarySafeResult: BoundarySafeIntakeResult;
}): ArtifactRiskZone[] {
  const riskZones: ArtifactRiskZone[] = [];
  const {
    taskParser,
    repoScan,
    inference,
  } = params.assembledResult.responsibilities;
  const repoFiles = new Set([
    ...params.boundarySafeResult.repoContext.allFiles,
  ]);
  const unresolvedReferencedPaths = taskParser.signals.referencedPaths.filter(
    (path) => !repoFiles.has(path),
  );

  if (!params.boundarySafeResult.repoContext.grounded || repoScan.signals.repoLooksSparse) {
    riskZones.push({
      code: "weak_repo_grounding",
      level: "high",
      reason: "Repo grounding is partial, so later planning may rely on weak repository evidence.",
      evidence_paths: [],
    });
  }

  if (unresolvedReferencedPaths.length > 0) {
    riskZones.push({
      code: "unresolved_referenced_paths",
      level: "high",
      reason: "The task references paths that were not found during repo grounding.",
      evidence_paths: unresolvedReferencedPaths,
    });
  }

  if (params.boundarySafeResult.candidateTargets.length === 0) {
    riskZones.push({
      code: "no_candidate_targets",
      level: "high",
      reason: "Intake could not produce any plausible candidate targets for the next step.",
      evidence_paths: [],
    });
  }

  if (
    params.boundarySafeResult.candidateTargets.length > 0 &&
    inference.signals.usedFallbackTargets
  ) {
    riskZones.push({
      code: "fallback_targeting_only",
      level: "medium",
      reason: "Targeting depends entirely on fallback repo structure instead of explicit task-to-file matches.",
      evidence_paths: params.boundarySafeResult.candidateTargets.map((target) => target.path),
    });
  }

  if (params.boundarySafeResult.repoContext.testFiles.length === 0) {
    riskZones.push({
      code: "no_tests_detected",
      level: "medium",
      reason: "No tests were detected during repo grounding, so later verification coverage may be weak.",
      evidence_paths: [],
    });
  }

  const manifestOrConfigPaths = [
    ...taskParser.signals.referencedPaths.filter((path) => /package\.json|tsconfig|config/i.test(path)),
    ...params.boundarySafeResult.candidateTargets
      .filter((target) => target.kind === "manifest")
      .map((target) => target.path),
  ].filter((value, index, values) => values.indexOf(value) === index);

  if (manifestOrConfigPaths.length > 0) {
    riskZones.push({
      code: "manifest_or_config_impact",
      level: "medium",
      reason: "The task appears to affect manifest or configuration surfaces that can widen downstream impact.",
      evidence_paths: manifestOrConfigPaths,
    });
  }

  return riskZones;
}

function buildArtifactRiskAnalysisSection(params: {
  assembledResult: AssembledIntakeResult;
  boundarySafeResult: BoundarySafeIntakeResult;
}): ArtifactRiskAnalysisSection {
  return {
    initial_risk_zones: buildInitialRiskZones(params),
  };
}

export function buildArtifactSections(params: {
  assembledResult: AssembledIntakeResult;
  boundarySafeResult: BoundarySafeIntakeResult;
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
    risk_analysis: buildArtifactRiskAnalysisSection({
      assembledResult: params.assembledResult,
      boundarySafeResult: params.boundarySafeResult,
    }),
    initial_verification_targets: params.boundarySafeResult.initialVerificationTargets.map(
      toArtifactInitialVerificationTargetSectionItem,
    ),
    ambiguities: [...params.boundarySafeResult.ambiguities],
    confidence: toArtifactConfidenceSection(params.assembledResult.confidence),
    next_step_readiness: toArtifactNextStepReadinessSection(params.nextStepReadiness),
    boundaryNotes: [...params.boundarySafeResult.boundaryNotes],
    warnings: [...params.boundarySafeResult.warnings],
  };
}
