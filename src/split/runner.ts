import {
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  STEP4_ALLOWED_SIDE_EFFECTS,
  STEP4_BOUNDARY_POLICY,
  STEP4_DETERMINISTIC_FIRST_NOTES,
  STEP4_SPLIT_PURPOSE,
} from "./constants.js";
import {
  buildSplitCommandFailureObject,
  buildSplitCommandResult,
  createSplitArtifact,
  toSplitArtifactJson,
} from "./artifact.js";
import { createSplitDebugWrites, isSplitDebugEnabled } from "./debug.js";
import {
  SplitInputResolutionError,
  resolveSplitFoundationInput,
} from "./input.js";
import { createSplitReport } from "./report.js";
import { validateSplitFoundationResult } from "./schema.js";
import { buildSplitWorkstreams } from "./workstreams.js";
import { extractErrorCode } from "../intake/errors.js";
import { persistIntakeOutputs } from "../intake/persistence.js";
import type {
  LoadedSplitFoundationInput,
  SplitCarryForwardContext,
  SplitCommandOptions,
  SplitCommandResult,
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

async function persistSplitCommandOutputs(params: {
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

function requireOutputPath(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Split output path is missing: ${name}.`);
  }

  return value;
}

export async function runSplitCommand(
  options: SplitCommandOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<SplitCommandResult> {
  try {
    const input = await resolveSplitFoundationInput(options, currentWorkingDirectory);
    const foundation = buildSplitFoundation(input);
    const startedAt = new Date().toISOString();
    const failure = input.paths.usedFallbackRoot
      ? buildSplitCommandFailureObject(
          "OUTPUT_ROOT_FALLBACK",
          input.paths.fallbackReason ??
            "Forge split fell back to the default .forge output root because the requested output root was unsafe.",
          input.paths.fallbackReason ?? undefined,
        )
      : null;
    const finishedAt = new Date().toISOString();
    const workstreamBuild = buildSplitWorkstreams({
      foundation,
    });
    const artifact = createSplitArtifact({
      foundation,
      paths: input.paths,
      startedAt,
      finishedAt,
      failure,
      workstreamBuild,
    });
    const report = createSplitReport(artifact);
    const debugWrites = isSplitDebugEnabled()
      ? createSplitDebugWrites({
          artifact,
          paths: input.paths,
          streamConstraintDetails: workstreamBuild.streamConstraintDetails,
        })
      : null;

    try {
      await persistSplitCommandOutputs({
        artifactPath: requireOutputPath(input.paths.artifactPath, "artifactPath"),
        reportPath: requireOutputPath(input.paths.reportPath, "reportPath"),
        artifact: toSplitArtifactJson(artifact),
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
        summary: "Forge split failed while persisting its split artifacts.",
        failure: buildSplitCommandFailureObject(
          extractErrorCode(error) ?? "SPLIT_PERSISTENCE_FAILED",
          error instanceof Error
            ? error.message
            : "Forge split failed while persisting its split artifacts.",
        ),
      };
    }

    return buildSplitCommandResult({
      artifact,
      paths: input.paths,
    });
  } catch (error) {
    if (error instanceof SplitInputResolutionError) {
      return {
        status: "failed",
        artifact: null,
        artifactPath: null,
        reportPath: null,
        outputRoot: null,
        summary: "Forge split could not load a valid Step 3 verify artifact, so no split outputs were written.",
        failure: buildSplitCommandFailureObject(error.code, error.message),
      };
    }

    return {
      status: "failed",
      artifact: null,
      artifactPath: null,
      reportPath: null,
      outputRoot: null,
      summary: "Forge split could not build a usable split artifact.",
      failure: buildSplitCommandFailureObject(
        "SPLIT_COMMAND_FAILED",
        error instanceof Error
          ? error.message
          : "Forge split could not build a usable split artifact.",
      ),
    };
  }
}
