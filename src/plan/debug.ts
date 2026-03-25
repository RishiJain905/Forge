import { PLAN_DEBUG_ENV_VAR } from "./constants.js";
import type {
  PlanArtifact,
  PlanAssistResolution,
  PlanConflictZone,
  PlanDependencyGraphEntry,
  PlanResolvedOutputPaths,
  PlanTestObligationEntry,
} from "./types.js";

interface PlannedWrite {
  filePath: string;
  contents: string;
}

export interface PlanDebugArtifact {
  command: PlanArtifact["command"];
  stage: PlanArtifact["stage"];
  status: PlanArtifact["status"];
  purpose: PlanArtifact["purpose"];
  repoRoot: PlanArtifact["repoRoot"];
  outputRoot: PlanArtifact["outputRoot"];
  summary: PlanArtifact["summary"];
  files: {
    artifactPath: PlanArtifact["files"]["artifactPath"];
    reportPath: PlanArtifact["files"]["reportPath"];
    debugArtifactPath: string;
    debugPlanItemsPath: string;
    debugDependenciesPath: string;
    debugConflictZonesPath: string;
    debugTestObligationsPath: string;
    debugPlanningReadinessPath: string;
  };
  source_intake: PlanArtifact["source_intake"];
  planning_diagnostics: PlanArtifact["planning_diagnostics"];
  planning_readiness: PlanArtifact["planning_readiness"];
  plan_items: PlanArtifact["plan_items"];
  dependency_graph: PlanDependencyGraphEntry[];
  conflict_zones: PlanConflictZone[];
  test_obligations: PlanTestObligationEntry[];
  parallelization_signals: PlanArtifact["parallelization_signals"];
  carry_forward: PlanArtifact["carry_forward"];
  planning_assist: PlanAssistResolution;
  failure: PlanArtifact["failure"];
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireDebugPath(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Plan debug output path is missing: ${name}.`);
  }

  return value;
}

export function isPlanDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PLAN_DEBUG_ENV_VAR] === "1";
}

export function createPlanDebugArtifact(
  artifact: PlanArtifact,
  paths: PlanResolvedOutputPaths,
  planningAssist: PlanAssistResolution,
): PlanDebugArtifact {
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
      debugPlanItemsPath: requireDebugPath(paths.debugPlanItemsPath, "debugPlanItemsPath"),
      debugDependenciesPath: requireDebugPath(paths.debugDependenciesPath, "debugDependenciesPath"),
      debugConflictZonesPath: requireDebugPath(paths.debugConflictZonesPath, "debugConflictZonesPath"),
      debugTestObligationsPath: requireDebugPath(paths.debugTestObligationsPath, "debugTestObligationsPath"),
      debugPlanningReadinessPath: requireDebugPath(paths.debugPlanningReadinessPath, "debugPlanningReadinessPath"),
    },
    source_intake: artifact.source_intake,
    planning_diagnostics: artifact.planning_diagnostics,
    planning_readiness: artifact.planning_readiness,
    plan_items: artifact.plan_items,
    dependency_graph: artifact.dependency_graph,
    conflict_zones: artifact.conflict_zones,
    test_obligations: artifact.test_obligations,
    parallelization_signals: artifact.parallelization_signals,
    carry_forward: artifact.carry_forward,
    planning_assist: planningAssist,
    failure: artifact.failure,
  };
}

export function createPlanDebugWrites(params: {
  artifact: PlanArtifact;
  paths: PlanResolvedOutputPaths;
  planningAssist: PlanAssistResolution;
}): PlannedWrite[] {
  const debugArtifact = createPlanDebugArtifact(params.artifact, params.paths, params.planningAssist);

  return [
    {
      filePath: requireDebugPath(params.paths.debugArtifactPath, "debugArtifactPath"),
      contents: stringifyJson(debugArtifact),
    },
    {
      filePath: requireDebugPath(params.paths.debugPlanItemsPath, "debugPlanItemsPath"),
      contents: stringifyJson({ plan_items: params.artifact.plan_items }),
    },
    {
      filePath: requireDebugPath(params.paths.debugDependenciesPath, "debugDependenciesPath"),
      contents: stringifyJson({ dependency_graph: params.artifact.dependency_graph }),
    },
    {
      filePath: requireDebugPath(params.paths.debugConflictZonesPath, "debugConflictZonesPath"),
      contents: stringifyJson({ conflict_zones: params.artifact.conflict_zones }),
    },
    {
      filePath: requireDebugPath(params.paths.debugTestObligationsPath, "debugTestObligationsPath"),
      contents: stringifyJson({ test_obligations: params.artifact.test_obligations }),
    },
    {
      filePath: requireDebugPath(params.paths.debugPlanningReadinessPath, "debugPlanningReadinessPath"),
      contents: stringifyJson({ planning_readiness: params.artifact.planning_readiness }),
    },
  ];
}
