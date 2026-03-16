import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { FORGE_INTAKE_COMMAND, STEP1_BOUNDARY_POLICY } from "./constants.js";
import { createIntakeArtifact } from "./artifact.js";
import { PersistenceError } from "./errors.js";
import { resolveOutputPaths, resolveRepoRoot } from "./path-policy.js";
import { createIntakeReport } from "./report.js";
import type {
  IntakeCommandOptions,
  IntakeCommandResult,
  IntakeExecutionContext,
  IntakeFailureDetails,
} from "./types.js";

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function persistOutputFile(filePath: string, contents: string): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, contents, "utf8");
}

async function persistArtifactAndReport(
  context: IntakeExecutionContext,
  artifactContents: string,
  reportContents: string,
): Promise<void> {
  await persistOutputFile(context.paths.artifactPath, artifactContents);
  await persistOutputFile(context.paths.reportPath, reportContents);
}

function createContext(
  repoRoot: string,
  options: IntakeCommandOptions,
): IntakeExecutionContext {
  return {
    command: FORGE_INTAKE_COMMAND,
    repoRoot,
    startedAt: new Date().toISOString(),
    boundaryPolicy: STEP1_BOUNDARY_POLICY,
    paths: resolveOutputPaths(repoRoot, options.outputDir),
  };
}

function createFailureDetails(
  code: string,
  message: string,
  fallbackReason?: string,
): IntakeFailureDetails {
  return {
    code,
    message,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

async function persistResult(
  context: IntakeExecutionContext,
  failure: IntakeFailureDetails | null,
  warnings: string[],
): Promise<IntakeCommandResult> {
  const finishedAt = new Date().toISOString();
  const artifact = createIntakeArtifact({
    context,
    finishedAt,
    warnings,
    failure,
  });
  const report = createIntakeReport(artifact);

  try {
    await persistArtifactAndReport(
      context,
      `${JSON.stringify(artifact, null, 2)}\n`,
      report,
    );
  } catch (error) {
    throw new PersistenceError(
      error instanceof Error ? error.message : "Unknown persistence failure.",
    );
  }

  return {
    status: artifact.status,
    artifact,
    artifactPath: context.paths.artifactPath,
    reportPath: context.paths.reportPath,
    outputRoot: context.paths.outputRoot,
    summary: artifact.summary,
    failure,
  };
}

export async function runIntakeCommand(
  options: IntakeCommandOptions,
  currentWorkingDirectory = process.cwd(),
): Promise<IntakeCommandResult> {
  let repoRoot: string;

  try {
    repoRoot = await resolveRepoRoot(currentWorkingDirectory, options.repo);
  } catch (error) {
    const failure = createFailureDetails(
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "REPO_RESOLUTION_FAILED",
      error instanceof Error ? error.message : "Unknown repo resolution failure.",
    );

    return {
      status: "failed",
      artifact: null,
      artifactPath: null,
      reportPath: null,
      outputRoot: null,
      summary:
        "Forge intake could not resolve a safe repo root, so no artifact was persisted.",
      failure,
    };
  }

  const context = createContext(repoRoot, options);
  const warnings: string[] = [];
  let failure: IntakeFailureDetails | null = null;

  if (context.paths.usedFallbackRoot && context.paths.fallbackReason) {
    failure = createFailureDetails(
      "OUTPUT_ROOT_FALLBACK",
      context.paths.fallbackReason ?? "The requested output directory violated the Step 1 boundary.",
      context.paths.fallbackReason,
    );
  }

  try {
    return await persistResult(context, failure, warnings);
  } catch (error) {
    const persistenceFailure = createFailureDetails(
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "PERSISTENCE_FAILED",
      error instanceof Error ? error.message : "Unknown persistence failure.",
      context.paths.fallbackReason ?? undefined,
    );

    if (context.paths.usedFallbackRoot) {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: context.paths.outputRoot,
        summary:
          "Forge intake failed while persisting its fallback output. No durable artifact could be written.",
        failure: persistenceFailure,
      };
    }

    const fallbackContext: IntakeExecutionContext = {
      ...context,
      paths: {
        ...resolveOutputPaths(repoRoot),
        requestedOutputRoot: context.paths.requestedOutputRoot ?? context.paths.outputRoot,
        usedFallbackRoot: true,
        fallbackReason:
          "The configured output root failed during persistence. Forge retried using the default .forge output root.",
      },
    };

    const fallbackFailure = createFailureDetails(
      persistenceFailure.code,
      persistenceFailure.message,
      fallbackContext.paths.fallbackReason ?? undefined,
    );

    try {
      return await persistResult(fallbackContext, fallbackFailure, warnings);
    } catch {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: fallbackContext.paths.outputRoot,
        summary:
          "Forge intake failed while persisting both the configured output root and the default .forge fallback.",
        failure: fallbackFailure,
      };
    }
  }
}

