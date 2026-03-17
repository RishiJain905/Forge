import type {
  AmbiguityAnalysisResult,
  AssembledIntakeResult,
  InferenceResult,
  NormalizedTaskInput,
  RepoScanResult,
  TaskParserResult,
} from "./types.js";

export function assembleIntakeResult(params: {
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  ambiguityAnalysisResult: AmbiguityAnalysisResult;
}): AssembledIntakeResult {
  return {
    responsibilities: {
      taskParser: params.taskParserResult,
      repoScan: params.repoScanResult,
      inference: params.inferenceResult,
      analysis: params.ambiguityAnalysisResult,
    },
    taskSpec: params.taskParserResult.taskSpec,
    repoContext: params.repoScanResult.repoContext,
    candidateTargets: params.inferenceResult.candidateTargets,
    ambiguities: [...params.ambiguityAnalysisResult.ambiguities],
    warnings: [...params.ambiguityAnalysisResult.warnings],
    recommendedUserActions: [...params.ambiguityAnalysisResult.recommendedUserActions],
    confidence: params.ambiguityAnalysisResult.confidence,
  };
}
