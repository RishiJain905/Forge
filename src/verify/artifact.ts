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
  VerifyFoundationResult,
  VerifyVerificationModel,
  VerifyResolvedOutputPaths,
  VerifyVerificationDiagnostics,
  VerifyVerificationReadiness,
} from "./types.js";
import { VERIFY_INPUT_TOO_WEAK } from "./constants.js";

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

function buildVerificationDiagnostics(params: {
  foundation: VerifyFoundationResult;
  failure: VerifyCommandFailure | null;
}): VerifyVerificationDiagnostics {
  return {
    usability_status: params.foundation.verificationInput.usability.status,
    warning_items: params.foundation.verificationInput.usability.warningItems.map(copyIssue),
    blocking_items: params.foundation.verificationInput.usability.blockingItems.map(copyIssue),
    partial_output: params.failure,
  };
}

function buildVerificationReadiness(params: {
  foundation: VerifyFoundationResult;
  failure: VerifyCommandFailure | null;
}): VerifyVerificationReadiness {
  const warningItems = params.foundation.verificationInput.usability.warningItems.map(copyIssue);
  const blockingIssues = params.foundation.verificationInput.usability.blockingItems.map(copyIssue);
  const partialOutput = params.failure;
  const ready = blockingIssues.length === 0;
  const hasWarnings =
    warningItems.length > 0 ||
    params.foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids.length > 0 ||
    partialOutput !== null;
  const hasWeakInputBlocker = blockingIssues.some((issue) => issue.code === VERIFY_INPUT_TOO_WEAK);

  return {
    ready,
    status: ready
      ? hasWarnings
        ? "ready_with_warnings"
        : "ready"
      : "blocked",
    summary: hasWeakInputBlocker
      ? "Forge verify is blocked because Step 2 did not produce enough risky verification signal to build Part 3 targets and cases."
      : params.foundation.verificationInput.uncertainty.planningReadiness.summary,
    warning_items: warningItems,
    blocking_issues: blockingIssues,
    partial_output: partialOutput,
    constraining_concern_ids: [...params.foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids],
    recommended_user_actions: hasWeakInputBlocker
      ? [
          "Strengthen the Step 2 plan with clearer verification-relevant risk, conflict, or ordering signals before rerunning forge verify.",
        ]
      : [...params.foundation.verificationInput.uncertainty.planningReadiness.recommended_user_actions],
  };
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
  paths: VerifyResolvedOutputPaths;
  startedAt: string;
  finishedAt: string;
}): VerifyArtifact {
  const failure = params.paths.usedFallbackRoot
    ? buildVerifyCommandFailure(
        "OUTPUT_ROOT_FALLBACK",
        params.paths.fallbackReason ??
          "Forge verify fell back to the default .forge output root because the requested output root was unsafe.",
        params.paths.fallbackReason ?? undefined,
      )
    : null;
  const verificationDiagnostics = buildVerificationDiagnostics({
    foundation: params.foundation,
    failure,
  });
  const verificationReadiness = buildVerificationReadiness({
    foundation: params.foundation,
    failure,
  });
  const status = failure
    ? "failed"
    : verificationReadiness.ready
      ? "ready"
      : "blocked";

  return validateVerifyArtifact({
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_VERIFY_FULL_COMMAND,
    stage: params.foundation.stage,
    status,
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
    },
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    summary: buildVerifySummary({
      readinessSummary: verificationReadiness.summary,
      failure,
    }),
    boundaryNotes: [...STEP3_DETERMINISTIC_FIRST_NOTES],
    source_plan: params.foundation.sourcePlan,
    verification_target_contract: params.foundation.targetContract,
    formal_lane_contract: params.foundation.formalLaneContract,
    verification_targets: params.model.targets,
    verification_cases: params.model.cases,
    structural_verification: {
      status: "not_run",
      summary: params.model.structuralCaseCount > 0
        ? `${params.model.structuralCaseCount} structural verification case(s) were selected in Part 3; execution has not run yet.`
        : "No structural verification cases were selected in Part 3.",
      findings: [],
      constraints: [],
    },
    formal_verification: {
      status: "not_run",
      summary: params.model.formalCaseCount > 0
        ? `${params.model.formalCaseCount} formal verification case(s) were selected in Part 3; execution has not run yet.`
        : "No formal verification cases were selected in Part 3.",
      state_models: [],
      tla_specs: [],
      tlc_results: [],
      findings: [],
      constraints: [],
    },
    findings: [],
    constraints: [],
    carry_forward: params.foundation.carryForward.carryForward,
    verification_diagnostics: verificationDiagnostics,
    verification_readiness: verificationReadiness,
    failure,
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
