import { VERIFY_INPUT_TOO_WEAK, VERIFY_TLC_JAR_PATH_ENV_VAR } from "./constants.js";
import type {
  VerifyCommandFailure,
  VerifyFoundationResult,
  VerifyInputIssue,
  VerifyReadinessResolution,
  VerifyStructuralExecutionResult,
  VerifyVerificationDiagnostics,
  VerifyVerificationReadiness,
  VerifyVerificationModel,
} from "./types.js";
import type { VerifyFormalExecutionResult } from "./formal.js";

function cloneIssue(issue: VerifyInputIssue): VerifyInputIssue {
  return {
    code: issue.code,
    message: issue.message,
  };
}

function dedupeIssues(items: VerifyInputIssue[]): VerifyInputIssue[] {
  const seen = new Set<string>();
  const result: VerifyInputIssue[] = [];

  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function dedupeStrings(values: string[]): string[] {
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

function buildPartialOutput(failure: VerifyCommandFailure | null): VerifyCommandFailure | null {
  if (!failure) {
    return null;
  }

  return {
    code: failure.code,
    message: failure.message,
    ...(failure.fallbackReason ? { fallbackReason: failure.fallbackReason } : {}),
  };
}

function buildExecutionIssues(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
  structuralExecution: VerifyStructuralExecutionResult;
  formalExecution: VerifyFormalExecutionResult;
}): { warningItems: VerifyInputIssue[]; blockingItems: VerifyInputIssue[] } {
  const warningItems: VerifyInputIssue[] = [];
  const blockingItems: VerifyInputIssue[] = [];
  const formalCaseCount = params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("formal")).length;
  const structuralCaseCount = params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("structural")).length;

  if (structuralCaseCount > 0 && formalCaseCount === 0) {
    warningItems.push({
      code: "STRUCTURAL_ONLY_VERIFY_COVERAGE",
      message: "Only structural verification ran for this Step 3 output; no formal cases were justified for the selected targets.",
    });
  }

  switch (params.structuralExecution.structuralVerification.status) {
    case "failed":
      blockingItems.push({
        code: "STRUCTURAL_VERIFY_FAILED",
        message: params.structuralExecution.structuralVerification.summary,
      });
      break;
    case "errored":
      blockingItems.push({
        code: "STRUCTURAL_VERIFY_ERRORED",
        message: params.structuralExecution.structuralVerification.summary,
      });
      break;
    default:
      break;
  }

  switch (params.formalExecution.formalVerification.status) {
    case "not_run":
      if (formalCaseCount > 0) {
        warningItems.push({
          code: "FORMAL_TLC_NOT_RUN",
          message: `Formal verification cases were modeled, but TLC did not run. Configure ${VERIFY_TLC_JAR_PATH_ENV_VAR} before treating them as validated.`,
        });
      }
      break;
    case "inconclusive":
      warningItems.push({
        code: "FORMAL_TLC_INCONCLUSIVE",
        message: "Formal verification ran, but TLC returned an inconclusive verdict and the result remains unresolved.",
      });
      break;
    case "failed":
      blockingItems.push({
        code: "FORMAL_TLC_FAILED",
        message: params.formalExecution.formalVerification.summary,
      });
      break;
    case "errored":
      blockingItems.push({
        code: "FORMAL_TLC_ERRORED",
        message: params.formalExecution.formalVerification.summary,
      });
      break;
    case "invalid_spec":
      blockingItems.push({
        code: "FORMAL_TLC_INVALID_SPEC",
        message: params.formalExecution.formalVerification.summary,
      });
      break;
    default:
      break;
  }

  if (
    params.foundation.verificationInput.usability.status === "actionable"
    && formalCaseCount > 0
    && params.foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids.length > 0
  ) {
    warningItems.push({
      code: "CARRY_FORWARD_VERIFY_CONSTRAINTS",
      message: "Step 2 carried constraining concern ids into verification; later steps must respect them even when verification is ready.",
    });
  }

  return {
    warningItems: dedupeIssues(warningItems),
    blockingItems: dedupeIssues(blockingItems),
  };
}

