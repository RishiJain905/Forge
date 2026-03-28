import type {
  VerifyFoundationResult,
  VerifyStructuralExecutionResult,
  VerifyVerificationCase,
  VerifyVerificationModel,
  VerifyVerificationTarget,
} from "./types.js";

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

type StructuralContext = {
  dependencyReasons: string[];
  obligationReasons: string[];
  parallelizationSignals: Array<{ signal: string; reason: string }>;
  conflictZoneReasons: string[];
  concernMessages: string[];
  concernEffects: Set<string>;
};

function buildStructuralContext(
  foundation: VerifyFoundationResult,
  verificationCase: VerifyVerificationCase,
): StructuralContext {
  const planItemIds = new Set(verificationCase.sourcePlanItemIds);

  return {
    dependencyReasons: foundation.verificationInput.context.dependencyGraph
      .filter((entry) => planItemIds.has(entry.planItemId) || planItemIds.has(entry.dependsOnPlanItemId))
      .map((entry) => entry.reason),
    obligationReasons: foundation.verificationInput.context.testObligations
      .filter((entry) => planItemIds.has(entry.planItemId))
      .map((entry) => entry.reason),
    parallelizationSignals: foundation.verificationInput.context.parallelizationSignals
      .filter((entry) => planItemIds.has(entry.planItemId))
      .map((entry) => ({ signal: entry.signal, reason: entry.reason })),
    conflictZoneReasons: foundation.verificationInput.context.conflictZones
      .filter((zone) => zone.planItemIds.some((planItemId) => planItemIds.has(planItemId)))
      .map((zone) => `${zone.id}: ${zone.reason}`),
    concernMessages: foundation.carryForward.carryForward.concerns
      .filter((concern) => concern.planItemIds.some((planItemId) => planItemIds.has(planItemId)))
      .map((concern) => concern.message),
    concernEffects: new Set(
      foundation.carryForward.carryForward.concerns
        .filter((concern) => concern.planItemIds.some((planItemId) => planItemIds.has(planItemId)))
        .flatMap((concern) => concern.effects),
    ),
  };
}

function hasSignal(
  context: StructuralContext,
  wantedSignals: readonly string[],
): boolean {
  return context.parallelizationSignals.some((entry) => wantedSignals.includes(entry.signal));
}

function hasSafeParallel(context: StructuralContext): boolean {
  return hasSignal(context, ["safe_parallel"]);
}

function hasOrderingSafeguard(context: StructuralContext): boolean {
  return context.dependencyReasons.length > 0
    || hasSignal(context, ["serial_only", "parallel_after_dependency", "protected_merge_order"])
    || context.concernEffects.has("dependency_caution")
    || context.concernEffects.has("planning_readiness");
}

function orderingConcernSurvives(context: StructuralContext): boolean {
  return context.concernEffects.has("dependency_caution") || context.concernEffects.has("planning_readiness");
}

function hasOverlapSafeguard(context: StructuralContext): boolean {
  return context.conflictZoneReasons.length > 0
    || hasSignal(context, ["risky_shared", "parallel_after_dependency", "serial_only", "protected_merge_order"])
    || context.concernEffects.has("parallelization_caution");
}

function hasSurfaceSafeguard(context: StructuralContext): boolean {
  return context.obligationReasons.length > 0
    || hasSurfaceProtection(context);
}

function hasSurfaceProtection(context: StructuralContext): boolean {
  return context.conflictZoneReasons.length > 0
    || hasSignal(context, ["protected_merge_order", "serial_only", "parallel_after_dependency"])
    || context.concernEffects.has("test_strategy")
    || context.concernEffects.has("planning_readiness");
}

