import type {
  ArtifactRuntimeOptions,
  BlockingIssue,
  IntakeCommandOptions,
  ResolvedRuntimeOptions,
} from "./types.js";

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

export function toArtifactRuntimeOptions(
  runtimeOptions: ResolvedRuntimeOptions,
): ArtifactRuntimeOptions {
  return {
    output_mode: runtimeOptions.outputMode,
    llm_mode: runtimeOptions.llmMode,
    fail_on_low_confidence: runtimeOptions.failOnLowConfidence,
  };
}

export function resolveRuntimeOptions(
  options: IntakeCommandOptions,
): ResolvedRuntimeOptions {
  const blockingIssues: BlockingIssue[] = [];
  const warnings: string[] = [];
  const recommendedUserActions: string[] = [];

  const requestedJsonOnly = options.jsonOnly === true;
  const requestedReportOnly = options.reportOnly === true;
  const requestedLlmAssist = options.llmAssist === true;
  const requestedNoLlm = options.noLlm === true;
  const requestedFailOnLowConfidence = options.failOnLowConfidence === true;

  let outputMode: ResolvedRuntimeOptions["outputMode"] = "default";
  let llmMode: ResolvedRuntimeOptions["llmMode"] = "deterministic";

  if (requestedJsonOnly && requestedReportOnly) {
    blockingIssues.push(
      createBlockingIssue(
        "OUTPUT_MODE_CONFLICT",
        "Forge intake accepts either --json-only or --report-only, but not both in the same run.",
      ),
    );
    recommendedUserActions.push(
      "Choose either --json-only, --report-only, or neither to keep the default dual-output behavior.",
    );
  } else if (requestedJsonOnly) {
    outputMode = "json-only";
  } else if (requestedReportOnly) {
    outputMode = "report-only";
  }

  if (requestedLlmAssist && requestedNoLlm) {
    blockingIssues.push(
      createBlockingIssue(
        "LLM_MODE_CONFLICT",
        "Forge intake accepts either --llm-assist or --no-llm, but not both in the same run.",
      ),
    );
    recommendedUserActions.push(
      "Choose either --llm-assist or --no-llm when setting the intake LLM mode.",
    );
  } else if (requestedLlmAssist) {
    llmMode = "assist";
    warnings.push(
      "LLM assist was requested, but Batch 1.05 still runs in deterministic mode until later LLM integration is implemented.",
    );
    recommendedUserActions.push(
      "Treat --llm-assist as recorded intent only for now; deterministic intake behavior still drives the result.",
    );
  }

  if (requestedFailOnLowConfidence) {
    warnings.push(
      "Low confidence escalation was requested, but Batch 1.05 does not implement confidence-based failure escalation yet.",
    );
    recommendedUserActions.push(
      "Treat --fail-on-low-confidence as recorded intent only until the later confidence batches land.",
    );
  }

  return {
    outputMode,
    writeArtifact: outputMode !== "report-only",
    writeReport: outputMode !== "json-only",
    llmMode,
    failOnLowConfidence: requestedFailOnLowConfidence,
    blockingIssues,
    warnings,
    recommendedUserActions,
  };
}
