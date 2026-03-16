import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { FORGE_INTAKE_COMMAND, STEP1_BOUNDARY_POLICY } from "./constants.js";
import { createIntakeArtifact } from "./artifact.js";
import { resolveCandidateTargets } from "./candidate-targets.js";
import { PersistenceError } from "./errors.js";
import { resolveTaskSource, toArtifactSourceInputs } from "./input.js";
import { resolveOutputPaths, resolveRepoRoot } from "./path-policy.js";
import { scanRepoContext } from "./repo-context.js";
import { createIntakeReport } from "./report.js";
import { evaluateSuccessModel } from "./success.js";
import { createEmptyTaskSpec, normalizeTaskSpec } from "./task-spec.js";
import type {
  CandidateTarget,
  IntakeCommandOptions,
  IntakeCommandResult,
  IntakeExecutionContext,
  IntakeFailureDetails,
  IntakeTaskSpec,
  NextStepReadiness,
  NormalizedTaskInput,
  RepoContext,
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

async function createContext(
  repoRoot: string,
  options: IntakeCommandOptions,
): Promise<IntakeExecutionContext> {
  return {
    command: FORGE_INTAKE_COMMAND,
    repoRoot,
    startedAt: new Date().toISOString(),
    boundaryPolicy: STEP1_BOUNDARY_POLICY,
    paths: await resolveOutputPaths(repoRoot, options.outputDir),
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
  taskInput: NormalizedTaskInput | null,
  taskSpec: IntakeTaskSpec,
  repoContext: RepoContext,
  candidateTargets: CandidateTarget[],
  ambiguities: string[],
  nextStepReadiness: NextStepReadiness,
  failure: IntakeFailureDetails | null,
  warnings: string[],
): Promise<IntakeCommandResult> {
  const finishedAt = new Date().toISOString();
  const artifact = createIntakeArtifact({
    context,
    finishedAt,
    sourceInputs: taskInput ? toArtifactSourceInputs(taskInput) : null,
    taskSpec,
    repoContext,
    candidateTargets,
    ambiguities,
    nextStepReadiness,
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
    nextStepReadiness: artifact.nextStepReadiness,
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
      nextStepReadiness: null,
      failure,
    };
  }

  const context = await createContext(repoRoot, options);
  let taskInput: NormalizedTaskInput | null = null;
  let failure: IntakeFailureDetails | null = null;

  if (context.paths.usedFallbackRoot && context.paths.fallbackReason) {
    failure = createFailureDetails(
      "OUTPUT_ROOT_FALLBACK",
      context.paths.fallbackReason ?? "The requested output directory violated the Step 1 boundary.",
      context.paths.fallbackReason,
    );
  }

  if (!failure) {
    const taskSourceResult = await resolveTaskSource(options, currentWorkingDirectory);

    if (taskSourceResult.failure) {
      failure = createFailureDetails(
        taskSourceResult.failure.code,
        taskSourceResult.failure.message,
      );
    } else {
      taskInput = taskSourceResult.taskInput;
    }
  }

  const taskSpec = taskInput ? normalizeTaskSpec(taskInput) : createEmptyTaskSpec();
  const repoContext = await scanRepoContext(repoRoot, context.paths.outputRoot);
  const candidateTargets = resolveCandidateTargets(taskInput, repoContext);
  const successEvaluation = evaluateSuccessModel({
    taskSpec,
    repoContext,
    candidateTargets,
    failure,
    inputAmbiguities: taskInput?.ambiguities,
    inputRecommendedUserActions: taskInput?.recommendedUserActions,
  });

  try {
    return await persistResult(
      context,
      taskInput,
      taskSpec,
      repoContext,
      candidateTargets,
      successEvaluation.ambiguities,
      successEvaluation.nextStepReadiness,
      failure,
      successEvaluation.warnings,
    );
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
        nextStepReadiness: successEvaluation.nextStepReadiness,
        failure: persistenceFailure,
      };
    }

    const fallbackContext: IntakeExecutionContext = {
      ...context,
      paths: {
        ...(await resolveOutputPaths(repoRoot)),
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
      return await persistResult(
        fallbackContext,
        taskInput,
        taskSpec,
        repoContext,
        candidateTargets,
        successEvaluation.ambiguities,
        successEvaluation.nextStepReadiness,
        fallbackFailure,
        successEvaluation.warnings,
      );
    } catch {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: fallbackContext.paths.outputRoot,
        summary:
          "Forge intake failed while persisting both the configured output root and the default .forge fallback.",
        nextStepReadiness: successEvaluation.nextStepReadiness,
        failure: fallbackFailure,
      };
    }
  }
}