function buildStructuralFailureReason(
  verificationCase: VerifyVerificationCase,
  context: StructuralContext,
): string {
  if (
    verificationCase.category === "dependency_contradiction"
    || verificationCase.category === "unsafe_sequencing"
    || verificationCase.category === "migration_order"
  ) {
    if (hasSafeParallel(context) && !orderingConcernSurvives(context)) {
      return "The case still carries safe_parallel without a stronger ordering safeguard.";
    }

    return "The case lacks a concrete ordering safeguard.";
  }

  if (
    verificationCase.category === "retry_logic"
    || verificationCase.category === "ownership"
    || verificationCase.category === "stale_write"
  ) {
    return "The case lacks enough ownership or version-validity evidence to justify structural verification.";
  }

  if (
    verificationCase.category === "unsafe_parallelization"
    || verificationCase.category === "parallel_overlap"
    || verificationCase.category === "conflict_zone_hazard"
  ) {
    if (hasSafeParallel(context)) {
      return "The case still carries safe_parallel alongside shared-risk evidence.";
    }

    return "The case lacks shared-risk safeguards for the selected structural case.";
  }

  if (
    verificationCase.category === "merge_or_serialization_contradiction"
    || verificationCase.category === "config_surface"
    || verificationCase.category === "api_contract"
    || verificationCase.category === "code_surface"
    || verificationCase.category === "test_surface"
  ) {
    if (verificationCase.category === "merge_or_serialization_contradiction") {
      return hasSurfaceProtection(context)
        ? "The case lacks structural validation or protection."
        : "The case lacks merge or serialization protection.";
    }

    if (hasSafeParallel(context) && !hasSurfaceSafeguard(context)) {
      return "The case still carries safe_parallel without surface safeguards.";
    }

    return "The case lacks structural validation or protection.";
  }

  return "The selected verification case does not preserve enough structural safeguard evidence.";
}

function hasStructuralSupport(
  verificationCase: VerifyVerificationCase,
  context: StructuralContext,
): boolean {
  switch (verificationCase.category) {
    case "dependency_contradiction":
    case "unsafe_sequencing":
    case "migration_order":
      return hasOrderingSafeguard(context) && (!hasSafeParallel(context) || orderingConcernSurvives(context));
    case "retry_logic":
    case "ownership":
    case "stale_write":
      return context.obligationReasons.length > 0
        || orderingConcernSurvives(context)
        || context.dependencyReasons.length > 0
        || hasSignal(context, ["serial_only", "parallel_after_dependency", "protected_merge_order"]);
    case "unsafe_parallelization":
    case "parallel_overlap":
    case "conflict_zone_hazard":
      return hasOverlapSafeguard(context) && !hasSafeParallel(context);
    case "merge_or_serialization_contradiction":
      return hasSurfaceProtection(context);
    case "config_surface":
    case "api_contract":
    case "code_surface":
    case "test_surface":
      return hasSurfaceSafeguard(context);
    default:
      return false;
  }
}

function buildStructuralConstraints(
  verificationCase: VerifyVerificationCase,
  context: StructuralContext,
): string[] {
  const constraints = [
    ...context.dependencyReasons.map((reason) => `Preserve dependency ordering: ${reason}`),
    ...context.obligationReasons.map((reason) => `Keep validation visible: ${reason}`),
    ...context.parallelizationSignals.map((entry) => `Respect Step 2 parallelization guidance: ${entry.signal}: ${entry.reason}`),
    ...context.conflictZoneReasons.map((reason) => `Keep conflict-zone safeguards in force: ${reason}`),
    ...context.concernMessages.map((message) => `Carry this concern forward: ${message}`),
  ];

  if (
    verificationCase.category === "config_surface"
    || verificationCase.category === "api_contract"
    || verificationCase.category === "code_surface"
    || verificationCase.category === "test_surface"
  ) {
    constraints.push("No formal case was required for this target; later steps must still respect the structural safeguards above.");
  }

  return dedupeStable(constraints);
}

