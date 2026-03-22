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
  PLAN_REPORT_NAME,
} from "./constants.js";
import type {
  LoadedPlanFoundationInput,
  PlanFoundationOptions,
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
      intakeArtifactPath,
      artifact,
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
