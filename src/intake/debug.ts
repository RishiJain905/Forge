import {
  DEBUG_DIRECTORY,
  INTAKE_DEBUG_ARTIFACT_NAME,
} from "./constants.js";
import { resolveOutputFilePath } from "./path-policy.js";
import type {
  ArtifactSourceInputs,
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeDebugArtifact,
  IntakeExecutionContext,
  IntakeFailureDetails,
  NextStepReadiness,
  NormalizedTaskInput,
  OptionalReasoningResolution,
  ResolvedRuntimeOptions,
} from "./types.js";

interface DebugWrite {
  filePath: string;
  contents: string;
}

export function createIntakeDebugArtifact(params: {
  context: IntakeExecutionContext;
  runtimeOptions: ResolvedRuntimeOptions;
  sourceInputs: ArtifactSourceInputs | null;
  assembledResult: AssembledIntakeResult;
  optionalReasoningResult: OptionalReasoningResolution;
  boundarySafeResult: BoundarySafeIntakeResult;
  nextStepReadiness: NextStepReadiness;
  failure: IntakeFailureDetails | null;
}): IntakeDebugArtifact {
  return {
    command: `forge ${params.context.command}`,
    repoRoot: params.context.repoRoot,
    requestedOutputRoot: params.context.paths.requestedOutputRoot,
    outputRoot: params.context.paths.outputRoot,
    runtimeOptions: {
      outputMode: params.runtimeOptions.outputMode,
      writeArtifact: params.runtimeOptions.writeArtifact,
      writeReport: params.runtimeOptions.writeReport,
      writeDebugArtifact: params.runtimeOptions.writeDebugArtifact,
      llmMode: params.runtimeOptions.llmMode,
      strictFocus: params.runtimeOptions.strictFocus,
      failOnLowConfidence: params.runtimeOptions.failOnLowConfidence,
    },
    paths: {
      artifactPath: params.context.paths.artifactPath,
      reportPath: params.context.paths.reportPath,
      debugArtifactPath: params.context.paths.debugArtifactPath,
    },
    sourceInputs: params.sourceInputs,
    responsibilities: params.assembledResult.responsibilities,
    assembledResult: {
      taskSpec: params.assembledResult.taskSpec,
      repoContext: params.assembledResult.repoContext,
      candidateTargets: params.assembledResult.candidateTargets,
      riskAnalysis: params.assembledResult.riskAnalysis,
      verificationTargets: params.assembledResult.verificationTargets,
      ambiguities: params.assembledResult.ambiguities,
      warnings: params.assembledResult.warnings,
      recommendedUserActions: params.assembledResult.recommendedUserActions,
      confidence: params.assembledResult.confidence,
    },
    optionalReasoning: params.optionalReasoningResult,
    boundarySafeResult: params.boundarySafeResult,
    nextStepReadiness: params.nextStepReadiness,
    failure: params.failure,
  };
}

export function createIntakeDebugWrites(params: {
  context: IntakeExecutionContext;
  runtimeOptions: ResolvedRuntimeOptions;
  taskInput: NormalizedTaskInput | null;
  sourceInputs: ArtifactSourceInputs | null;
  assembledResult: AssembledIntakeResult;
  optionalReasoningResult: OptionalReasoningResolution;
  boundarySafeResult: BoundarySafeIntakeResult;
  nextStepReadiness: NextStepReadiness;
  failure: IntakeFailureDetails | null;
}): DebugWrite[] {
  const aggregate = createIntakeDebugArtifact({
    context: params.context,
    runtimeOptions: params.runtimeOptions,
    sourceInputs: params.sourceInputs,
    assembledResult: params.assembledResult,
    optionalReasoningResult: params.optionalReasoningResult,
    boundarySafeResult: params.boundarySafeResult,
    nextStepReadiness: params.nextStepReadiness,
    failure: params.failure,
  });
  const debugRoot = resolveOutputFilePath(
    params.context.paths.outputRoot,
    DEBUG_DIRECTORY,
  );

  const writes: Array<{ name: string; payload: unknown }> = [
    {
      name: INTAKE_DEBUG_ARTIFACT_NAME,
      payload: aggregate,
    },
    {
      name: "spec-parse.json",
      payload: {
        taskInput: params.taskInput,
        taskParserResult: params.assembledResult.responsibilities.taskParser,
        optionalReasoningTaskWording: params.optionalReasoningResult.taskWording,
      },
    },
    {
      name: "repo-scan.json",
      payload: params.assembledResult.responsibilities.repoScan,
    },
    {
      name: "candidate-files.json",
      payload: {
        candidateTargets: params.assembledResult.candidateTargets,
        verificationTargets:
          params.assembledResult.verificationTargets ??
          params.boundarySafeResult.initialVerificationTargets,
      },
    },
    {
      name: "warnings.json",
      payload: {
        warnings: params.assembledResult.warnings,
        ambiguities: params.assembledResult.ambiguities,
        ambiguityItems: params.assembledResult.responsibilities.analysis.ambiguityItems ?? [],
        warningItems: params.assembledResult.responsibilities.analysis.warningItems ?? [],
        confidence: params.assembledResult.confidence,
        nextStepReadiness: params.nextStepReadiness,
        failure: params.failure,
        optionalReasoning: {
          requested: params.optionalReasoningResult.requested,
          attempted: params.optionalReasoningResult.attempted,
          used: params.optionalReasoningResult.used,
          provider: params.optionalReasoningResult.provider,
        },
      },
    },
  ];

  return writes.map((write) => ({
    filePath: resolveOutputFilePath(debugRoot, write.name),
    contents: `${JSON.stringify(write.payload, null, 2)}\n`,
  }));
}
