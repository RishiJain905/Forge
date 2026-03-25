import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPORTS_DIRECTORY } from "../intake/constants.js";
import { resolveFilesystemRepoRoot, resolveOutputFilePath, resolveOutputRoot } from "../intake/path-policy.js";
import { validatePlanArtifact } from "../plan/schema.js";
import { PLAN_ARTIFACT_NAME } from "../plan/constants.js";
import type { PlanArtifact } from "../plan/types.js";
import { VERIFY_INPUT_TOO_WEAK, VERIFY_ARTIFACT_NAME, VERIFY_REPORT_NAME } from "./constants.js";
import type {
  LoadedVerifyFoundationInput,
  VerifyFoundationOptions,
  VerifyInputIssue,
  VerifyFoundationResolvedPaths,
  VerifyPlanReference,
  VerifyPlanningInput,
  VerifyResolvedOutputPaths,
} from "./types.js";

export class VerifyInputResolutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VerifyInputResolutionError";
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

function buildVerifyPlanReference(
  artifact: PlanArtifact,
  artifactPath: string,
): VerifyPlanReference {
  return {
    artifactPath,
    command: artifact.command,
    repoRoot: artifact.repoRoot,
    status: artifact.status,
    summary: artifact.summary,
    readyForVerification: artifact.planning_readiness.ready,
    planningReadinessStatus: artifact.planning_readiness.status,
    failure: artifact.failure,
  };
}

function hasActionableVerificationSignal(artifact: PlanArtifact): boolean {
  return (
    artifact.plan_items.some((item) => item.verificationRelevance.relevant) ||
    artifact.conflict_zones.length > 0 ||
    artifact.parallelization_signals.some((entry) => entry.signal !== "safe_parallel") ||
    artifact.carry_forward.initial_verification_targets.length > 0 ||
    artifact.carry_forward.concerns.length > 0
  );
}

function buildWarningItems(artifact: PlanArtifact): VerifyInputIssue[] {
  const warningItems: VerifyInputIssue[] = [];

  if (artifact.carry_forward.confidence.level === "low") {
    warningItems.push({
      code: "LOW_CONFIDENCE_VERIFY_INPUT",
      message: "Step 2 carried low-confidence context into verification, so findings must stay conservative.",
    });
  }

  if (
    artifact.planning_diagnostics.warning_items.length > 0 ||
    artifact.planning_readiness.warning_items.length > 0 ||
    artifact.planning_readiness.status === "ready_with_warnings"
  ) {
    warningItems.push({
      code: "PLAN_WARNING_CONTEXT_PRESENT",
      message: "Step 2 preserved warning-grade planning context that Step 3 must carry forward honestly.",
    });
  }

  if (artifact.planning_readiness.ready && artifact.failure) {
    warningItems.push({
      code: "PLAN_PARTIAL_OUTPUT_PRESENT",
      message: "Step 2 is verify-ready, but the plan artifact still carries a partial-output failure that Step 3 must keep visible.",
    });
  }

  return warningItems;
}

function buildBlockingItems(
  artifact: PlanArtifact,
  actionableVerificationSignal: boolean,
): VerifyInputIssue[] {
  if (!artifact.planning_readiness.ready) {
    return artifact.planning_readiness.blocking_issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    }));
  }

  if (!actionableVerificationSignal) {
    return [
      {
        code: VERIFY_INPUT_TOO_WEAK,
        message: "Step 2 output is structurally valid but does not provide enough risky verification signal for Step 3 to build meaningful verification work.",
      },
    ];
  }

  return [];
}