function buildSummary(params: {
  model: VerifyVerificationModel;
  blockingItems: VerifyInputIssue[];
  warningItems: VerifyInputIssue[];
  partialOutput: VerifyCommandFailure | null;
  structuralExecution: VerifyStructuralExecutionResult;
  formalExecution: VerifyFormalExecutionResult;
}): string {
  const formalCaseCount = params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("formal")).length;
  const structuralCaseCount = params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("structural")).length;
  const laneCoverageSummary = structuralCaseCount > 0
    ? "structural checks ran"
    : formalCaseCount > 0
      ? "formal checks ran"
      : "no verification cases were modeled";

  if (params.blockingItems.some((issue) => issue.code === VERIFY_INPUT_TOO_WEAK)) {
    return "`forge split` is blocked because Step 2 did not produce enough risky verification signal to build meaningful Step 3 verification work.";
  }
  if (params.blockingItems.some((issue) => issue.code === "STRUCTURAL_VERIFY_FAILED")) {
    return "`forge split` is blocked because structural verification found unresolved plan contradictions or missing safeguards.";
  }
  if (params.blockingItems.some((issue) => issue.code === "FORMAL_TLC_FAILED")) {
    return "`forge split` is blocked because a formal verification case failed TLC.";
  }
  if (params.blockingItems.some((issue) => issue.code === "FORMAL_TLC_INVALID_SPEC")) {
    return "`forge split` is blocked because a formal verification case could not produce a valid runnable TLA+ spec.";
  }
  if (params.blockingItems.some((issue) => issue.code === "FORMAL_TLC_ERRORED")) {
    return "`forge split` is blocked because verification errored before risky formal cases were fully validated.";
  }
  if (params.blockingItems.some((issue) => issue.code === "OUTPUT_ROOT_FALLBACK")) {
    return "`forge split` is blocked because forge verify had to fall back to the repo-safe .forge output root after the requested output root was rejected.";
  }
  if (structuralCaseCount > 0 && formalCaseCount === 0) {
    return [
      "`forge split` can proceed with caution:",
      "only structural checks ran,",
      "no formal cases were modeled for this plan,",
      "TLC did not validate any verification case,",
      `and ${params.structuralExecution.structuralVerification.constraints.length} structural constraint(s) still need to be carried forward.`,
    ].join(" ");
  }
  if (formalCaseCount > 0 && params.formalExecution.formalVerification.status === "inconclusive") {
    return [
      "`forge split` can proceed with caution:",
      `${laneCoverageSummary},`,
      `formal cases were modeled for ${formalCaseCount} target(s),`,
      "TLC returned an inconclusive verdict,",
      "so the unresolved formal uncertainty must be carried forward.",
    ].join(" ");
  }
  if (formalCaseCount > 0 && params.formalExecution.formalVerification.status === "not_run") {
    return [
      "`forge split` can proceed with caution:",
      `${laneCoverageSummary},`,
      `formal cases were modeled for ${formalCaseCount} target(s),`,
      structuralCaseCount > 0
        ? "but TLC was not run,"
        : "no structural cases were modeled for this plan, and TLC was not run,",
      "so the formal lane has not validated those cases yet.",
    ].join(" ");
  }
  if (params.partialOutput !== null && params.warningItems.length === 0) {
    return "`forge split` can proceed, but a partial output fallback remains visible.";
  }
  if (params.warningItems.length > 0) {
    return [
      "`forge split` can proceed,",
      `${laneCoverageSummary},`,
      formalCaseCount > 0
        ? `formal cases were modeled for ${formalCaseCount} target(s),`
        : "no formal cases were modeled,",
      params.formalExecution.formalVerification.status === "passed"
        ? "and TLC validated the modeled formal cases,"
        : "and TLC did not fully validate every modeled formal case,",
      "but carried-forward warnings still constrain this plan.",
    ].join(" ");
  }

  return [
    "`forge split` can proceed.",
    `${laneCoverageSummary.charAt(0).toUpperCase()}${laneCoverageSummary.slice(1)},`,
    formalCaseCount > 0
      ? `formal cases were modeled for ${formalCaseCount} target(s),`
      : "no formal cases were modeled,",
    params.formalExecution.formalVerification.status === "passed"
      ? "and TLC validated the modeled formal cases."
      : "and no additional formal validation was required.",
  ].join(" ");
}

