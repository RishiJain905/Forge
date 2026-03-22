import { FORGE_INTAKE_COMMAND, STEP1_BOUNDARY_POLICY } from "./constants.js";
import { buildAmbiguityAnalysisResult } from "./analysis.js";
import { assembleIntakeResult } from "./assemble.js";
import { createIntakeArtifact } from "./artifact.js";
import { buildBoundarySafeIntakeResult } from "./boundary.js";
import { createIntakeDebugWrites } from "./debug.js";
import { evaluateSuccessModel } from "./confidence.js";
import { PersistenceError, extractErrorCode } from "./errors.js";
import { buildInferenceResult } from "./inference.js";
import { resolveIntakeInput, toArtifactSourceInputs } from "./input.js";
import { resolveOptionalReasoning } from "./llm.js";
import { resolveRuntimeOptions } from "./options.js";
import {
  resolveFilesystemRepoRoot,
  resolveOutputPaths,
  selectRepoRootFromGitContext,
} from "./path-policy.js";
import { persistIntakeOutputs } from "./persistence.js";
import { scanRepoResult } from "./repo-context.js";
import { createIntakeReport } from "./report.js";
import { buildTaskParserResult } from "./task-parser.js";
import { resolveGitContext } from "./git-context.js";
import type {
  IntakeCommandOptions,
  IntakeCommandResult,
  IntakeExecutionContext,
  IntakeFailureDetails,
  IntakeRunnerDependencies,
  NextStepReadiness,
  NormalizedTaskInput,
  BoundarySafeIntakeResult,
  AssembledIntakeResult,
  NormalizedTaskSpec,
  OptionalReasoningTaskWording,
  PromptOpenQuestion,
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

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function dedupeOpenQuestions(
  questions: PromptOpenQuestion[],
): PromptOpenQuestion[] {
  const seen = new Set<string>();
  const deduped: PromptOpenQuestion[] = [];

  for (const question of questions) {
    const text = question.text.trim();
    if (!text) {
      continue;
    }

    const key = `${question.category}:${text.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      category: question.category,
      text,
    });
  }

  return deduped;
}

function applyOptionalTaskWording(
  taskSpec: NormalizedTaskSpec,
  taskWording: OptionalReasoningTaskWording | null,
): NormalizedTaskSpec {
  if (!taskWording) {
    return taskSpec;
  }

  return {
    ...taskSpec,
    title: taskWording.title ?? taskSpec.title,
    summary: taskWording.summary ?? taskSpec.summary,
    goal: taskWording.goal ?? taskSpec.goal,
    explicitRequirements: dedupeStable([
      ...(taskSpec.explicitRequirements ?? []),
      ...(taskWording.explicitRequirements ?? []),
    ]),
    implementationNecessities: dedupeStable([
      ...(taskSpec.implementationNecessities ?? []),
      ...(taskWording.implementationNecessities ?? []),
    ]),
    openQuestions: dedupeOpenQuestions([
      ...(taskSpec.openQuestions ?? []),
      ...(taskWording.openQuestions ?? []),
    ]),
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
  optionalReasoningResult: Awaited<ReturnType<typeof resolveOptionalReasoning>>,
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
  const debugWrites = runtimeOptions.writeDebugArtifact
    ? createIntakeDebugWrites({
        context,
        runtimeOptions,
        taskInput,
        sourceInputs,
        assembledResult,
        optionalReasoningResult,
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
      debugWrites,
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
  dependencies: IntakeRunnerDependencies = {},
): Promise<IntakeCommandResult> {
  let repoRoot: string;

  try {
    const filesystemRepoRoot = await resolveFilesystemRepoRoot(
      currentWorkingDirectory,
      options.repo,
    );
    const gitContextResult = await resolveGitContext(
      filesystemRepoRoot,
      dependencies.gitCommandRunner,
    );

    repoRoot = selectRepoRootFromGitContext(
      filesystemRepoRoot,
      gitContextResult,
    );

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

    const resolvedInput = await resolveIntakeInput({
      options,
      currentWorkingDirectory,
      repoRoot,
    });
    validationBlockingIssues = resolvedInput.blockingIssues;
    validationWarnings = resolvedInput.warnings;
    validationRecommendedUserActions = resolvedInput.recommendedUserActions;
    taskInput = resolvedInput.normalizedTaskInput;

    if (!failure && runtimeBlockingIssues.length > 0) {
      failure = createFailureDetails(
        "CLI_FLAG_POLICY_FAILED",
        "Forge intake found blocking CLI flag conflicts.",
      );
    }

    if (!failure && resolvedInput.blockingIssues.length > 0) {
      failure = createFailureDetails(
        "INPUT_VALIDATION_FAILED",
        "Forge intake found blocking input validation issues.",
      );
    }

    const taskParserResult = buildTaskParserResult(taskInput);
    const repoScanResult = await scanRepoResult(
      repoRoot,
      context.paths.outputRoot,
      gitContextResult,
    );
    const inferenceResult = buildInferenceResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      strictFocus: runtimeOptions.strictFocus,
    });
    const optionalReasoningResult = await resolveOptionalReasoning({
      runtimeOptions,
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      optionalReasoningHook: dependencies.optionalReasoningHook,
    });
    const ambiguityAnalysisResult = buildAmbiguityAnalysisResult({
      taskInput,
      taskParserResult,
      repoScanResult,
      inferenceResult,
      runtimeOptions,
      optionalReasoningResult,
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
    const enrichedTaskSpec = applyOptionalTaskWording(
      assembledResult.taskSpec,
      optionalReasoningResult.taskWording,
    );
    const successEvaluation = evaluateSuccessModel({
      taskSpec: enrichedTaskSpec,
      repoContext: assembledResult.repoContext,
      candidateTargets: assembledResult.candidateTargets,
      failure,
      confidenceLevel: assembledResult.confidence.level,
      failOnLowConfidence: runtimeOptions.failOnLowConfidence,
      validationBlockingIssues: [...runtimeBlockingIssues, ...validationBlockingIssues],
      inputWarnings: assembledResult.warnings,
      inputAmbiguities: assembledResult.ambiguities,
      inputAmbiguityItems: assembledResult.responsibilities.analysis.ambiguityItems,
      inputRecommendedUserActions: assembledResult.recommendedUserActions,
    });
    if (!failure) {
      const lowConfidenceEscalation = successEvaluation.nextStepReadiness.blockingIssues.find(
        (issue) => issue.code === "LOW_CONFIDENCE_ESCALATED",
      );

      if (lowConfidenceEscalation) {
        failure = createFailureDetails(
          lowConfidenceEscalation.code,
          lowConfidenceEscalation.message,
        );
      }
    }
    const finalAssembledResult = {
      ...assembledResult,
      taskSpec: enrichedTaskSpec,
      riskAnalysis: assembledResult.riskAnalysis,
      verificationTargets: assembledResult.verificationTargets,
      ambiguities: successEvaluation.ambiguities,
      warnings: successEvaluation.warnings,
      recommendedUserActions: successEvaluation.nextStepReadiness.recommendedUserActions,
    };
    const initialVerificationTargets =
      finalAssembledResult.verificationTargets ?? [];

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
          initialVerificationTargets,
        }),
        successEvaluation.nextStepReadiness,
        failure,
        optionalReasoningResult,
      );
    } catch (error) {
      const persistenceFailure = createFailureDetails(
        extractErrorCode(error) ?? "PERSISTENCE_FAILED",
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
            initialVerificationTargets,
          }),
          successEvaluation.nextStepReadiness,
          fallbackFailure,
          optionalReasoningResult,
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
  } catch (error) {
    const failure = createFailureDetails(
      extractErrorCode(error) ?? "REPO_RESOLUTION_FAILED",
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
}

