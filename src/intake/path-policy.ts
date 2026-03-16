import path from "node:path";
import { access, stat } from "node:fs/promises";

import {
  DEFAULT_OUTPUT_DIRECTORY,
  INTAKE_ARTIFACT_NAME,
  INTAKE_REPORT_NAME,
  REPORTS_DIRECTORY,
} from "./constants.js";
import { BoundaryPolicyError, RepoResolutionError } from "./errors.js";
import type { ResolvedOutputPaths, ResolvedOutputRoot } from "./types.js";

const accessMode = 0;

function isPathWithinRoot(root: string, candidatePath: string): boolean {
  const relative = path.relative(root, candidatePath);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function resolveRepoRoot(
  currentWorkingDirectory: string,
  requestedRepoRoot?: string,
): Promise<string> {
  const repoRoot = requestedRepoRoot
    ? path.resolve(currentWorkingDirectory, requestedRepoRoot)
    : currentWorkingDirectory;

  try {
    await access(repoRoot, accessMode);
    const repoStats = await stat(repoRoot);

    if (!repoStats.isDirectory()) {
      throw new RepoResolutionError(
        `Could not resolve repo root: ${repoRoot}. The path must point to a directory.`,
      );
    }
  } catch (error) {
    if (error instanceof RepoResolutionError) {
      throw error;
    }

    throw new RepoResolutionError(
      `Could not resolve repo root: ${repoRoot}. The path must exist and be readable.`,
    );
  }

  return repoRoot;
}

export function resolveOutputRoot(
  repoRoot: string,
  requestedOutputDirectory?: string,
): ResolvedOutputRoot {
  const defaultOutputRoot = path.resolve(repoRoot, DEFAULT_OUTPUT_DIRECTORY);

  if (!requestedOutputDirectory) {
    return {
      requestedOutputRoot: null,
      outputRoot: defaultOutputRoot,
      usedFallbackRoot: false,
      fallbackReason: null,
    };
  }

  const candidateRoot = path.isAbsolute(requestedOutputDirectory)
    ? path.normalize(requestedOutputDirectory)
    : path.resolve(repoRoot, requestedOutputDirectory);

  if (!isPathWithinRoot(repoRoot, candidateRoot)) {
    return {
      requestedOutputRoot: candidateRoot,
      outputRoot: defaultOutputRoot,
      usedFallbackRoot: true,
      fallbackReason:
        "The requested output directory resolved outside the repo. Falling back to the default .forge output root.",
    };
  }

  return {
    requestedOutputRoot: candidateRoot,
    outputRoot: candidateRoot,
    usedFallbackRoot: false,
    fallbackReason: null,
  };
}

export function resolveOutputFilePath(
  outputRoot: string,
  ...relativeSegments: string[]
): string {
  const resolvedPath = path.resolve(outputRoot, ...relativeSegments);

  if (!isPathWithinRoot(outputRoot, resolvedPath)) {
    throw new BoundaryPolicyError(
      `Refusing to write outside the configured output root: ${resolvedPath}`,
    );
  }

  return resolvedPath;
}

export function resolveOutputPaths(
  repoRoot: string,
  requestedOutputDirectory?: string,
): ResolvedOutputPaths {
  const outputRoot = resolveOutputRoot(repoRoot, requestedOutputDirectory);

  return {
    ...outputRoot,
    artifactPath: resolveOutputFilePath(outputRoot.outputRoot, INTAKE_ARTIFACT_NAME),
    reportPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      REPORTS_DIRECTORY,
      INTAKE_REPORT_NAME,
    ),
  };
}