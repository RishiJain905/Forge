import {
  PLAN_DEPENDENCY_TYPES,
  PLAN_ITEM_CATEGORIES,
  PLAN_ITEM_REQUIRED_FIELDS,
  PLAN_PARALLELIZATION_SIGNALS,
  PLAN_RISK_LEVELS,
  PLAN_TEST_OBLIGATION_CATEGORIES,
  PLAN_VERIFICATION_TARGET_CATEGORIES,
  STEP2_BOUNDARY_POLICY,
  STEP2_DETERMINISTIC_FIRST_NOTES,
  STEP2_PLAN_PURPOSE,
} from "./constants.js";
import {
  PlanInputResolutionError,
  resolvePlanFoundationInput,
} from "./input.js";
import { validatePlanFoundationResult } from "./schema.js";
import type {
  LoadedPlanFoundationInput,
  PlanFoundationCommandResult,
  PlanFoundationOptions,
  PlanFoundationResult,
} from "./types.js";

export function buildPlanFoundation(
  input: LoadedPlanFoundationInput,
): PlanFoundationResult {
  const artifact = input.artifact;

  return validatePlanFoundationResult({
    command: STEP2_BOUNDARY_POLICY.command,
    stage: STEP2_BOUNDARY_POLICY.stage,
    purpose: STEP2_PLAN_PURPOSE,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP2_BOUNDARY_POLICY.authoritativeInputs],
      notes: [...STEP2_DETERMINISTIC_FIRST_NOTES],
    },
    sourceIntake: {
      artifactPath: input.artifactPath,
      command: artifact.command,
      repoRoot: artifact.repoRoot,
      status: artifact.status,
      summary: artifact.summary,
      readyForPlanning: artifact.next_step_readiness.ready,
    },
    carryForward: {
      taskSpec: artifact.task_spec,
      repoContext: artifact.repo_context,
      candidateTargets: artifact.candidate_targets,
      riskAnalysis: artifact.risk_analysis,
      initialVerificationTargets: artifact.initial_verification_targets,
      ambiguities: artifact.ambiguities,
      warnings: artifact.warnings,
      confidence: artifact.confidence,
      nextStepReadiness: artifact.next_step_readiness,
    },
    boundaryPolicy: STEP2_BOUNDARY_POLICY,
    planItemContract: {
      requiredFields: PLAN_ITEM_REQUIRED_FIELDS,
      categories: PLAN_ITEM_CATEGORIES,
      dependencyTypes: PLAN_DEPENDENCY_TYPES,
      riskLevels: PLAN_RISK_LEVELS,
      testObligationCategories: PLAN_TEST_OBLIGATION_CATEGORIES,
      verificationCategories: PLAN_VERIFICATION_TARGET_CATEGORIES,
      parallelizationSignals: PLAN_PARALLELIZATION_SIGNALS,
    },
  });
}

function toFailure(code: string, message: string): PlanFoundationCommandResult["failure"] {
  return { code, message };
}

export async function runPlanFoundation(
  options: PlanFoundationOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<PlanFoundationCommandResult> {
  try {
    const input = await resolvePlanFoundationInput(options, currentWorkingDirectory);
    const foundation = buildPlanFoundation(input);

    return {
      status: foundation.sourceIntake.readyForPlanning ? "ready" : "blocked",
      foundation,
      failure: null,
    };
  } catch (error) {
    if (error instanceof PlanInputResolutionError) {
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
        "PLAN_FOUNDATION_FAILED",
        error instanceof Error
          ? `Forge plan could not build its Step 2 foundation: ${error.message}`
          : "Forge plan could not build its Step 2 foundation.",
      ),
    };
  }
}
