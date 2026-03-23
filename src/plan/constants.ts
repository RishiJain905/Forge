export const FORGE_PLAN_COMMAND = "plan" as const;
export const FORGE_PLAN_STAGE = "step2" as const;
export const FORGE_PLAN_FULL_COMMAND = `forge ${FORGE_PLAN_COMMAND}` as const;

export const PLAN_ARTIFACT_NAME = "plan.json" as const;
export const PLAN_REPORT_NAME = "plan-report.md" as const;
export const PLAN_DEBUG_ARTIFACT_NAME = "plan-debug.json" as const;
export const PLAN_DEBUG_PLAN_ITEMS_NAME = "plan-items.json" as const;
export const PLAN_DEBUG_DEPENDENCIES_NAME = "dependencies.json" as const;
export const PLAN_DEBUG_CONFLICT_ZONES_NAME = "conflict-zones.json" as const;
export const PLAN_DEBUG_TEST_OBLIGATIONS_NAME = "test-obligations.json" as const;

export const STEP2_PLAN_PURPOSE =
  "Transform Step 1 Intake output into a structured implementation plan that later steps can trust." as const;

export const STEP2_DETERMINISTIC_FIRST_NOTES = [
  "Consume the persisted Step 1 intake artifact instead of re-parsing raw task text or re-running broad intake logic.",
  "Treat Step 1 task, repo, targeting, risk, ambiguity, warning, confidence, and readiness sections as authoritative planning inputs.",
  "Keep the initial planning skeleton deterministic-first so later optional reasoning remains bounded and non-authoritative.",
] as const;

export const STEP2_ALLOWED_SIDE_EFFECTS = [
  "read the Step 1 intake artifact",
  "validate the Step 1 handoff contract before planning continues",
  "in later Step 2 parts, write plan artifacts inside the resolved output root",
  "in later Step 2 parts, optionally write internal planning debug artifacts inside the output root",
] as const;

export const STEP2_DEFERRED_CAPABILITIES = [
  "forge verify",
  "forge split",
  "forge execute",
  "forge integrate",
  "deep LLM planning orchestration",
  "interactive planning mode",
] as const;

export const STEP2_DISALLOWED_CAPABILITIES = [
  "verify correctness directly",
  "split into workstreams",
  "generate execution packets",
  "modify code",
  "edit source files directly",
  "hide unresolved Step 1 problems",
  "act like a freeform brainstorming agent",
] as const;

export const PLAN_ALLOWED_SIDE_EFFECTS = [
  "read the Step 1 intake artifact",
  "write `plan.json`",
  "write `plan-report.md`",
] as const;

export const PLAN_BOUNDARY_NOTES = [
  "Plan consumes the persisted Step 1 intake artifact instead of re-running intake parsing.",
  "Plan carries forward Step 1 ambiguity, warning, confidence, and readiness state without hiding it.",
  "Real plan-item, dependency, conflict-zone, test-obligation, and parallelization modeling is deferred to later Step 2 batches.",
] as const;

export const PLAN_ITEM_REQUIRED_FIELDS = [
  "id",
  "title",
  "description",
  "category",
  "sourceRequirements",
  "likelyAffectedPaths",
  "dependencies",
  "riskLevel",
  "testObligations",
  "verificationRelevance",
  "parallelization",
] as const;

export const PLAN_ITEM_CATEGORIES = [
  "implementation",
  "test",
  "interface",
  "config",
  "documentation",
  "foundation",
] as const;

export const PLAN_DEPENDENCY_TYPES = [
  "hard",
  "soft",
  "sequencing",
  "interface_first",
] as const;

export const PLAN_RISK_LEVELS = [
  "low",
  "medium",
  "high",
] as const;

export const PLAN_TEST_OBLIGATION_CATEGORIES = [
  "unit",
  "integration",
  "regression",
  "smoke",
  "migration_validation",
  "contract_validation",
] as const;

export const PLAN_VERIFICATION_TARGET_CATEGORIES = [
  "code_surface",
  "test_surface",
  "config_surface",
  "retry_logic",
  "ownership",
  "api_contract",
  "migration_order",
  "parallel_overlap",
  "stale_write",
] as const;

export const PLAN_PARALLELIZATION_SIGNALS = [
  "serial_only",
  "safe_parallel",
  "parallel_after_dependency",
  "risky_shared",
  "protected_merge_order",
] as const;

export interface Step2BoundaryPolicy {
  command: string;
  stage: string;
  purpose: string;
  authoritativeInputs: readonly string[];
  deterministicFirst: true;
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
}

export const STEP2_BOUNDARY_POLICY: Step2BoundaryPolicy = {
  command: `forge ${FORGE_PLAN_COMMAND}`,
  stage: FORGE_PLAN_STAGE,
  purpose: STEP2_PLAN_PURPOSE,
  authoritativeInputs: [
    ".forge/intake.json",
    "task_spec",
    "repo_context",
    "candidate_targets",
    "risk_analysis",
    "initial_verification_targets",
    "ambiguities",
    "warnings",
    "confidence",
    "next_step_readiness",
  ] as const,
  deterministicFirst: true,
  allowedSideEffects: STEP2_ALLOWED_SIDE_EFFECTS,
  deferredCapabilities: STEP2_DEFERRED_CAPABILITIES,
  disallowedCapabilities: STEP2_DISALLOWED_CAPABILITIES,
} as const;
