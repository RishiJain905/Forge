import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DEBUG_DIRECTORY,
  INTAKE_ARTIFACT_NAME,
  REPORTS_DIRECTORY,
} from "../intake/constants.js";
import { validateIntakeArtifact } from "../intake/artifact-schema.js";
import {
  resolveFilesystemRepoRoot,
  resolveOutputFilePath,
  resolveOutputRoot,
} from "../intake/path-policy.js";
import {
  PLAN_ARTIFACT_NAME,
  PLAN_DEBUG_ARTIFACT_NAME,
  PLAN_DEBUG_CONFLICT_ZONES_NAME,
  PLAN_DEBUG_DEPENDENCIES_NAME,
  PLAN_DEBUG_PLAN_ITEMS_NAME,
  PLAN_DEBUG_TEST_OBLIGATIONS_NAME,
  PLAN_REPORT_NAME,
} from "./constants.js";
import type {
  LoadedPlanFoundationInput,
  PlanFoundationOptions,
  PlanInputIssue,
  PlanInputReference,
  PlanPlanningInput,
  PlanResolvedOutputPaths,
} from "./types.js";

export class PlanInputResolutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlanInputResolutionError";
    this.code = code;
  }
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function resolveRequestedArtifactPath(
  currentWorkingDirectory: string,
  requestedArtifactPath: string,
): string {
  return path.isAbsolute(requestedArtifactPath)
    ? path.normalize(requestedArtifactPath)
    : path.resolve(currentWorkingDirectory, requestedArtifactPath);
}

function buildPlanInputReference(
  artifact: ReturnType<typeof validateIntakeArtifact>,
  artifactPath: string,
): PlanInputReference {
  return {
    artifactPath,
    command: artifact.command,
    repoRoot: artifact.repoRoot,
    status: artifact.status,
    summary: artifact.summary,
    readyForPlanning: artifact.next_step_readiness.ready,
    inputMode: artifact.input_mode,
    sourceInputs: artifact.source_inputs,
    runtimeOptions: artifact.runtime_options,
    failure: artifact.failure,
  };
}

function hasActionablePlanningSignal(
  artifact: ReturnType<typeof validateIntakeArtifact>,
): boolean {
  return (
    artifact.task_spec.explicit_requirements.length > 0 ||
    artifact.task_spec.acceptance_criteria.length > 0 ||
    artifact.task_spec.implementation_necessities.length > 0 ||
    artifact.candidate_targets.length > 0 ||
    artifact.initial_verification_targets.length > 0
  );
}

function buildWarningItems(
  artifact: ReturnType<typeof validateIntakeArtifact>,
): PlanInputIssue[] {
  const warningItems: PlanInputIssue[] = [];

  if (artifact.confidence.level === "low") {
    warningItems.push({
      code: "LOW_CONFIDENCE_PLANNING_INPUT",
      message: "Step 1 confidence is low, so Step 2 should keep planning conservative.",
    });
  }

  if (artifact.candidate_targets.some((target) => target.match_type === "fallback")) {
    warningItems.push({
      code: "FALLBACK_TARGETING_PRESENT",
      message: "Step 1 relied on fallback target mapping for at least part of the planning surface.",
    });
  }

  return warningItems;
}

function buildBlockingItems(
  artifact: ReturnType<typeof validateIntakeArtifact>,
  actionablePlanningSignal: boolean,
): PlanInputIssue[] {
  if (!artifact.next_step_readiness.ready) {
    return artifact.next_step_readiness.blocking_issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    }));
  }

  if (!actionablePlanningSignal) {
    return [
      {
        code: "PLAN_INPUT_TOO_WEAK",
        message: "Step 1 output is structurally valid but does not provide enough actionable planning signal for Step 2 to build real plan items.",
      },
    ];
  }

  return [];
}

