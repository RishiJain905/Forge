import type {
  VerifyFoundationResult,
  VerifyStructuralExecutionResult,
  VerifyVerificationCase,
  VerifyVerificationCategory,
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
  parallelizationReasons: string[];
  conflictZoneReasons: string[];
  concernMessages: string[];
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
    parallelizationReasons: foundation.verificationInput.context.parallelizationSignals
      .filter((entry) => planItemIds.has(entry.planItemId))
      .map((entry) => `${entry.signal}: ${entry.reason}`),
    conflictZoneReasons: foundation.verificationInput.context.conflictZones
      .filter((zone) => zone.planItemIds.some((planItemId) => planItemIds.has(planItemId)))
      .map((zone) => `${zone.id}: ${zone.reason}`),
    concernMessages: foundation.carryForward.carryForward.concerns
      .filter((concern) => concern.planItemIds.some((planItemId) => planItemIds.has(planItemId)))
      .map((concern) => concern.message),
  };
}

function requiresDependencyEvidence(category: VerifyVerificationCategory): boolean {
  return category === "dependency_contradiction"
    || category === "unsafe_sequencing"
    || category === "migration_order";
}

function requiresOverlapEvidence(category: VerifyVerificationCategory): boolean {
  return category === "unsafe_parallelization"
    || category === "parallel_overlap"
    || category === "conflict_zone_hazard";
}

function requiresSurfaceEvidence(category: VerifyVerificationCategory): boolean {
  return category === "merge_or_serialization_contradiction"
    || category === "config_surface"
    || category === "api_contract"
    || category === "code_surface"
    || category === "test_surface";
}

function hasStructuralSupport(
  verificationCase: VerifyVerificationCase,
  target: VerifyVerificationTarget | null,
  context: StructuralContext,
): boolean {
  if (requiresDependencyEvidence(verificationCase.category)) {
    return context.dependencyReasons.length > 0
      || context.parallelizationReasons.length > 0
      || context.concernMessages.length > 0;
  }

  if (requiresOverlapEvidence(verificationCase.category)) {
    return context.conflictZoneReasons.length > 0
      || context.parallelizationReasons.length > 0
      || context.concernMessages.length > 0;
  }

  if (requiresSurfaceEvidence(verificationCase.category)) {
    return context.obligationReasons.length > 0
      || context.parallelizationReasons.length > 0
      || context.concernMessages.length > 0;
  }

  return Boolean(target && target.sourceRiskSources.length > 0);
}

function buildStructuralConstraints(
  verificationCase: VerifyVerificationCase,
  context: StructuralContext,
): string[] {
  const constraints = [
    ...context.dependencyReasons.map((reason) => `Preserve dependency ordering: ${reason}`),
    ...context.obligationReasons.map((reason) => `Keep validation visible: ${reason}`),
    ...context.parallelizationReasons.map((reason) => `Respect Step 2 parallelization guidance: ${reason}`),
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
): string {
  return supported
    ? `Structural verification passed for ${verificationCase.category}.`
    : `Structural verification failed for ${verificationCase.category} because the plan does not preserve enough structural safeguard evidence.`;
}

function buildStructuralFindings(
  verificationCase: VerifyVerificationCase,
  supported: boolean,
  target: VerifyVerificationTarget | null,
): string[] {
  const findings = [buildStructuralSummary(verificationCase, supported)];

  if (supported) {
    findings.push(
      target
        ? `Structural evidence remained traceable to ${target.sourceRiskSources.join(", ")}.`
        : "Structural evidence remained traceable to the selected verification case.",
    );
  } else {
    findings.push("Later steps should not proceed until Step 2 preserves the missing structural safeguard.");
  }

  return dedupeStable(findings);
}

function buildCaseExecution(params: {
  foundation: VerifyFoundationResult;
  verificationCase: VerifyVerificationCase;
  target: VerifyVerificationTarget | null;
}): VerifyVerificationCase {
  const context = buildStructuralContext(params.foundation, params.verificationCase);
  const supported = hasStructuralSupport(params.verificationCase, params.target, context);

  return {
    ...params.verificationCase,
    status: supported ? "passed" : "failed",
    summary: buildStructuralSummary(params.verificationCase, supported),
    findings: buildStructuralFindings(params.verificationCase, supported, params.target),
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
    return `${cases.length} structural verification case(s) ran; ${failedCount} case(s) found unresolved structural issues.`;
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
