import {
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  STEP4_BOUNDARY_POLICY,
  STEP4_DETERMINISTIC_FIRST_NOTES,
  STEP4_SPLIT_PURPOSE,
} from "./constants.js";
import {
  SplitInputResolutionError,
  resolveSplitFoundationInput,
} from "./input.js";
import { validateSplitFoundationResult } from "./schema.js";
import type {
  LoadedSplitFoundationInput,
  SplitCarryForwardContext,
  SplitFoundationCommandResult,
  SplitFoundationFailure,
  SplitFoundationOptions,
  SplitFoundationResult,
} from "./types.js";

function buildCarryForwardFromSplitInput(
  input: LoadedSplitFoundationInput,
): SplitCarryForwardContext {
  return {
    sourceIntake: input.splitInput.uncertainty.sourceIntake,
    planCarryForward: input.splitInput.uncertainty.planCarryForward,
    planningDiagnostics: input.splitInput.uncertainty.planningDiagnostics,
    planningReadiness: input.splitInput.uncertainty.planningReadiness,
    verifyCarryForward: input.splitInput.uncertainty.verifyCarryForward,
    verificationDiagnostics: input.splitInput.uncertainty.verificationDiagnostics,
    verificationReadiness: input.splitInput.uncertainty.verificationReadiness,
  };
}

function toFailure(code: string, message: string): SplitFoundationFailure {
  return { code, message };
}

export function buildSplitFoundation(
  input: LoadedSplitFoundationInput,
): SplitFoundationResult {
  return validateSplitFoundationResult({
    command: STEP4_BOUNDARY_POLICY.command,
    stage: STEP4_BOUNDARY_POLICY.stage,
    purpose: STEP4_SPLIT_PURPOSE,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP4_BOUNDARY_POLICY.authoritativeInputs],
      notes: [...STEP4_DETERMINISTIC_FIRST_NOTES],
    },
    sourceVerify: input.sourceVerify,
    sourcePlan: input.sourcePlan,
    splitInput: input.splitInput,
    carryForward: buildCarryForwardFromSplitInput(input),
    boundaryPolicy: STEP4_BOUNDARY_POLICY,
    workstreamContract: {
      requiredFields: SPLIT_WORKSTREAM_REQUIRED_FIELDS,
      categories: SPLIT_STREAM_CATEGORIES,
      constraintSources: SPLIT_CONSTRAINT_SOURCES,
    },
  });
}

export async function runSplitFoundation(
  options: SplitFoundationOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<SplitFoundationCommandResult> {
  try {
    const input = await resolveSplitFoundationInput(options, currentWorkingDirectory);
    const foundation = buildSplitFoundation(input);

    return {
      status: foundation.splitInput.usability.status === "actionable" ? "ready" : "blocked",
      foundation,
      failure: null,
    };
  } catch (error) {
    if (error instanceof SplitInputResolutionError) {
      return {
        status: "failed",
        foundation: null,
        failure: toFailure(error.code, error.message),
      };
    }

    return {
      status: "failed",
      foundation: null,
      failure: toFailure(
        "SPLIT_FOUNDATION_FAILED",
        error instanceof Error
          ? `Forge split could not build its Step 4 foundation: ${error.message}`
          : "Forge split could not build its Step 4 foundation.",
      ),
    };
  }
}