function buildStructuralSummary(
  verificationCase: VerifyVerificationCase,
  supported: boolean,
  reason: string | null,
): string {
  return supported
    ? `Structural verification passed for ${verificationCase.category}.`
    : `Structural verification failed for ${verificationCase.category} because ${reason ?? "the plan does not preserve enough structural safeguard evidence"}.`;
}

function buildStructuralFindings(
  verificationCase: VerifyVerificationCase,
  supported: boolean,
  target: VerifyVerificationTarget | null,
  reason: string | null,
): string[] {
  const findings = [buildStructuralSummary(verificationCase, supported, reason)];

  if (supported) {
    findings.push(
      target
        ? `Structural evidence remained traceable to ${target.sourceRiskSources.join(", ")}.`
        : "Structural evidence remained traceable to the selected verification case.",
    );
  } else {
    findings.push(reason ? `Later steps should not proceed until Step 2 restores ${reason.toLowerCase()}.` : "Later steps should not proceed until Step 2 preserves the missing structural safeguard.");
  }

  return dedupeStable(findings);
}

function buildCaseExecution(params: {
  foundation: VerifyFoundationResult;
  verificationCase: VerifyVerificationCase;
  target: VerifyVerificationTarget | null;
}): VerifyVerificationCase {
  const context = buildStructuralContext(params.foundation, params.verificationCase);
  const supported = hasStructuralSupport(params.verificationCase, context);
  const reason = supported ? null : buildStructuralFailureReason(params.verificationCase, context);

  return {
    ...params.verificationCase,
    status: supported ? "passed" : "failed",
    summary: buildStructuralSummary(params.verificationCase, supported, reason),
    findings: buildStructuralFindings(params.verificationCase, supported, params.target, reason),
    mitigations: supported
      ? ["Carry the structural safeguards forward into later steps."]
      : ["Add or preserve the missing structural safeguard in the Step 2 plan before proceeding."],
    constraints: buildStructuralConstraints(params.verificationCase, context),
  };
}

function buildStructuralVerificationSummary(cases: VerifyVerificationCase[]): string {
  if (cases.length === 0) {
    return "No structural verification cases were selected in Part 3.";
  }

  const failedCount = cases.filter((verificationCase) => verificationCase.status === "failed").length;
  if (failedCount > 0) {
    return `${cases.length} structural verification case(s) ran; ${failedCount} case(s) failed with unresolved structural issues.`;
  }

  return `${cases.length} structural verification case(s) passed deterministic structural verification.`;
}

export function buildVerifyStructuralExecution(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
}): VerifyStructuralExecutionResult {
  const targetById = new Map(params.model.targets.map((target) => [target.id, target] as const));
  const structuralCaseIds = new Set(
    params.model.cases
      .filter((verificationCase) => verificationCase.lanes.includes("structural"))
      .map((verificationCase) => verificationCase.id),
  );

  const cases = params.model.cases.map((verificationCase) => {
    if (!verificationCase.lanes.includes("structural")) {
      return verificationCase;
    }

    return buildCaseExecution({
      foundation: params.foundation,
      verificationCase,
      target: targetById.get(verificationCase.verificationTargetId) ?? null,
    });
  });

  const structuralCases = cases.filter((verificationCase) => structuralCaseIds.has(verificationCase.id));
  const failedCount = structuralCases.filter((verificationCase) => verificationCase.status === "failed").length;

  return {
    cases,
    structuralVerification: {
      status: structuralCases.length === 0
        ? "not_run"
        : failedCount > 0
          ? "failed"
          : "passed",
      summary: buildStructuralVerificationSummary(structuralCases),
      findings: dedupeStable(structuralCases.flatMap((verificationCase) => verificationCase.findings)),
      constraints: dedupeStable(structuralCases.flatMap((verificationCase) => verificationCase.constraints)),
    },
    findings: dedupeStable(structuralCases.flatMap((verificationCase) => verificationCase.findings)),
    constraints: dedupeStable(structuralCases.flatMap((verificationCase) => verificationCase.constraints)),
  };
}
