import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveFilesystemRepoRoot, resolveOutputFilePath, resolveOutputRoot } from "../intake/path-policy.js";
import {
  SPLIT_ARTIFACT_NAME,
  SPLIT_DEBUG_ARTIFACT_NAME,
  SPLIT_DEBUG_BLOCKED_ITEMS_NAME,
  SPLIT_DEBUG_MERGE_ORDER_NAME,
  SPLIT_DEBUG_STREAM_CONSTRAINTS_NAME,
  SPLIT_DEBUG_WORKSTREAMS_NAME,
  SPLIT_REPORT_NAME,
} from "./constants.js";
import { PLAN_ARTIFACT_NAME } from "../plan/constants.js";
import { validatePlanArtifact } from "../plan/schema.js";
import type { PlanArtifact } from "../plan/types.js";
import { VERIFY_ARTIFACT_NAME } from "../verify/constants.js";
import { validateVerifyArtifact } from "../verify/schema.js";
import type { VerifyArtifact } from "../verify/types.js";
import { SPLIT_INPUT_TOO_WEAK } from "./constants.js";
import type {
  LoadedSplitFoundationInput,
  SplitFoundationOptions,
  SplitInputIssue,
  SplitPlanReference,
  SplitPlanningInput,
  SplitResolvedOutputPaths,
  SplitVerifyReference,
} from "./types.js";

export class SplitInputResolutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SplitInputResolutionError";
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

function buildSplitVerifyReference(
  artifact: VerifyArtifact,
  artifactPath: string,
): SplitVerifyReference {
  return {
    artifactPath,
    command: artifact.command,
    repoRoot: artifact.repoRoot,
    status: artifact.status,
    summary: artifact.summary,
    readyForSplit: artifact.verification_readiness.ready,
    verificationDiagnostics: artifact.verification_diagnostics,
    verificationReadinessStatus: artifact.verification_readiness.status,
    verificationReadiness: artifact.verification_readiness,
    failure: artifact.failure,
  };
}

function buildSplitPlanReference(
  artifact: PlanArtifact,
  artifactPath: string,
): SplitPlanReference {
  return {
    artifactPath,
    command: artifact.command,
    repoRoot: artifact.repoRoot,
    status: artifact.status,
    summary: artifact.summary,
    readyForVerification: artifact.planning_readiness.ready,
    planningDiagnostics: artifact.planning_diagnostics,
    planningReadiness: artifact.planning_readiness,
    failure: artifact.failure,
  };
}

function buildWarningItems(verifyArtifact: VerifyArtifact): SplitInputIssue[] {
  const warningItems: SplitInputIssue[] = [];

  if (verifyArtifact.carry_forward.confidence.level === "low") {
    warningItems.push({
      code: "LOW_CONFIDENCE_SPLIT_INPUT",
      message: "Low-confidence carry-forward context remains visible, so split should stay conservative.",
    });
  }

  if (
    verifyArtifact.verification_diagnostics.warning_items.length > 0 ||
    verifyArtifact.verification_readiness.warning_items.length > 0 ||
    verifyArtifact.verification_readiness.status === "ready_with_warnings"
  ) {
    warningItems.push({
      code: "VERIFY_WARNING_CONTEXT_PRESENT",
      message: "Step 3 preserved warning-grade verification context that Split must carry forward honestly.",
    });
  }

  if (verifyArtifact.failure) {
    warningItems.push({
      code: "VERIFY_PARTIAL_OUTPUT_PRESENT",
      message: "Step 3 remained split-usable but still carries a partial-output failure that must stay visible.",
    });
  }

  return warningItems;
}

function buildBlockingItems(
  planArtifact: PlanArtifact,
  verifyArtifact: VerifyArtifact,
): SplitInputIssue[] {
  if (!verifyArtifact.verification_readiness.ready) {
    return verifyArtifact.verification_readiness.blocking_issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    }));
  }

  if (planArtifact.plan_items.length === 0) {
    return [
      {
        code: SPLIT_INPUT_TOO_WEAK,
        message: "Step 4 needs actionable Step 2 plan items before it can build real workstreams.",
      },
    ];
  }

  return [];
}

