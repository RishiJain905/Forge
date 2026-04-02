import { SPLIT_DEBUG_ENV_VAR } from "./constants.js";
import type {
  SplitArtifact,
  SplitBlockedItem,
  SplitCommandFailure,
  SplitResolvedOutputPaths,
  SplitStreamConstraintDetail,
} from "./types.js";

interface PlannedWrite {
  filePath: string;
  contents: string;
}

export interface SplitDebugArtifact {
  command: SplitArtifact["command"];
  stage: SplitArtifact["stage"];
  status: SplitArtifact["status"];
  purpose: SplitArtifact["purpose"];
  repoRoot: SplitArtifact["repoRoot"];
  outputRoot: SplitArtifact["outputRoot"];
  summary: SplitArtifact["summary"];
  files: SplitArtifact["files"];
  source_verify: SplitArtifact["source_verify"];
  source_plan: SplitArtifact["source_plan"];
  workstream_contract: SplitArtifact["workstream_contract"];
  workstreams: SplitArtifact["workstreams"];
  dependency_edges: SplitArtifact["dependency_edges"];
  merge_order: SplitArtifact["merge_order"];
  blocked_items: SplitArtifact["blocked_items"];
  stream_constraint_details: SplitStreamConstraintDetail[];
  carried_forward_constraints: SplitArtifact["carried_forward_constraints"];
  split_diagnostics: SplitArtifact["split_diagnostics"];
  split_readiness: SplitArtifact["split_readiness"];
  failure: SplitCommandFailure | null;
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireDebugPath(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Split debug output path is missing: ${name}.`);
  }

  return value;
}

function copyBlockedItem(issue: SplitBlockedItem): SplitBlockedItem {
  return {
    id: issue.id,
    kind: issue.kind,
    code: issue.code,
    message: issue.message,
    workstreamId: issue.workstreamId,
    sourcePlanItemIds: [...issue.sourcePlanItemIds],
    sourceVerificationCaseIds: [...issue.sourceVerificationCaseIds],
    sourceFindingIds: [...issue.sourceFindingIds],
    sourceConstraintIds: [...issue.sourceConstraintIds],
    sourceConcernIds: [...issue.sourceConcernIds],
    partialMetadataAvailable: issue.partialMetadataAvailable,
  };
}

export function isSplitDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SPLIT_DEBUG_ENV_VAR] === "1";
}

export function createSplitDebugArtifact(
  artifact: SplitArtifact,
  paths: SplitResolvedOutputPaths,
  streamConstraintDetails: SplitStreamConstraintDetail[],
): SplitDebugArtifact {
  return {
    command: artifact.command,
    stage: artifact.stage,
    status: artifact.status,
    purpose: artifact.purpose,
    repoRoot: artifact.repoRoot,
    outputRoot: artifact.outputRoot,
    summary: artifact.summary,
    files: {
      artifactPath: artifact.files.artifactPath,
      reportPath: artifact.files.reportPath,
      debugArtifactPath: requireDebugPath(paths.debugArtifactPath, "debugArtifactPath"),
      debugWorkstreamsPath: requireDebugPath(paths.debugWorkstreamsPath, "debugWorkstreamsPath"),
      debugMergeOrderPath: requireDebugPath(paths.debugMergeOrderPath, "debugMergeOrderPath"),
      debugBlockedItemsPath: requireDebugPath(paths.debugBlockedItemsPath, "debugBlockedItemsPath"),
      debugStreamConstraintsPath: requireDebugPath(
        paths.debugStreamConstraintsPath,
        "debugStreamConstraintsPath",
      ),
    },
    source_verify: artifact.source_verify,
    source_plan: artifact.source_plan,
    workstream_contract: artifact.workstream_contract,
    workstreams: artifact.workstreams,
    dependency_edges: artifact.dependency_edges,
    merge_order: artifact.merge_order,
    blocked_items: artifact.blocked_items,
    stream_constraint_details: streamConstraintDetails,
    carried_forward_constraints: artifact.carried_forward_constraints,
    split_diagnostics: artifact.split_diagnostics,
    split_readiness: artifact.split_readiness,
    failure: artifact.failure,
  };
}

export function createSplitDebugWrites(params: {
  artifact: SplitArtifact;
  paths: SplitResolvedOutputPaths;
  streamConstraintDetails: SplitStreamConstraintDetail[];
}): PlannedWrite[] {
  const debugArtifact = createSplitDebugArtifact(
    params.artifact,
    params.paths,
    params.streamConstraintDetails,
  );

  return [
    {
      filePath: requireDebugPath(params.paths.debugArtifactPath, "debugArtifactPath"),
      contents: stringifyJson(debugArtifact),
    },
    {
      filePath: requireDebugPath(params.paths.debugWorkstreamsPath, "debugWorkstreamsPath"),
      contents: stringifyJson({ workstreams: params.artifact.workstreams }),
    },
    {
      filePath: requireDebugPath(params.paths.debugMergeOrderPath, "debugMergeOrderPath"),
      contents: stringifyJson({ merge_order: params.artifact.merge_order }),
    },
    {
      filePath: requireDebugPath(params.paths.debugBlockedItemsPath, "debugBlockedItemsPath"),
      contents: stringifyJson({ blocked_items: params.artifact.blocked_items.map(copyBlockedItem) }),
    },
    {
      filePath: requireDebugPath(params.paths.debugStreamConstraintsPath, "debugStreamConstraintsPath"),
      contents: stringifyJson({
        workstream_contract: params.artifact.workstream_contract,
        stream_constraint_details: params.streamConstraintDetails,
        dependency_edges: params.artifact.dependency_edges,
        carried_forward_constraints: params.artifact.carried_forward_constraints,
        split_diagnostics: params.artifact.split_diagnostics,
        split_readiness: params.artifact.split_readiness,
      }),
    },
  ];
}
