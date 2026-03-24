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
import { createPlanArtifact, buildPlanCommandFailure } from "./artifact.js";
import { createPlanDebugWrites, isPlanDebugEnabled } from "./debug.js";
import { buildPlanModel } from "./planner.js";
import { createPlanReport } from "./report.js";
import { validatePlanFoundationResult } from "./schema.js";
import { persistIntakeOutputs } from "../intake/persistence.js";
import { extractErrorCode } from "../intake/errors.js";
import type {
  PlanCarryForwardContext,
  LoadedPlanFoundationInput,
  PlanFoundationCommandResult,
  PlanFoundationOptions,
  PlanFoundationResult,
  PlanCommandOptions,
  PlanCommandResult,
} from "./types.js";

function buildCarryForwardFromPlanningInput(
  input: LoadedPlanFoundationInput,
): PlanCarryForwardContext {
  return {
    taskSpec: input.planningInput.context.taskSpec,
    repoContext: input.planningInput.context.repoContext,
    candidateTargets: input.planningInput.context.candidateTargets,
    riskAnalysis: input.planningInput.context.riskAnalysis,
    initialVerificationTargets: input.planningInput.context.initialVerificationTargets,
    ambiguities: input.planningInput.uncertainty.ambiguities,
    warnings: input.planningInput.uncertainty.warnings,
    confidence: input.planningInput.uncertainty.confidence,
    nextStepReadiness: input.planningInput.uncertainty.nextStepReadiness,
  };
}

export function buildPlanFoundation(
  input: LoadedPlanFoundationInput,
): PlanFoundationResult {
  const carryForward = buildCarryForwardFromPlanningInput(input);

  return validatePlanFoundationResult({
    command: STEP2_BOUNDARY_POLICY.command,
    stage: STEP2_BOUNDARY_POLICY.stage,
    purpose: STEP2_PLAN_PURPOSE,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP2_BOUNDARY_POLICY.authoritativeInputs],
      notes: [...STEP2_DETERMINISTIC_FIRST_NOTES],
    },
    sourceIntake: input.sourceIntake,
    planningInput: input.planningInput,
    carryForward,
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
      status: foundation.planningInput.usability.status === "actionable" ? "ready" : "blocked",
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

async function persistPlanCommandOutputs(params: {
  artifactPath: string;
  reportPath: string;
  artifact: string;
  report: string;
  debugWrites?: Array<{ filePath: string; contents: string }> | null;
}): Promise<void> {
  await persistIntakeOutputs({
    criticalWrites: [
      {
        filePath: params.artifactPath,
        contents: params.artifact,
      },
      {
        filePath: params.reportPath,
        contents: params.report,
      },
    ],
    debugWrites: params.debugWrites ?? undefined,
  });
}

function resolvePlanningReadiness(
  foundation: PlanFoundationResult,
  model: ReturnType<typeof buildPlanModel>,
): {
  planningReadiness: PlanFoundationResult["carryForward"]["nextStepReadiness"];
  summaryOverride?: string;
} {
  if (foundation.planningInput.usability.status === "upstream_blocked") {
    return {
      planningReadiness: foundation.carryForward.nextStepReadiness,
    };
  }

  if (foundation.planningInput.usability.status === "non_actionable") {
    return {
      planningReadiness: {
        ...foundation.carryForward.nextStepReadiness,
        ready: false,
        blocking_issues: foundation.planningInput.usability.blockingItems.map((item) => ({
          code: item.code,
          message: item.message,
        })),
      },
      summaryOverride:
        "Forge plan preserved the persisted Step 1 handoff, but planning is blocked because the handoff is non-actionable for real Step 2 planning.",
    };
  }

  if (model.planItems.length > 0) {
    return {
      planningReadiness: foundation.carryForward.nextStepReadiness,
    };
  }

  return {
    planningReadiness: {
      ...foundation.carryForward.nextStepReadiness,
      ready: false,
      blocking_issues: [
        ...foundation.carryForward.nextStepReadiness.blocking_issues,
        {
          code: "PLAN_INPUT_TOO_WEAK",
          message: "Step 1 output is structurally valid but does not provide enough actionable planning signal for Step 2 to build real plan items.",
        },
      ],
    },
    summaryOverride:
      "Forge plan preserved the persisted Step 1 handoff, but planning is blocked because the handoff is non-actionable for real Step 2 planning.",
  };
}

export async function runPlanCommand(
  options: PlanCommandOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<PlanCommandResult> {
  try {
    const input = await resolvePlanFoundationInput(options, currentWorkingDirectory);
    const foundation = buildPlanFoundation(input);
    const model = buildPlanModel(foundation);
    const { planningReadiness, summaryOverride } = resolvePlanningReadiness(foundation, model);
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();
    const artifact = createPlanArtifact({
      foundation,
      model,
      paths: input.paths,
      startedAt,
      finishedAt,
      planningReadiness,
      summaryOverride,
    });
    const report = createPlanReport(artifact);
    const debugWrites = isPlanDebugEnabled()
      ? createPlanDebugWrites({ artifact, paths: input.paths })
      : null;

    try {
      await persistPlanCommandOutputs({
        artifactPath: input.paths.artifactPath,
        reportPath: input.paths.reportPath,
        artifact: `${JSON.stringify(artifact, null, 2)}\n`,
        report,
        debugWrites,
      });
    } catch (error) {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: input.paths.outputRoot,
        summary: "Forge plan failed while persisting its plan artifacts.",
        failure: buildPlanCommandFailure(
          extractErrorCode(error) ?? "PLAN_PERSISTENCE_FAILED",
          error instanceof Error
            ? error.message
            : "Forge plan failed while persisting its plan artifacts.",
        ),
      };
    }

    return {
      status: artifact.status,
      artifact,
      artifactPath: input.paths.artifactPath,
      reportPath: input.paths.reportPath,
      outputRoot: input.paths.outputRoot,
      summary: artifact.summary,
      failure: artifact.failure,
    };
  } catch (error) {
    if (error instanceof PlanInputResolutionError) {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: null,
        summary: "Forge plan could not load a valid Step 1 intake artifact, so no plan was written.",
        failure: buildPlanCommandFailure(error.code, error.message),
      };
    }

    return {
      status: "failed",
      artifact: null,
      artifactPath: null,
      reportPath: null,
      outputRoot: null,
      summary: "Forge plan could not build a usable planning artifact.",
      failure: buildPlanCommandFailure(
        "PLAN_COMMAND_FAILED",
        error instanceof Error
          ? error.message
          : "Forge plan could not build a usable planning artifact.",
      ),
    };
  }
}