function buildRecommendedUserActions(params: {
  foundation: VerifyFoundationResult;
  blockingItems: VerifyInputIssue[];
  model: VerifyVerificationModel;
  structuralExecution: VerifyStructuralExecutionResult;
  formalExecution: VerifyFormalExecutionResult;
}): string[] {
  const actions = [...params.foundation.verificationInput.uncertainty.planningReadiness.recommended_user_actions];
  const formalCaseCount = params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("formal")).length;

  if (params.blockingItems.some((issue) => issue.code === VERIFY_INPUT_TOO_WEAK)) {
    actions.push("Strengthen the Step 2 plan with clearer verification-relevant risk, conflict, or ordering signals before attempting forge split again.");
  }
  if (params.structuralExecution.structuralVerification.status === "failed") {
    actions.push("Resolve the structural verification findings before attempting forge split or later workflow steps.");
  }
  if (params.formalExecution.formalVerification.status === "not_run" && formalCaseCount > 0) {
    actions.push(`Configure ${VERIFY_TLC_JAR_PATH_ENV_VAR} and rerun forge verify before attempting forge split.`);
  }
  if (params.formalExecution.formalVerification.status === "failed") {
    actions.push("Review the TLC counterexample and update the plan before attempting forge split or later workflow steps.");
  }
  if (params.formalExecution.formalVerification.status === "inconclusive") {
    actions.push("Review the partial TLC evidence and tighten the formal model or input before relying on forge split.");
  }
  if (params.formalExecution.formalVerification.status === "invalid_spec") {
    actions.push("Repair the generated TLA+ spec or config and rerun forge verify before attempting forge split.");
  }
  if (params.formalExecution.formalVerification.status === "errored") {
    actions.push("Fix the TLC execution problem and rerun forge verify before attempting forge split.");
  }
  if (params.blockingItems.some((issue) => issue.code === "OUTPUT_ROOT_FALLBACK")) {
    actions.push("Rerun forge verify with a repo-safe output root before attempting forge split.");
  }
  if (params.model.cases.filter((verificationCase) => verificationCase.lanes.includes("structural")).length > 0 && formalCaseCount === 0) {
    actions.push("Carry the structural verification constraints forward into later steps because this run only executed structural checks and did not produce formal validation for forge split.");
  }

  return dedupeStrings(actions);
}

export function resolveVerifyReadiness(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
  structuralExecution: VerifyStructuralExecutionResult;
  formalExecution: VerifyFormalExecutionResult;
  failure: VerifyCommandFailure | null;
}): VerifyReadinessResolution {
  const warningItems = params.foundation.verificationInput.usability.warningItems.map(cloneIssue);
  const blockingItems = params.foundation.verificationInput.usability.blockingItems.map(cloneIssue);
  const failureBlockingItems = params.failure?.code === "OUTPUT_ROOT_FALLBACK"
    ? [
        {
          code: params.failure.code,
          message: params.failure.message,
        },
      ]
    : [];
  const executionIssues = buildExecutionIssues({
    foundation: params.foundation,
    model: params.model,
    structuralExecution: params.structuralExecution,
    formalExecution: params.formalExecution,
  });
  const mergedWarningItems = dedupeIssues([...warningItems, ...executionIssues.warningItems]);
  const mergedBlockingItems = dedupeIssues([...blockingItems, ...executionIssues.blockingItems, ...failureBlockingItems]);
  const partialOutput = buildPartialOutput(params.failure);
  const constrainingConcernIds = [...params.foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids];
  const ready = mergedBlockingItems.length === 0;
  const hasWarnings =
    mergedWarningItems.length > 0 ||
    constrainingConcernIds.length > 0 ||
    partialOutput !== null;

  const verificationDiagnostics: VerifyVerificationDiagnostics = {
    usability_status: params.foundation.verificationInput.usability.status,
    warning_items: mergedWarningItems,
    blocking_items: mergedBlockingItems,
    partial_output: partialOutput,
  };
  const verificationReadiness: VerifyVerificationReadiness = {
    ready,
    status: ready
      ? hasWarnings
        ? "ready_with_warnings"
        : "ready"
      : "blocked",
    summary: buildSummary({
      model: params.model,
      blockingItems: mergedBlockingItems,
      warningItems: mergedWarningItems,
      partialOutput,
      structuralExecution: params.structuralExecution,
      formalExecution: params.formalExecution,
    }),
    warning_items: mergedWarningItems,
    blocking_issues: mergedBlockingItems,
    partial_output: partialOutput,
    constraining_concern_ids: constrainingConcernIds,
    recommended_user_actions: buildRecommendedUserActions({
      foundation: params.foundation,
      blockingItems: mergedBlockingItems,
      model: params.model,
      structuralExecution: params.structuralExecution,
      formalExecution: params.formalExecution,
    }),
  };

  return {
    status: params.failure
      ? "failed"
      : verificationReadiness.ready
        ? "ready"
        : "blocked",
    verificationDiagnostics,
    verificationReadiness,
  };
}
