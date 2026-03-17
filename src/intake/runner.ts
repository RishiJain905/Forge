import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { FORGE_INTAKE_COMMAND, STEP1_BOUNDARY_POLICY } from "./constants.js";
import { buildAmbiguityAnalysisResult } from "./analysis.js";
import { assembleIntakeResult } from "./assemble.js";
import { createIntakeArtifact } from "./artifact.js";
import { buildBoundarySafeIntakeResult } from "./boundary.js";
import { PersistenceError } from "./errors.js";
import { buildInferenceResult } from "./inference.js";
import { resolveTaskSource, toArtifactSourceInputs } from "./input.js";
import { resolveRuntimeOptions } from "./options.js";
import { resolveOutputPaths, resolveRepoRoot } from "./path-policy.js";
import { scanRepoResult } from "./repo-context.js";
import { createIntakeReport } from "./report.js";
import { evaluateSuccessModel } from "./success.js";
import { buildTaskParserResult } from "./task-parser.js";
import { validateIntakeInputs } from "./validation.js";
import type {
  IntakeCommandOptions,
  IntakeCommandResult,
  IntakeExecutionContext,
  IntakeFailureDetails,
  NextStepReadiness,
  NormalizedTaskInput,
  BoundarySafeIntakeResult,
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
  writeArtifact: boolean,
  writeReport: boolean,
  artifactContents: string,
  reportContents: string,
): Promise<void> {
  if (writeArtifact) {
    await persistOutputFile(context.paths.artifactPath, artifactContents);
  }

  if (writeReport) {
    await persistOutputFile(context.paths.reportPath, reportContents);
  }
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
  runtimeOptions: ReturnType<typeof resolveRuntimeOptions>,
  taskInput: NormalizedTaskInput | null,
  boundarySafeResult: BoundarySafeIntakeResult,
  nextStepReadiness: NextStepReadiness,
  failure: IntakeFailureDetails | null,
): Promise<IntakeCommandResult> {
  const finishedAt = new Date().toISOString();
  const artifact = createIntakeArtifact({
    context,
    finishedAt,
    sourceInputs: taskInput ? toArtifactSourceInputs(taskInput) : null,
    runtimeOptions,
    taskSpec: boundarySafeResult.taskSpec,
    repoContext: boundarySafeResult.repoContext,
    candidateTargets: boundarySafeResult.candidateTargets,
    initialVerificationTargets: boundarySafeResult.initialVerificationTargets,
    ambiguities: boundarySafeResult.ambiguities,
    nextStepReadiness,
    boundaryNotes: boundarySafeResult.boundaryNotes,
    warnings: boundarySafeResult.warnings,
    failure,
  });
  const report = createIntakeReport(artifact);

  try {
    await persistArtifactAndReport(
      context,
      runtimeOptions.writeArtifact,
      runtimeOptions.writeReport,
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
    artifactPath: runtimeOptions.writeArtifact ? context.paths.artifactPath : null,
    reportPath: runtimeOptions.writeReport ? context.paths.reportPath : null,
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
  const runtimeOptions = resolveRuntimeOptions(options);
  let taskInput: NormalizedTaskInput | null = null;
  let failure: IntakeFailureDetails | null = null;
  let runtimeBlockingIssues = [...runtimeOptions.blockingIssues];
  let runtimeWarnings = [...runtimeOptions.warnings];
  let runtimeRecommendedUserActions = [...runtimeOptions.recommendedUserActions];
  let validationBlockingIssues: NextStepReadiness["blockingIssues"] = [];
  let validationWarnings: string[] = [];
  let validationRecommendedUserActions: string[] = [];

  if (context.paths.usedFallbackRoot && context.paths.fallbackReason) {
    failure = createFailureDetails(
      "OUTPUT_ROOT_FALLBACK",
      context.paths.fallbackReason ?? "The requested output directory violated the Step 1 boundary.",
      context.paths.fallbackReason,
    );
  }

  if (!failure && runtimeBlockingIssues.length > 0) {
    failure = createFailureDetails(
      "CLI_FLAG_POLICY_FAILED",
      "Forge intake found blocking CLI flag conflicts.",
    );
  }

  if (!failure) {
    const validationResult = await validateIntakeInputs(options, currentWorkingDirectory, repoRoot);
    validationBlockingIssues = validationResult.blockingIssues;
    validationWarnings = validationResult.warnings;
    validationRecommendedUserActions = validationResult.recommendedUserActions;

    if (validationResult.blockingIssues.length > 0) {
      failure = createFailureDetails(
        "INPUT_VALIDATION_FAILED",
        "Forge intake found blocking input validation issues.",
      );
    } else if (validationResult.validatedInput) {
      taskInput = resolveTaskSource(validationResult.validatedInput);
    }
  }

  const taskParserResult = buildTaskParserResult(taskInput);
  const repoScanResult = await scanRepoResult(repoRoot, context.paths.outputRoot);
  const inferenceResult = buildInferenceResult({
    taskInput,
    taskParserResult,
    repoScanResult,
  });
  const ambiguityAnalysisResult = buildAmbiguityAnalysisResult({
    taskInput,
    taskParserResult,
    repoScanResult,
    inferenceResult,
    runtimeOptions,
    failure,
    validationBlockingIssues: [...runtimeBlockingIssues, ...validationBlockingIssues],
    validationWarnings,
    validationRecommendedUserActions,
  });
  const assembledResult = assembleIntakeResult({
    taskInput,
    taskParserResult,
    repoScanResult,
    inferenceResult,
    ambiguityAnalysisResult,
  });
  const successEvaluation = evaluateSuccessModel({
    taskSpec: assembledResult.taskSpec,
    repoContext: assembledResult.repoContext,
    candidateTargets: assembledResult.candidateTargets,
    failure,
    validationBlockingIssues: [...runtimeBlockingIssues, ...validationBlockingIssues],
    inputWarnings: assembledResult.warnings,
    inputAmbiguities: assembledResult.ambiguities,
    inputRecommendedUserActions: assembledResult.recommendedUserActions,
  });
  const finalAssembledResult = {
    ...assembledResult,
    ambiguities: successEvaluation.ambiguities,
    warnings: successEvaluation.warnings,
    recommendedUserActions: successEvaluation.nextStepReadiness.recommendedUserActions,
  };

  try {
    return await persistResult(
      context,
      runtimeOptions,
      taskInput,
      buildBoundarySafeIntakeResult({
        context,
        taskInput,
        assembledResult: finalAssembledResult,
      }),
      successEvaluation.nextStepReadiness,
      failure,
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
        runtimeOptions,
        taskInput,
        buildBoundarySafeIntakeResult({
          context: fallbackContext,
          taskInput,
          assembledResult: finalAssembledResult,
        }),
        successEvaluation.nextStepReadiness,
        fallbackFailure,
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

