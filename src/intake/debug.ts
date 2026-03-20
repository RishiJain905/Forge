import type {
  ArtifactSourceInputs,
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeDebugArtifact,
  IntakeExecutionContext,
  IntakeFailureDetails,
  NextStepReadiness,
  OptionalReasoningResolution,
  ResolvedRuntimeOptions,
} from "./types.js";

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
