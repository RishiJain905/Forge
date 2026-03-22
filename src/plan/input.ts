import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_OUTPUT_DIRECTORY, INTAKE_ARTIFACT_NAME } from "../intake/constants.js";
import { validateIntakeArtifact } from "../intake/artifact-schema.js";
import { resolveFilesystemRepoRoot } from "../intake/path-policy.js";
import type { LoadedPlanFoundationInput, PlanFoundationOptions } from "./types.js";

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

function resolveIntakeArtifactPath(
  repoRoot: string,
  currentWorkingDirectory: string,
  requestedIntakePath?: string,
): string {
  if (!requestedIntakePath) {
    return path.resolve(repoRoot, DEFAULT_OUTPUT_DIRECTORY, INTAKE_ARTIFACT_NAME);
  }

  return path.isAbsolute(requestedIntakePath)
    ? path.normalize(requestedIntakePath)
    : path.resolve(currentWorkingDirectory, requestedIntakePath);
}

export async function resolvePlanFoundationInput(
  options: PlanFoundationOptions,
  currentWorkingDirectory = process.cwd(),
): Promise<LoadedPlanFoundationInput> {
  const repoRoot = await resolveFilesystemRepoRoot(currentWorkingDirectory, options.repo);
  const artifactPath = resolveIntakeArtifactPath(
    repoRoot,
    currentWorkingDirectory,
    options.intakePath,
  );

  let rawArtifactText: string;

  try {
    rawArtifactText = await readFile(artifactPath, "utf8");
  } catch (error) {
    if (extractErrorCode(error) === "ENOENT") {
      throw new PlanInputResolutionError(
        "PLAN_INPUT_MISSING",
        `Forge plan could not find the Step 1 intake artifact at ${artifactPath}.`,
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
      artifactPath,
      artifact,
    };
  } catch (error) {
    throw new PlanInputResolutionError(
      "INTAKE_ARTIFACT_INVALID",
      error instanceof Error
        ? `Forge plan found an invalid Step 1 intake artifact at ${artifactPath}: ${error.message}`
        : `Forge plan found an invalid Step 1 intake artifact at ${artifactPath}.`,
    );
  }
}
