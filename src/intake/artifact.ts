import {
  FORGE_INTAKE_COMMAND,
  FORGE_SCHEMA_VERSION,
  STEP1_BOUNDARY_POLICY,
} from "./constants.js";
import { buildArtifactSections } from "./artifact-sections.js";
import { validateIntakeArtifact } from "./artifact-schema.js";
import { toArtifactRuntimeOptions } from "./options.js";
import { buildSummary, resolveIntakeStatus } from "./success.js";
import type {
  ArtifactSourceInputs,
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeArtifact,
  IntakeExecutionContext,
  IntakeFailureDetails,
  NextStepReadiness,
  ResolvedRuntimeOptions,
} from "./types.js";

export function createIntakeArtifact(params: {
  context: IntakeExecutionContext;
  finishedAt: string;
  sourceInputs: ArtifactSourceInputs | null;
  runtimeOptions: ResolvedRuntimeOptions;
  assembledResult: AssembledIntakeResult;
  boundarySafeResult: BoundarySafeIntakeResult;
  nextStepReadiness: NextStepReadiness;
  failure?: IntakeFailureDetails | null;
}): IntakeArtifact {
  const warnings = params.boundarySafeResult.warnings;
  const ambiguities = params.boundarySafeResult.ambiguities;
  const failure = params.failure ?? null;
  const status = resolveIntakeStatus({
    failure,
    nextStepReadiness: params.nextStepReadiness,
    warnings,
    ambiguities,
    confidenceLevel: params.assembledResult.confidence.level,
  });

  const artifact: IntakeArtifact = {
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: `forge ${FORGE_INTAKE_COMMAND}`,
    stage: STEP1_BOUNDARY_POLICY.stage,
    status,
    input_mode: params.sourceInputs?.input_mode ?? null,
    source_inputs: params.sourceInputs,
    runtime_options: toArtifactRuntimeOptions(params.runtimeOptions),
    purpose: STEP1_BOUNDARY_POLICY.purpose,
    repoRoot: params.context.repoRoot,
    requestedOutputRoot: params.context.paths.requestedOutputRoot,
    outputRoot: params.context.paths.outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot:
        STEP1_BOUNDARY_POLICY.repoReadOnlyOutsideOutputRoot,
      allowedRoot: params.context.paths.outputRoot,
      allowedSideEffects: STEP1_BOUNDARY_POLICY.allowedSideEffects,
      deferredCapabilities: STEP1_BOUNDARY_POLICY.deferredCapabilities,
      disallowedCapabilities: STEP1_BOUNDARY_POLICY.disallowedCapabilities,
    },
    files: {
      artifactPath: params.runtimeOptions.writeArtifact ? params.context.paths.artifactPath : null,
      reportPath: params.runtimeOptions.writeReport ? params.context.paths.reportPath : null,
    },
    startedAt: params.context.startedAt,
    finishedAt: params.finishedAt,
    summary: buildSummary(status, params.nextStepReadiness),
    ...buildArtifactSections({
      assembledResult: params.assembledResult,
      boundarySafeResult: params.boundarySafeResult,
      nextStepReadiness: params.nextStepReadiness,
    }),
    failure,
  };

  return validateIntakeArtifact(artifact);
}