function buildSplitPlanningInput(
  planArtifact: PlanArtifact,
  verifyArtifact: VerifyArtifact,
): SplitPlanningInput {
  return {
    context: {
      planItemContract: planArtifact.plan_item_contract,
      planItems: planArtifact.plan_items,
      dependencyGraph: planArtifact.dependency_graph,
      conflictZones: planArtifact.conflict_zones,
      testObligations: planArtifact.test_obligations,
      parallelizationSignals: planArtifact.parallelization_signals,
      verificationTargetContract: verifyArtifact.verification_target_contract,
      formalLaneContract: verifyArtifact.formal_lane_contract,
      verificationTargets: verifyArtifact.verification_targets,
      verificationCases: verifyArtifact.verification_cases,
      findings: verifyArtifact.findings,
      constraints: verifyArtifact.constraints,
    },
    uncertainty: {
      sourceIntake: planArtifact.source_intake,
      planCarryForward: planArtifact.carry_forward,
      planningDiagnostics: planArtifact.planning_diagnostics,
      planningReadiness: planArtifact.planning_readiness,
      verifyCarryForward: verifyArtifact.carry_forward,
      verificationDiagnostics: verifyArtifact.verification_diagnostics,
      verificationReadiness: verifyArtifact.verification_readiness,
    },
    usability: {
      status: !verifyArtifact.verification_readiness.ready
        ? "upstream_blocked"
        : planArtifact.plan_items.length > 0
          ? "actionable"
          : "non_actionable",
      warningItems: buildWarningItems(verifyArtifact),
      blockingItems: buildBlockingItems(planArtifact, verifyArtifact),
    },
  };
}

function assertSourcePlanConsistency(
  verifyArtifact: VerifyArtifact,
  planArtifact: PlanArtifact,
  planArtifactPath: string,
): void {
  if (path.normalize(verifyArtifact.source_plan.artifactPath) !== path.normalize(planArtifactPath)) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_MISMATCH",
      `Forge split loaded ${planArtifactPath}, but Step 3 referenced ${verifyArtifact.source_plan.artifactPath}.`,
    );
  }

  if (planArtifact.repoRoot !== verifyArtifact.source_plan.repoRoot) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_MISMATCH",
      "Forge split found a repo-root mismatch between verify.json and the referenced plan artifact.",
    );
  }

  if (planArtifact.command !== verifyArtifact.source_plan.command) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_MISMATCH",
      "Forge split found a command mismatch between verify.json and the referenced plan artifact.",
    );
  }

  if (planArtifact.status !== verifyArtifact.source_plan.status) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_MISMATCH",
      "Forge split found a status mismatch between verify.json and the referenced plan artifact.",
    );
  }

  if (planArtifact.planning_readiness.ready !== verifyArtifact.source_plan.readyForVerification) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_MISMATCH",
      "Forge split found a planning-readiness mismatch between verify.json and the referenced plan artifact.",
    );
  }
}

export async function resolveSplitOutputPaths(
  repoRoot: string,
  requestedOutputDirectory?: string,
): Promise<SplitResolvedOutputPaths> {
  const outputRoot = await resolveOutputRoot(repoRoot, requestedOutputDirectory);
  const resolvedOutputRoot = outputRoot.outputRoot;

  return {
    requestedOutputRoot: outputRoot.requestedOutputRoot,
    outputRoot: resolvedOutputRoot,
    usedFallbackRoot: outputRoot.usedFallbackRoot,
    fallbackReason: outputRoot.fallbackReason,
    verifyArtifactPath: resolveOutputFilePath(resolvedOutputRoot, VERIFY_ARTIFACT_NAME),
    planArtifactPath: resolveOutputFilePath(resolvedOutputRoot, PLAN_ARTIFACT_NAME),
    artifactPath: resolveOutputFilePath(resolvedOutputRoot, SPLIT_ARTIFACT_NAME),
    reportPath: resolveOutputFilePath(resolvedOutputRoot, "reports", SPLIT_REPORT_NAME),
    debugArtifactPath: resolveOutputFilePath(resolvedOutputRoot, "debug", SPLIT_DEBUG_ARTIFACT_NAME),
    debugWorkstreamsPath: resolveOutputFilePath(resolvedOutputRoot, "debug", SPLIT_DEBUG_WORKSTREAMS_NAME),
    debugMergeOrderPath: resolveOutputFilePath(resolvedOutputRoot, "debug", SPLIT_DEBUG_MERGE_ORDER_NAME),
    debugBlockedItemsPath: resolveOutputFilePath(resolvedOutputRoot, "debug", SPLIT_DEBUG_BLOCKED_ITEMS_NAME),
    debugStreamConstraintsPath: resolveOutputFilePath(
      resolvedOutputRoot,
      "debug",
      SPLIT_DEBUG_STREAM_CONSTRAINTS_NAME,
    ),
  };
}

