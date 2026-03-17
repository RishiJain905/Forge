import { FORGE_INTAKE_COMMAND, STEP1_BOUNDARY_POLICY } from "./constants.js";
import { buildAmbiguityAnalysisResult } from "./analysis.js";
import { assembleIntakeResult } from "./assemble.js";
import { createIntakeArtifact } from "./artifact.js";
import { buildBoundarySafeIntakeResult } from "./boundary.js";
import { createIntakeDebugArtifact } from "./debug.js";
import { PersistenceError } from "./errors.js";
import { buildInferenceResult } from "./inference.js";
import { resolveTaskSource, toArtifactSourceInputs } from "./input.js";
import { resolveRuntimeOptions } from "./options.js";
import { resolveOutputPaths, resolveRepoRoot } from "./path-policy.js";
import { persistIntakeOutputs } from "./persistence.js";
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
  AssembledIntakeResult,
} from "./types.js";

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
  assembledResult: AssembledIntakeResult,
  boundarySafeResult: BoundarySafeIntakeResult,
  nextStepReadiness: NextStepReadiness,
  failure: IntakeFailureDetails | null,
): Promise<IntakeCommandResult> {
  const finishedAt = new Date().toISOString();
  const sourceInputs = taskInput ? toArtifactSourceInputs(taskInput) : null;
  const artifact = createIntakeArtifact({
    context,
    finishedAt,
    sourceInputs,
    runtimeOptions,
    assembledResult,
    boundarySafeResult,
    nextStepReadiness,
    failure,
  });
  const report = createIntakeReport(artifact);
  const debugArtifact = runtimeOptions.writeDebugArtifact
    ? createIntakeDebugArtifact({
        context,
        runtimeOptions,
        sourceInputs,
        assembledResult,
        boundarySafeResult,
        nextStepReadiness,
        failure,
      })
    : null;

  try {
    await persistIntakeOutputs({
      criticalWrites: [
        ...(runtimeOptions.writeArtifact
          ? [{
              filePath: context.paths.artifactPath,
              contents: `${JSON.stringify(artifact, null, 2)}\n`,
            }]
          : []),
        ...(runtimeOptions.writeReport
          ? [{
              filePath: context.paths.reportPath,
              contents: report,
            }]
          : []),
      ],
      debugWrite: debugArtifact
        ? {
            filePath: context.paths.debugArtifactPath,
            contents: `${JSON.stringify(debugArtifact, null, 2)}\n`,
          }
        : null,
    });
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
    nextStepReadiness: nextStepReadiness,
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

  const validationResult = await validateIntakeInputs(options, currentWorkingDirectory, repoRoot);
  validationBlockingIssues = validationResult.blockingIssues;
  validationWarnings = validationResult.warnings;
  validationRecommendedUserActions = validationResult.recommendedUserActions;

  if (validationResult.validatedInput) {
    taskInput = resolveTaskSource(validationResult.validatedInput);
  }

  if (!failure && runtimeBlockingIssues.length > 0) {
    failure = createFailureDetails(
      "CLI_FLAG_POLICY_FAILED",
      "Forge intake found blocking CLI flag conflicts.",
    );
  }

  if (!failure && validationResult.blockingIssues.length > 0) {
    failure = createFailureDetails(
      "INPUT_VALIDATION_FAILED",
      "Forge intake found blocking input validation issues.",
    );
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
      finalAssembledResult,
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
        finalAssembledResult,
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

