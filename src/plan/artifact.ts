import {
  FORGE_PLAN_FULL_COMMAND,
  PLAN_ALLOWED_SIDE_EFFECTS,
  PLAN_BOUNDARY_NOTES,
  STEP2_DEFERRED_CAPABILITIES,
  STEP2_DISALLOWED_CAPABILITIES,
} from "./constants.js";
import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import { validatePlanArtifact } from "./schema.js";
import type {
  PlanArtifact,
  PlanCommandFailure,
  PlanCommandStatus,
  PlanFoundationResult,
  PlanModel,
  PlanResolvedOutputPaths,
} from "./types.js";

function buildPlanSummary(
  status: PlanCommandStatus,
  failure: PlanCommandFailure | null,
): string {
  if (failure?.code === "OUTPUT_ROOT_FALLBACK") {
    return "Forge plan wrote its outputs to the default .forge root because the requested output root was unsafe.";
  }

  if (status === "ready") {
    return "Forge plan produced a ready planning artifact from the persisted Step 1 handoff.";
  }

  if (status === "blocked") {
    return "Forge plan preserved the persisted Step 1 handoff, but planning remains blocked.";
  }

  return "Forge plan could not persist a usable planning artifact.";
}

export function createPlanArtifact(params: {
  foundation: PlanFoundationResult;
  model: PlanModel;
  paths: PlanResolvedOutputPaths;
  startedAt: string;
  finishedAt: string;
}): PlanArtifact {
  const planningReady = params.foundation.sourceIntake.readyForPlanning;
  const usedFallbackRoot = params.paths.usedFallbackRoot;
  const status: PlanCommandStatus = planningReady
    ? usedFallbackRoot
      ? "failed"
      : "ready"
    : "blocked";
  const failure: PlanCommandFailure | null = usedFallbackRoot
    ? buildPlanCommandFailure(
        "OUTPUT_ROOT_FALLBACK",
        params.paths.fallbackReason ??
          "Forge plan fell back to the default .forge output root because the requested output root was unsafe.",
        params.paths.fallbackReason ?? undefined,
      )
    : null;

  return validatePlanArtifact({
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_PLAN_FULL_COMMAND,
    stage: params.foundation.stage,
    status,
    purpose: params.foundation.purpose,
    repoRoot: params.foundation.sourceIntake.repoRoot,
    requestedOutputRoot: params.paths.requestedOutputRoot,
    outputRoot: params.paths.outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: params.paths.outputRoot,
      allowedSideEffects: [...PLAN_ALLOWED_SIDE_EFFECTS],
      deferredCapabilities: [...STEP2_DEFERRED_CAPABILITIES],
      disallowedCapabilities: [...STEP2_DISALLOWED_CAPABILITIES],
    },
    files: {
      artifactPath: params.paths.artifactPath,
      reportPath: params.paths.reportPath,
    },
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    summary: buildPlanSummary(status, failure),
    boundaryNotes: [...PLAN_BOUNDARY_NOTES],
    source_intake: {
      artifactPath: params.foundation.sourceIntake.artifactPath,
      command: params.foundation.sourceIntake.command,
      status: params.foundation.sourceIntake.status,
      summary: params.foundation.sourceIntake.summary,
      readyForPlanning: params.foundation.sourceIntake.readyForPlanning,
    },
    plan_item_contract: params.foundation.planItemContract,
    plan_items: params.model.planItems,
    dependency_graph: params.model.dependencyGraph,
    conflict_zones: params.model.conflictZones,
    test_obligations: params.model.testObligations,
    parallelization_signals: params.model.parallelizationSignals,
    carry_forward: {
      task_spec: params.foundation.carryForward.taskSpec,
      repo_context: params.foundation.carryForward.repoContext,
      candidate_targets: params.foundation.carryForward.candidateTargets,
      risk_analysis: params.foundation.carryForward.riskAnalysis,
      initial_verification_targets: params.foundation.carryForward.initialVerificationTargets,
      ambiguities: params.foundation.carryForward.ambiguities,
      warnings: params.foundation.carryForward.warnings,
      confidence: params.foundation.carryForward.confidence,
      next_step_readiness: params.foundation.carryForward.nextStepReadiness,
      concerns: params.model.carryForwardConcerns,
    },
    planning_readiness: params.foundation.carryForward.nextStepReadiness,
    failure,
  });
}

export function buildPlanCommandFailure(
  code: string,
  message: string,
  fallbackReason?: string,
): PlanCommandFailure {
  return {
    code,
    message,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
