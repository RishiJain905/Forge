import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import {
  FORGE_SPLIT_FULL_COMMAND,
  FORGE_SPLIT_STAGE,
  STEP4_ALLOWED_SIDE_EFFECTS,
  STEP4_DEFERRED_CAPABILITIES,
  STEP4_DISALLOWED_CAPABILITIES,
  STEP4_HONOR_MERGE_ORDER_ACTION,
} from "./constants.js";
import { validateSplitArtifact } from "./schema.js";
import { resolveSplitReadiness } from "./readiness.js";
import type {
  SplitArtifact,
  SplitBlockedItem,
  SplitCommandFailure,
  SplitCommandResult,
  SplitFoundationResult,
  SplitInputIssue,
  SplitResolvedOutputPaths,
  SplitReadinessResolution,
  SplitWorkstreamBuildResult,
  SplitWritePolicy,
} from "./types.js";

function copyIssue(issue: SplitInputIssue): SplitInputIssue {
  return {
    code: issue.code,
    message: issue.message,
  };
}

function copyBlockedItem(item: SplitBlockedItem): SplitBlockedItem {
  return {
    id: item.id,
    kind: item.kind,
    code: item.code,
    message: item.message,
    workstreamId: item.workstreamId,
    sourcePlanItemIds: [...item.sourcePlanItemIds],
    sourceVerificationCaseIds: [...item.sourceVerificationCaseIds],
    sourceFindingIds: [...item.sourceFindingIds],
    sourceConstraintIds: [...item.sourceConstraintIds],
    sourceConcernIds: [...item.sourceConcernIds],
    partialMetadataAvailable: item.partialMetadataAvailable,
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function requireOutputPath(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Split output path is missing: ${name}.`);
  }

  return value;
}

function buildSplitBoundaryNotes(foundation: SplitFoundationResult): string[] {
  return dedupeStrings([
    ...foundation.boundaryPolicy.deterministicFirstNotes,
    ...foundation.boundaryPolicy.conservativeRegroupingNotes,
    "Batch 2 Part 3 applies explicit stream categories, safety constraints, merge-order expectations, and blocking visibility from persisted Step 2 and Step 3 inputs while keeping the Step 4 top-level contract stable.",
  ]);
}

function buildSplitWritePolicy(outputRoot: string): SplitWritePolicy {
  return {
    mode: "output-root-only",
    repoReadOnlyOutsideOutputRoot: true,
    allowedRoot: outputRoot,
    allowedSideEffects: [...STEP4_ALLOWED_SIDE_EFFECTS],
    deferredCapabilities: [...STEP4_DEFERRED_CAPABILITIES],
    disallowedCapabilities: [...STEP4_DISALLOWED_CAPABILITIES],
  };
}

function buildSplitFiles(paths: SplitResolvedOutputPaths): SplitArtifact["files"] {
  return {
    artifactPath: paths.artifactPath ?? null,
    reportPath: paths.reportPath ?? null,
    debugArtifactPath: requireOutputPath(paths.debugArtifactPath, "debugArtifactPath"),
    debugWorkstreamsPath: requireOutputPath(paths.debugWorkstreamsPath, "debugWorkstreamsPath"),
    debugMergeOrderPath: requireOutputPath(paths.debugMergeOrderPath, "debugMergeOrderPath"),
    debugBlockedItemsPath: requireOutputPath(paths.debugBlockedItemsPath, "debugBlockedItemsPath"),
    debugStreamConstraintsPath: requireOutputPath(
      paths.debugStreamConstraintsPath,
      "debugStreamConstraintsPath",
    ),
  };
}

function buildSplitSummary(params: {
  readinessSummary: string;
  status: SplitArtifact["status"];
  failure: SplitCommandFailure | null;
}): string {
  const fallbackSummary =
    "Forge split wrote its outputs to the default .forge root because the requested output root was unsafe.";

  if (params.failure?.code === "OUTPUT_ROOT_FALLBACK") {
    return `${params.readinessSummary} ${fallbackSummary}`;
  }

  if (params.status === "ready" || params.status === "blocked") {
    return params.readinessSummary;
  }

  return "Forge split could not persist a usable split artifact.";
}

function buildSplitDiagnostics(
  foundation: SplitFoundationResult,
  failure: SplitCommandFailure | null,
  warningItems: SplitInputIssue[],
): SplitArtifact["split_diagnostics"] {
  return {
    usability_status: foundation.splitInput.usability.status,
    warning_items: warningItems.map(copyIssue),
    blocking_items: foundation.splitInput.usability.blockingItems.map(copyIssue),
    partial_output: failure
      ? {
        code: failure.code,
        message: failure.message,
        ...(failure.fallbackReason ? { fallbackReason: failure.fallbackReason } : {}),
      }
      : null,
  };
}

function buildSplitCarriedForwardConstraints(
  foundation: SplitFoundationResult,
  workstreamBuild: SplitWorkstreamBuildResult,
): SplitArtifact["carried_forward_constraints"] {
  return {
    findings: foundation.splitInput.context.findings,
    constraints: foundation.splitInput.context.constraints,
    plan_concerns: foundation.carryForward.planCarryForward.concerns,
    planning_readiness: foundation.carryForward.planningReadiness,
    verification_readiness: foundation.carryForward.verificationReadiness,
    stream_constraint_details: workstreamBuild.streamConstraintDetails,
  };
}

function buildInputBlockedItems(
  foundation: SplitFoundationResult,
): SplitBlockedItem[] {
  return foundation.splitInput.usability.blockingItems.map((issue, index) => ({
    id: `input-blocker:${index + 1}`,
    kind: "input_blocker",
    code: issue.code,
    message: issue.message,
    workstreamId: null,
    sourcePlanItemIds: [],
    sourceVerificationCaseIds: [],
    sourceFindingIds: [],
    sourceConstraintIds: [],
    sourceConcernIds: [],
    partialMetadataAvailable: false,
  }));
}

function buildSplitReadinessResolution(
  foundation: SplitFoundationResult,
  failure: SplitCommandFailure | null,
  workstreamBuild: SplitWorkstreamBuildResult,
): SplitReadinessResolution {
  const hasBlockedWorkstreams = workstreamBuild.blockedItems.some((item) => item.kind === "blocked_workstream");
  const hasBlockedPlanItems = workstreamBuild.blockedItems.some((item) => item.kind === "blocked_plan_item");

  return resolveSplitReadiness({
    foundation,
    failure,
    additionalWarningItems: workstreamBuild.warningItems,
    additionalRecommendedActions: dedupeStrings([
      workstreamBuild.mergeOrder.length > 0
        ? STEP4_HONOR_MERGE_ORDER_ACTION
        : "",
      hasBlockedWorkstreams
        ? "Keep blocked_items out of active execution until their carried-forward blockers are resolved."
        : "",
      hasBlockedPlanItems
        ? "Keep blocked plan items explicit inside their grouped workstreams until their carried-forward blockers are resolved."
        : "",
    ]),
  });
}

export function createSplitArtifact(params: {
  foundation: SplitFoundationResult;
  paths: SplitResolvedOutputPaths;
  startedAt: string;
  finishedAt: string;
  failure: SplitCommandFailure | null;
  workstreamBuild: SplitWorkstreamBuildResult;
}): SplitArtifact {
  const readinessResolution = buildSplitReadinessResolution(
    params.foundation,
    params.failure,
    params.workstreamBuild,
  );
  const splitDiagnostics = buildSplitDiagnostics(
    params.foundation,
    params.failure,
    readinessResolution.splitReadiness.warning_items,
  );
  const blockedItems = [
    ...buildInputBlockedItems(params.foundation),
    ...params.workstreamBuild.blockedItems.map(copyBlockedItem),
  ];
  const carriedForwardConstraints = buildSplitCarriedForwardConstraints(
    params.foundation,
    params.workstreamBuild,
  );

  return validateSplitArtifact({
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_SPLIT_FULL_COMMAND,
    stage: FORGE_SPLIT_STAGE,
    status: readinessResolution.status,
    purpose: params.foundation.purpose,
    repoRoot: params.foundation.sourceVerify.repoRoot,
    requestedOutputRoot: params.paths.requestedOutputRoot,
    outputRoot: params.paths.outputRoot,
    writePolicy: buildSplitWritePolicy(params.paths.outputRoot),
    files: buildSplitFiles(params.paths),
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    summary: buildSplitSummary({
      readinessSummary: readinessResolution.splitReadiness.summary,
      status: readinessResolution.status,
      failure: params.failure,
    }),
    boundaryNotes: buildSplitBoundaryNotes(params.foundation),
    source_verify: params.foundation.sourceVerify,
    source_plan: params.foundation.sourcePlan,
    workstream_contract: params.foundation.workstreamContract,
    workstreams: params.workstreamBuild.workstreams,
    dependency_edges: params.workstreamBuild.dependencyEdges,
    merge_order: params.workstreamBuild.mergeOrder,
    blocked_items: blockedItems.map(copyBlockedItem),
    carried_forward_constraints: carriedForwardConstraints,
    split_diagnostics: splitDiagnostics,
    split_readiness: readinessResolution.splitReadiness,
    failure: params.failure,
  });
}

export function buildSplitCommandFailureObject(
  code: string,
  message: string,
  fallbackReason?: string,
): SplitCommandFailure {
  return {
    code,
    message,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

export function buildSplitCommandResult(params: {
  artifact: SplitArtifact;
  paths: SplitResolvedOutputPaths;
}): SplitCommandResult {
  return {
    status: params.artifact.status,
    artifact: params.artifact,
    artifactPath: params.paths.artifactPath ?? null,
    reportPath: params.paths.reportPath ?? null,
    outputRoot: params.paths.outputRoot,
    summary: params.artifact.summary,
    failure: params.artifact.failure,
  };
}

export function toSplitArtifactJson(artifact: SplitArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
