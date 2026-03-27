import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import { validateVerifyArtifact } from "./schema.js";
import {
  FORGE_VERIFY_FULL_COMMAND,
  STEP3_ALLOWED_SIDE_EFFECTS,
  STEP3_DEFERRED_CAPABILITIES,
  STEP3_DETERMINISTIC_FIRST_NOTES,
  STEP3_DISALLOWED_CAPABILITIES,
  STEP3_VERIFY_PURPOSE,
} from "./constants.js";
import type {
  VerifyArtifact,
  VerifyCommandFailure,
  VerifyCommandResult,
  VerifyConstraint,
  VerifyFinding,
  VerifyFoundationResult,
  VerifyReadinessResolution,
  VerifyStructuralExecutionResult,
  VerifyVerificationCase,
  VerifyVerificationModel,
  VerifyResolvedOutputPaths,
} from "./types.js";
import type { VerifyFormalExecutionResult } from "./formal.js";

function copyIssue(issue: { code: string; message: string }): { code: string; message: string } {
  return {
    code: issue.code,
    message: issue.message,
  };
}

function buildVerifyCommandFailure(
  code: string,
  message: string,
  fallbackReason?: string,
): VerifyCommandFailure {
  return {
    code,
    message,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function selectFindingLane(verificationCase: VerifyVerificationCase): VerifyFinding["lane"] {
  return verificationCase.lanes.includes("formal") ? "formal" : "structural";
}

function sortVerificationCasesForTopLevelOutputs(
  verificationCases: VerifyVerificationCase[],
): VerifyVerificationCase[] {
  return [...verificationCases].sort((left, right) => {
    const leftLane = selectFindingLane(left);
    const rightLane = selectFindingLane(right);

    if (leftLane !== rightLane) {
      return leftLane === "formal" ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildTopLevelFindings(verificationCases: VerifyVerificationCase[]): VerifyFinding[] {
  return sortVerificationCasesForTopLevelOutputs(verificationCases)
    .filter((verificationCase) => verificationCase.lanes.length > 0)
    .map((verificationCase, index) => {
      const lane = selectFindingLane(verificationCase);
      const formalDetails = lane === "formal" ? verificationCase.formalDetails : null;

      return {
        id: `verify-finding-${String(index + 1).padStart(3, "0")}`,
        lane,
        verification_case_id: verificationCase.id,
        verification_target_id: verificationCase.verificationTargetId,
        status: verificationCase.status,
        summary: verificationCase.summary,
        tla_spec_id: formalDetails?.tlaSpecId ?? null,
        tlc_result_id: formalDetails?.tlcResultId ?? null,
        trace: formalDetails?.trace ?? null,
        errors: [...(formalDetails?.errors ?? [])],
      };
    });
}

function buildTopLevelConstraints(verificationCases: VerifyVerificationCase[]): VerifyConstraint[] {
  const constraints: VerifyConstraint[] = [];

  for (const verificationCase of sortVerificationCasesForTopLevelOutputs(verificationCases)) {
    const lane = selectFindingLane(verificationCase);
    for (const summary of dedupeStable(verificationCase.constraints)) {
      constraints.push({
        id: `verify-constraint-${String(constraints.length + 1).padStart(3, "0")}`,
        lane,
        verification_case_id: verificationCase.id,
        verification_target_id: verificationCase.verificationTargetId,
        summary,
      });
    }
  }

  return constraints;
}

function buildVerifySummary(params: {
  readinessSummary: string;
  failure: VerifyCommandFailure | null;
}): string {
  if (params.failure?.code === "OUTPUT_ROOT_FALLBACK") {
    return [
      params.readinessSummary,
      "Forge verify wrote its outputs to the default .forge root because the requested output root was unsafe.",
      "OUTPUT_ROOT_FALLBACK",
    ].join(" ");
  }

  return params.readinessSummary;
}

export function createVerifyArtifact(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
  structuralExecution: VerifyStructuralExecutionResult;
  formalExecution: VerifyFormalExecutionResult;
  readinessResolution: VerifyReadinessResolution;
  failure: VerifyCommandFailure | null;
  paths: VerifyResolvedOutputPaths;
  startedAt: string;
  finishedAt: string;
}): VerifyArtifact {
  const verificationCases = params.formalExecution.cases;
  const findings = buildTopLevelFindings(verificationCases);
  const constraints = buildTopLevelConstraints(verificationCases);

  return validateVerifyArtifact({
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_VERIFY_FULL_COMMAND,
    stage: params.foundation.stage,
    status: params.readinessResolution.status,
    purpose: STEP3_VERIFY_PURPOSE,
    repoRoot: params.foundation.sourcePlan.repoRoot,
    requestedOutputRoot: params.paths.requestedOutputRoot,
    outputRoot: params.paths.outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: params.paths.outputRoot,
      allowedSideEffects: [...STEP3_ALLOWED_SIDE_EFFECTS],
      deferredCapabilities: [...STEP3_DEFERRED_CAPABILITIES],
      disallowedCapabilities: [...STEP3_DISALLOWED_CAPABILITIES],
    },
    files: {
      artifactPath: params.paths.verifyArtifactPath,
      reportPath: params.paths.verifyReportPath,
      debugArtifactPath: params.paths.debugArtifactPath,
      debugVerificationCasesPath: params.paths.debugVerificationCasesPath,
      debugStructuralFindingsPath: params.paths.debugStructuralFindingsPath,
      debugStateModelsPath: params.paths.debugStateModelsPath,
      debugTlaSpecsPath: params.paths.debugTlaSpecsPath,
      debugTlcResultsPath: params.paths.debugTlcResultsPath,
    },
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    summary: buildVerifySummary({
      readinessSummary: params.readinessResolution.verificationReadiness.summary,
      failure: params.failure,
    }),
    boundaryNotes: [...STEP3_DETERMINISTIC_FIRST_NOTES],
    source_plan: params.foundation.sourcePlan,
    verification_target_contract: params.foundation.targetContract,
    formal_lane_contract: params.foundation.formalLaneContract,
    verification_targets: params.model.targets,
    verification_cases: verificationCases,
    structural_verification: params.structuralExecution.structuralVerification,
    formal_verification: params.formalExecution.formalVerification,
    findings,
    constraints,
    carry_forward: params.foundation.carryForward.carryForward,
    verification_diagnostics: {
      usability_status: params.readinessResolution.verificationDiagnostics.usability_status,
      warning_items: params.readinessResolution.verificationDiagnostics.warning_items.map(copyIssue),
      blocking_items: params.readinessResolution.verificationDiagnostics.blocking_items.map(copyIssue),
      partial_output: params.readinessResolution.verificationDiagnostics.partial_output
        ? buildVerifyCommandFailure(
            params.readinessResolution.verificationDiagnostics.partial_output.code,
            params.readinessResolution.verificationDiagnostics.partial_output.message,
            params.readinessResolution.verificationDiagnostics.partial_output.fallbackReason,
          )
        : null,
    },
    verification_readiness: {
      ready: params.readinessResolution.verificationReadiness.ready,
      status: params.readinessResolution.verificationReadiness.status,
      summary: params.readinessResolution.verificationReadiness.summary,
      warning_items: params.readinessResolution.verificationReadiness.warning_items.map(copyIssue),
      blocking_issues: params.readinessResolution.verificationReadiness.blocking_issues.map(copyIssue),
      partial_output: params.readinessResolution.verificationReadiness.partial_output
        ? buildVerifyCommandFailure(
            params.readinessResolution.verificationReadiness.partial_output.code,
            params.readinessResolution.verificationReadiness.partial_output.message,
            params.readinessResolution.verificationReadiness.partial_output.fallbackReason,
          )
        : null,
      constraining_concern_ids: [...params.readinessResolution.verificationReadiness.constraining_concern_ids],
      recommended_user_actions: [...params.readinessResolution.verificationReadiness.recommended_user_actions],
    },
    failure: params.failure,
  });
}

export function buildVerifyCommandFailureObject(
  code: string,
  message: string,
  fallbackReason?: string,
): VerifyCommandFailure {
  return buildVerifyCommandFailure(code, message, fallbackReason);
}

export function buildVerifyCommandResult(params: {
  artifact: VerifyArtifact;
  paths: VerifyResolvedOutputPaths;
}): VerifyCommandResult {
  return {
    status: params.artifact.status,
    artifact: params.artifact,
    artifactPath: params.paths.verifyArtifactPath,
    reportPath: params.paths.verifyReportPath,
    outputRoot: params.paths.outputRoot,
    summary: params.artifact.summary,
    failure: params.artifact.failure,
  };
}

export function toVerifyArtifactJson(artifact: VerifyArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