function buildPlanPlanningInput(
  artifact: ReturnType<typeof validateIntakeArtifact>,
): PlanPlanningInput {
  const actionablePlanningSignal = hasActionablePlanningSignal(artifact);
  const blockingItems = buildBlockingItems(artifact, actionablePlanningSignal);

  return {
    context: {
      taskSpec: artifact.task_spec,
      repoContext: artifact.repo_context,
      candidateTargets: artifact.candidate_targets,
      riskAnalysis: artifact.risk_analysis,
      initialVerificationTargets: artifact.initial_verification_targets,
    },
    uncertainty: {
      ambiguities: artifact.ambiguities,
      warnings: artifact.warnings,
      confidence: artifact.confidence,
      nextStepReadiness: artifact.next_step_readiness,
    },
    usability: {
      status: !artifact.next_step_readiness.ready
        ? "upstream_blocked"
        : actionablePlanningSignal
          ? "actionable"
          : "non_actionable",
      warningItems: buildWarningItems(artifact),
      blockingItems,
    },
  };
}

export async function resolvePlanOutputPaths(
  repoRoot: string,
  requestedOutputDirectory?: string,
): Promise<PlanResolvedOutputPaths> {
  const outputRoot = await resolveOutputRoot(repoRoot, requestedOutputDirectory);

  return {
    requestedOutputRoot: outputRoot.requestedOutputRoot,
    outputRoot: outputRoot.outputRoot,
    usedFallbackRoot: outputRoot.usedFallbackRoot,
    fallbackReason: outputRoot.fallbackReason,
    intakeArtifactPath: resolveOutputFilePath(outputRoot.outputRoot, INTAKE_ARTIFACT_NAME),
    artifactPath: resolveOutputFilePath(outputRoot.outputRoot, PLAN_ARTIFACT_NAME),
    reportPath: resolveOutputFilePath(outputRoot.outputRoot, REPORTS_DIRECTORY, PLAN_REPORT_NAME),
    debugArtifactPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      PLAN_DEBUG_ARTIFACT_NAME,
    ),
    debugPlanItemsPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      PLAN_DEBUG_PLAN_ITEMS_NAME,
    ),
    debugDependenciesPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      PLAN_DEBUG_DEPENDENCIES_NAME,
    ),
    debugConflictZonesPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      PLAN_DEBUG_CONFLICT_ZONES_NAME,
    ),
    debugTestObligationsPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      PLAN_DEBUG_TEST_OBLIGATIONS_NAME,
    ),
  };
}

export async function resolvePlanFoundationInput(
  options: PlanFoundationOptions,
  currentWorkingDirectory = process.cwd(),
): Promise<LoadedPlanFoundationInput> {
  const repoRoot = await resolveFilesystemRepoRoot(currentWorkingDirectory, options.repo);
  const paths = await resolvePlanOutputPaths(repoRoot, options.outputDir);
  const intakeArtifactPath = options.intakePath
    ? resolveRequestedArtifactPath(currentWorkingDirectory, options.intakePath)
    : paths.intakeArtifactPath;

  let rawArtifactText: string;

  try {
    rawArtifactText = await readFile(intakeArtifactPath, "utf8");
  } catch (error) {
    if (extractErrorCode(error) === "ENOENT") {
      throw new PlanInputResolutionError(
        "PLAN_INPUT_MISSING",
        `Forge plan could not find the Step 1 intake artifact at ${intakeArtifactPath}.`,
      );
    }

    throw new PlanInputResolutionError(
      "PLAN_INPUT_READ_FAILED",
      error instanceof Error
        ? `Forge plan could not read the Step 1 intake artifact: ${error.message}`
        : "Forge plan could not read the Step 1 intake artifact.",
    );
  }

  try {
    const parsedArtifact = JSON.parse(rawArtifactText) as unknown;
    const artifact = validateIntakeArtifact(parsedArtifact);

    return {
      repoRoot,
      paths,
      sourceIntake: buildPlanInputReference(artifact, intakeArtifactPath),
      planningInput: buildPlanPlanningInput(artifact),
    };
  } catch (error) {
    throw new PlanInputResolutionError(
      "INTAKE_ARTIFACT_INVALID",
      error instanceof Error
        ? `Forge plan found an invalid Step 1 intake artifact at ${intakeArtifactPath}: ${error.message}`
        : `Forge plan found an invalid Step 1 intake artifact at ${intakeArtifactPath}.`,
    );
  }
}
