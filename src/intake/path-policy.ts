import path from "node:path";
import { access, realpath, stat } from "node:fs/promises";

import {
  DEBUG_DIRECTORY,
  DEFAULT_OUTPUT_DIRECTORY,
  INTAKE_ARTIFACT_NAME,
  INTAKE_DEBUG_ARTIFACT_NAME,
  INTAKE_REPORT_NAME,
  REPORTS_DIRECTORY,
} from "./constants.js";
import { BoundaryPolicyError, RepoResolutionError } from "./errors.js";
import { resolveGitContext } from "./git-context.js";
import type { GitContextResolution } from "./git-context.js";
import type { ResolvedOutputPaths, ResolvedOutputRoot } from "./types.js";

const accessMode = 0;

function isPathWithinRoot(root: string, candidatePath: string): boolean {
  const relative = path.relative(root, candidatePath);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

async function resolveBoundaryPath(candidatePath: string): Promise<string> {
  const pendingSegments: string[] = [];
  let currentPath = path.resolve(candidatePath);

  while (true) {
    try {
      const resolvedCurrentPath = await realpath(currentPath);
      return path.resolve(resolvedCurrentPath, ...pendingSegments.reverse());
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) {
        throw error;
      }

      const parentPath = path.dirname(currentPath);

      if (parentPath === currentPath) {
        throw error;
      }

      pendingSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

export async function resolveFilesystemRepoRoot(
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

    return await realpath(repoRoot);
  } catch (error) {
    if (error instanceof RepoResolutionError) {
      throw error;
    }

    throw new RepoResolutionError(
      `Could not resolve repo root: ${repoRoot}. The path must exist and be readable.`,
    );
  }
}

export async function resolveRepoRoot(
  currentWorkingDirectory: string,
  requestedRepoRoot?: string,
  gitCommandRunner?: Parameters<typeof resolveGitContext>[1],
): Promise<string> {
  const resolvedRepoRoot = await resolveFilesystemRepoRoot(
    currentWorkingDirectory,
    requestedRepoRoot,
  );
  const gitContext = await resolveGitContext(resolvedRepoRoot, gitCommandRunner);

  return gitContext.gitContext.status === "available" && gitContext.gitContext.repoRoot
    ? gitContext.gitContext.repoRoot
    : resolvedRepoRoot;
}

export function selectRepoRootFromGitContext(
  resolvedRepoRoot: string,
  gitContextResolution: GitContextResolution,
): string {
  return gitContextResolution.gitContext.status === "available" &&
    gitContextResolution.gitContext.repoRoot
    ? gitContextResolution.gitContext.repoRoot
    : resolvedRepoRoot;
}

export async function resolveOutputRoot(
  repoRoot: string,
  requestedOutputDirectory?: string,
): Promise<ResolvedOutputRoot> {
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

  const resolvedCandidateRoot = await resolveBoundaryPath(candidateRoot);

  if (!isPathWithinRoot(repoRoot, resolvedCandidateRoot)) {
    return {
      requestedOutputRoot: candidateRoot,
      outputRoot: defaultOutputRoot,
      usedFallbackRoot: true,
      fallbackReason:
        "The requested output directory resolved outside the repo boundary after following real filesystem paths. Falling back to the default .forge output root.",
    };
  }

  return {
    requestedOutputRoot: candidateRoot,
    outputRoot: resolvedCandidateRoot,
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

export async function resolveOutputPaths(
  repoRoot: string,
  requestedOutputDirectory?: string,
): Promise<ResolvedOutputPaths> {
  const outputRoot = await resolveOutputRoot(repoRoot, requestedOutputDirectory);

  return {
    ...outputRoot,
    artifactPath: resolveOutputFilePath(outputRoot.outputRoot, INTAKE_ARTIFACT_NAME),
    reportPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      REPORTS_DIRECTORY,
      INTAKE_REPORT_NAME,
    ),
    debugArtifactPath: resolveOutputFilePath(
      outputRoot.outputRoot,
      DEBUG_DIRECTORY,
      INTAKE_DEBUG_ARTIFACT_NAME,
    ),
  };
}
