import {
  STEP3_BOUNDARY_POLICY,
  STEP3_DETERMINISTIC_FIRST_NOTES,
  STEP3_VERIFY_PURPOSE,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_STATE_MODEL_REQUIRED_FIELDS,
  VERIFY_STRUCTURAL_FOCUS_AREAS,
  VERIFY_SUPPORTED_LANES,
  VERIFY_TARGET_REQUIRED_FIELDS,
  VERIFY_TARGET_RISK_SOURCES,
  VERIFY_TLC_STATUSES,
} from "./constants.js";
import { VerifyInputResolutionError, resolveVerifyFoundationInput } from "./input.js";
import { validateVerifyFoundationResult } from "./schema.js";
import type {
  LoadedVerifyFoundationInput,
  VerifyCarryForwardContext,
  VerifyFoundationCommandResult,
  VerifyFoundationOptions,
  VerifyFoundationResult,
} from "./types.js";

function buildCarryForwardFromVerificationInput(
  input: LoadedVerifyFoundationInput,
): VerifyCarryForwardContext {
  return {
    sourceIntake: input.sourceIntake,
    carryForward: input.verificationInput.uncertainty.carryForward,
    planningDiagnostics: input.verificationInput.uncertainty.planningDiagnostics,
    planningReadiness: input.verificationInput.uncertainty.planningReadiness,
  };
}

function toFailure(code: string, message: string): VerifyFoundationCommandResult["failure"] {
  return { code, message };
}

export function buildVerifyFoundation(
  input: LoadedVerifyFoundationInput,
): VerifyFoundationResult {
  const carryForward = buildCarryForwardFromVerificationInput(input);

  return validateVerifyFoundationResult({
    command: STEP3_BOUNDARY_POLICY.command,
    stage: STEP3_BOUNDARY_POLICY.stage,
    purpose: STEP3_VERIFY_PURPOSE,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP3_BOUNDARY_POLICY.authoritativeInputs],
      notes: [...STEP3_DETERMINISTIC_FIRST_NOTES],
    },
    sourcePlan: input.sourcePlan,
    verificationInput: input.verificationInput,
    carryForward,
    boundaryPolicy: STEP3_BOUNDARY_POLICY,
    targetContract: {
      requiredFields: VERIFY_TARGET_REQUIRED_FIELDS,
      riskSources: VERIFY_TARGET_RISK_SOURCES,
      structuralFocusAreas: VERIFY_STRUCTURAL_FOCUS_AREAS,
      formalFocusAreas: VERIFY_FORMAL_FOCUS_AREAS,
      supportedLanes: VERIFY_SUPPORTED_LANES,
    },
    formalLaneContract: {
      tooling: VERIFY_FORMAL_TOOLING,
      entryCriteria: VERIFY_FORMAL_ENTRY_CRITERIA,
      stateModelRequiredFields: VERIFY_STATE_MODEL_REQUIRED_FIELDS,
      tlcStatuses: VERIFY_TLC_STATUSES,
    },
  });
}

export async function runVerifyFoundation(
  options: VerifyFoundationOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<VerifyFoundationCommandResult> {
  try {
    const input = await resolveVerifyFoundationInput(options, currentWorkingDirectory);
    const foundation = buildVerifyFoundation(input);

    return {
      status: foundation.verificationInput.usability.status === "actionable" ? "ready" : "blocked",
      foundation,
      failure: null,
    };
  } catch (error) {
    if (error instanceof VerifyInputResolutionError) {
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
        "VERIFY_FOUNDATION_FAILED",
        error instanceof Error
          ? `Forge verify could not build its Step 3 foundation: ${error.message}`
          : "Forge verify could not build its Step 3 foundation.",
      ),
    };
  }
}