export async function resolveSplitFoundationInput(
  options: SplitFoundationOptions,
  currentWorkingDirectory = process.cwd(),
): Promise<LoadedSplitFoundationInput> {
  const repoRoot = await resolveFilesystemRepoRoot(currentWorkingDirectory, options.repo);
  const basePaths = await resolveSplitOutputPaths(repoRoot, options.outputDir);
  const verifyArtifactPath = options.verifyPath
    ? resolveRequestedArtifactPath(currentWorkingDirectory, options.verifyPath)
    : basePaths.verifyArtifactPath;

  let rawVerifyArtifactText: string;

  try {
    rawVerifyArtifactText = await readFile(verifyArtifactPath, "utf8");
  } catch (error) {
    if (extractErrorCode(error) === "ENOENT") {
      throw new SplitInputResolutionError(
        "SPLIT_INPUT_MISSING",
        `Forge split could not find the Step 3 verify artifact at ${verifyArtifactPath}.`,
      );
    }

    throw new SplitInputResolutionError(
      "SPLIT_INPUT_READ_FAILED",
      error instanceof Error
        ? `Forge split could not read the Step 3 verify artifact: ${error.message}`
        : "Forge split could not read the Step 3 verify artifact.",
    );
  }

  let verifyArtifact: VerifyArtifact;

  try {
    verifyArtifact = validateVerifyArtifact(JSON.parse(rawVerifyArtifactText) as unknown);
  } catch (error) {
    throw new SplitInputResolutionError(
      "VERIFY_ARTIFACT_INVALID",
      error instanceof Error
        ? `Forge split found an invalid Step 3 verify artifact at ${verifyArtifactPath}: ${error.message}`
        : `Forge split found an invalid Step 3 verify artifact at ${verifyArtifactPath}.`,
    );
  }

  const planArtifactPath = resolveRequestedArtifactPath(
    currentWorkingDirectory,
    verifyArtifact.source_plan.artifactPath,
  );

  let rawPlanArtifactText: string;

  try {
    rawPlanArtifactText = await readFile(planArtifactPath, "utf8");
  } catch (error) {
    if (extractErrorCode(error) === "ENOENT") {
      throw new SplitInputResolutionError(
        "SPLIT_SOURCE_PLAN_MISSING",
        `Forge split could not find the Step 2 plan artifact referenced by Step 3 at ${planArtifactPath}.`,
      );
    }

    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_READ_FAILED",
      error instanceof Error
        ? `Forge split could not read the Step 2 plan artifact referenced by Step 3: ${error.message}`
        : "Forge split could not read the Step 2 plan artifact referenced by Step 3.",
    );
  }

  let planArtifact: PlanArtifact;

  try {
    planArtifact = validatePlanArtifact(JSON.parse(rawPlanArtifactText) as unknown);
  } catch (error) {
    throw new SplitInputResolutionError(
      "SPLIT_SOURCE_PLAN_INVALID",
      error instanceof Error
        ? `Forge split found an invalid Step 2 plan artifact at ${planArtifactPath}: ${error.message}`
        : `Forge split found an invalid Step 2 plan artifact at ${planArtifactPath}.`,
    );
  }

  assertSourcePlanConsistency(verifyArtifact, planArtifact, planArtifactPath);

  return {
    repoRoot,
    paths: {
      ...basePaths,
      verifyArtifactPath,
      planArtifactPath,
    },
    sourceVerify: buildSplitVerifyReference(verifyArtifact, verifyArtifactPath),
    sourcePlan: buildSplitPlanReference(planArtifact, planArtifactPath),
    sourceIntake: planArtifact.source_intake,
    splitInput: buildSplitPlanningInput(planArtifact, verifyArtifact),
  };
}