function buildVerifyPlanningInput(artifact: PlanArtifact): VerifyPlanningInput {
  const actionableVerificationSignal = hasActionableVerificationSignal(artifact);
  const blockingItems = buildBlockingItems(artifact, actionableVerificationSignal);

  return {
    context: {
      planItemContract: artifact.plan_item_contract,
      planItems: artifact.plan_items,
      dependencyGraph: artifact.dependency_graph,
      conflictZones: artifact.conflict_zones,
      testObligations: artifact.test_obligations,
      parallelizationSignals: artifact.parallelization_signals,
    },
    uncertainty: {
      carryForward: artifact.carry_forward,
      planningDiagnostics: artifact.planning_diagnostics,
      planningReadiness: artifact.planning_readiness,
    },
    usability: {
      status: !artifact.planning_readiness.ready
        ? "upstream_blocked"
        : actionableVerificationSignal
          ? "actionable"
          : "non_actionable",
      warningItems: buildWarningItems(artifact),
      blockingItems,
    },
  };
}

export async function resolveVerifyOutputPaths(
  repoRoot: string,
  requestedOutputDirectory?: string,
): Promise<VerifyResolvedOutputPaths> {
  const outputRoot = await resolveOutputRoot(repoRoot, requestedOutputDirectory);

  return {
    requestedOutputRoot: outputRoot.requestedOutputRoot,
    outputRoot: outputRoot.outputRoot,
    usedFallbackRoot: outputRoot.usedFallbackRoot,
    fallbackReason: outputRoot.fallbackReason,
    planArtifactPath: resolveOutputFilePath(outputRoot.outputRoot, PLAN_ARTIFACT_NAME),
    verifyArtifactPath: resolveOutputFilePath(outputRoot.outputRoot, VERIFY_ARTIFACT_NAME),
    verifyReportPath: resolveOutputFilePath(outputRoot.outputRoot, REPORTS_DIRECTORY, VERIFY_REPORT_NAME),
  };
}

export async function resolveVerifyFoundationInput(
  options: VerifyFoundationOptions,
  currentWorkingDirectory = process.cwd(),
): Promise<LoadedVerifyFoundationInput> {
  const repoRoot = await resolveFilesystemRepoRoot(currentWorkingDirectory, options.repo);
  const paths = await resolveVerifyOutputPaths(repoRoot, options.outputDir);
  const planArtifactPath = options.planPath
    ? resolveRequestedArtifactPath(currentWorkingDirectory, options.planPath)
    : paths.planArtifactPath;

  let rawArtifactText: string;

  try {
    rawArtifactText = await readFile(planArtifactPath, "utf8");
  } catch (error) {
    if (extractErrorCode(error) === "ENOENT") {
      throw new VerifyInputResolutionError(
        "VERIFY_INPUT_MISSING",
        `Forge verify could not find the Step 2 plan artifact at ${planArtifactPath}.`,
      );
    }

    throw new VerifyInputResolutionError(
      "VERIFY_INPUT_READ_FAILED",
      error instanceof Error
        ? `Forge verify could not read the Step 2 plan artifact: ${error.message}`
        : "Forge verify could not read the Step 2 plan artifact.",
    );
  }

  try {
    const parsedArtifact = JSON.parse(rawArtifactText) as unknown;
    const artifact = validatePlanArtifact(parsedArtifact);

    return {
      repoRoot,
      paths: {
        requestedOutputRoot: paths.requestedOutputRoot,
        outputRoot: paths.outputRoot,
        usedFallbackRoot: paths.usedFallbackRoot,
        fallbackReason: paths.fallbackReason,
        planArtifactPath,
      } satisfies VerifyFoundationResolvedPaths,
      sourcePlan: buildVerifyPlanReference(artifact, planArtifactPath),
      sourceIntake: artifact.source_intake,
      verificationInput: buildVerifyPlanningInput(artifact),
    };
  } catch (error) {
    throw new VerifyInputResolutionError(
      "PLAN_ARTIFACT_INVALID",
      error instanceof Error
        ? `Forge verify found an invalid Step 2 plan artifact at ${planArtifactPath}: ${error.message}`
        : `Forge verify found an invalid Step 2 plan artifact at ${planArtifactPath}.`,
    );
  }
}
