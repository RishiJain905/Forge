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
import { buildPlanModel } from "./planner.js";
import { createPlanReport } from "./report.js";
import { validatePlanFoundationResult } from "./schema.js";
import { persistIntakeOutputs } from "../intake/persistence.js";
import { extractErrorCode } from "../intake/errors.js";
import type {
  LoadedPlanFoundationInput,
  PlanFoundationCommandResult,
  PlanFoundationOptions,
  PlanFoundationResult,
  PlanCommandOptions,
  PlanCommandResult,
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
      artifactPath: input.intakeArtifactPath,
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

function buildBlockedPlanFailure(status: PlanCommandResult["status"]) {
  if (status === "blocked") {
    return buildPlanCommandFailure(
      "PLANNING_NOT_READY",
      "Forge plan preserved the persisted Step 1 handoff, but planning remains blocked.",
    );
  }

  return null;
}

async function persistPlanCommandOutputs(params: {
  artifactPath: string;
  reportPath: string;
  artifact: string;
  report: string;
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
  });
}

export async function runPlanCommand(
  options: PlanCommandOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<PlanCommandResult> {
  try {
    const input = await resolvePlanFoundationInput(options, currentWorkingDirectory);
    const foundation = buildPlanFoundation(input);
    const model = buildPlanModel(foundation);
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();
    const artifact = createPlanArtifact({
      foundation,
      model,
      paths: input.paths,
      startedAt,
      finishedAt,
    });
    const report = createPlanReport(artifact);

    try {
      await persistPlanCommandOutputs({
        artifactPath: input.paths.artifactPath,
        reportPath: input.paths.reportPath,
        artifact: `${JSON.stringify(artifact, null, 2)}\n`,
        report,
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

    const failure = buildBlockedPlanFailure(artifact.status);

    return {
      status: artifact.status,
      artifact,
      artifactPath: input.paths.artifactPath,
      reportPath: input.paths.reportPath,
      outputRoot: input.paths.outputRoot,
      summary: artifact.summary,
      failure,
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
