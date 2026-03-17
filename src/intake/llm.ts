import type {
  InferenceResult,
  NormalizedTaskInput,
  OptionalReasoningHook,
  OptionalReasoningResolution,
  RepoScanResult,
  ResolvedRuntimeOptions,
  TaskParserResult,
} from "./types.js";

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function createEmptyResolution(requested: boolean): OptionalReasoningResolution {
  return {
    requested,
    attempted: false,
    used: false,
    available: false,
    provider: null,
    ambiguities: [],
    warnings: [],
    recommendedUserActions: [],
    confidenceNotes: [],
    suggestedTargetPaths: [],
    ignoredTargetPaths: [],
  };
}

export async function resolveOptionalReasoning(params: {
  runtimeOptions: ResolvedRuntimeOptions;
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  optionalReasoningHook?: OptionalReasoningHook;
}): Promise<OptionalReasoningResolution> {
  const requested = params.runtimeOptions.llmMode === "assist";
  const resolution = createEmptyResolution(requested);

  if (!requested) {
    return resolution;
  }

  if (!params.optionalReasoningHook) {
    pushUnique(
      resolution.warnings,
      "LLM assist was requested, but no optional reasoning backend is configured. Forge intake continued in deterministic mode.",
    );
    pushUnique(
      resolution.confidenceNotes,
      "optional LLM assist was unavailable, so deterministic analysis remained authoritative",
    );
    return resolution;
  }

  resolution.attempted = true;
  resolution.available = true;

  try {
    const suggestion = await params.optionalReasoningHook({
      taskInput: params.taskInput,
      taskParserResult: params.taskParserResult,
      repoScanResult: params.repoScanResult,
      inferenceResult: params.inferenceResult,
    });

    if (!suggestion) {
      pushUnique(
        resolution.warnings,
        "LLM assist was requested, but the optional reasoning hook returned no enrichment. Forge intake continued in deterministic mode.",
      );
      pushUnique(
        resolution.confidenceNotes,
        "optional LLM assist returned no usable enrichment, so deterministic analysis remained authoritative",
      );
      return resolution;
    }

    resolution.provider = suggestion.provider;
    resolution.ambiguities = [...(suggestion.ambiguities ?? [])];
    resolution.warnings = [...(suggestion.warnings ?? [])];
    resolution.recommendedUserActions = [...(suggestion.recommendedUserActions ?? [])];
    resolution.confidenceNotes = [...(suggestion.confidenceNotes ?? [])];
    resolution.suggestedTargetPaths = [...(suggestion.suggestedTargetPaths ?? [])];

    const repoFiles = new Set(
      params.repoScanResult.repoContext.allFiles.map(normalizePathForComparison),
    );
    resolution.ignoredTargetPaths = resolution.suggestedTargetPaths.filter(
      (path) => !repoFiles.has(normalizePathForComparison(path)),
    );

    if (resolution.ignoredTargetPaths.length > 0) {
      pushUnique(
        resolution.warnings,
        `Deterministic repo grounding overrode optional reasoning target suggestions that were not found: ${resolution.ignoredTargetPaths.join(", ")}.`,
      );
      pushUnique(
        resolution.confidenceNotes,
        "deterministic repo facts overrode conflicting optional reasoning suggestions",
      );
    }

    resolution.used =
      resolution.ambiguities.length > 0 ||
      resolution.warnings.length > 0 ||
      resolution.recommendedUserActions.length > 0 ||
      resolution.confidenceNotes.length > 0;

    return resolution;
  } catch (error) {
    resolution.warnings = [
      `Optional reasoning failed and deterministic intake continued: ${error instanceof Error ? error.message : "unknown optional reasoning failure"}.`,
    ];
    resolution.confidenceNotes = [
      "optional LLM assist failed, so deterministic analysis remained authoritative",
    ];
    return resolution;
  }
}
