export const FORGE_PLAN_COMMAND = "plan" as const;
export const FORGE_PLAN_STAGE = "step2" as const;
export const FORGE_PLAN_FULL_COMMAND = `forge ${FORGE_PLAN_COMMAND}` as const;
export const PLAN_DEBUG_ENV_VAR = "FORGE_PLAN_DEBUG" as const;

export const PLAN_ARTIFACT_NAME = "plan.json" as const;
export const PLAN_REPORT_NAME = "plan-report.md" as const;
export const PLAN_DEBUG_ARTIFACT_NAME = "plan-debug.json" as const;
export const PLAN_DEBUG_PLAN_ITEMS_NAME = "plan-items.json" as const;
export const PLAN_DEBUG_DEPENDENCIES_NAME = "dependencies.json" as const;
export const PLAN_DEBUG_CONFLICT_ZONES_NAME = "conflict-zones.json" as const;
export const PLAN_DEBUG_TEST_OBLIGATIONS_NAME = "test-obligations.json" as const;
export const PLAN_DEBUG_PLANNING_READINESS_NAME = "planning-readiness.json" as const;

export const STEP2_PLAN_PURPOSE =
  "Transform Step 1 Intake output into a structured implementation plan that later steps can trust." as const;

export const STEP2_DETERMINISTIC_FIRST_NOTES = [
  "Consume the persisted Step 1 intake artifact instead of re-parsing raw task text or re-running broad intake logic.",
  "Treat Step 1 task, repo, targeting, risk, ambiguity, warning, confidence, and readiness sections as authoritative planning inputs.",
  "Keep the planning skeleton deterministic-first so optional assistive wording remains bounded and non-authoritative.",
] as const;

export const STEP2_ALLOWED_SIDE_EFFECTS = [
  "read the Step 1 intake artifact",
  "validate the Step 1 handoff contract before planning continues",
  "write plan artifacts inside the resolved output root",
  `optionally write internal planning debug artifacts inside the resolved output root when ${PLAN_DEBUG_ENV_VAR}=1 is set`,
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
  `optionally write \`plan-debug.json\`, \`plan-items.json\`, \`dependencies.json\`, \`conflict-zones.json\`, \`test-obligations.json\`, and \`planning-readiness.json\` under \`.forge/debug/\` when ${PLAN_DEBUG_ENV_VAR}=1 is set`,
] as const;

export const PLAN_BOUNDARY_NOTES = [
  "Plan consumes the persisted Step 1 intake artifact instead of re-running intake parsing.",
  "Plan carries forward Step 1 ambiguity, warning, confidence, and readiness state without hiding it.",
  "Plan may apply bounded internal planning-assist wording after deterministic planning, but deterministic structure remains authoritative.",
  "Plan emits explicit plan-item, dependency, conflict-zone, test-obligation, parallelization, and carry-forward concern modeling while still deferring later verify, split, execute, and integrate behavior.",
  `Plan may optionally write debug artifacts under .forge/debug/ when ${PLAN_DEBUG_ENV_VAR}=1 is set, but those files stay secondary to plan.json and plan-report.md.`,
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

export const PLAN_READINESS_STATUSES = [
  "ready",
  "ready_with_warnings",
  "blocked",
] as const;

export const PLAN_READINESS_CONSTRAINING_EFFECTS = [
  "planning_readiness",
  "dependency_caution",
  "parallelization_caution",
  "test_strategy",
] as const;

export const PLAN_CARRY_FORWARD_CONCERN_SOURCES = [
  "ambiguity",
  "warning",
  "low_confidence",
  "candidate_target_uncertainty",
  "readiness_blocker",
] as const;

export const PLAN_CARRY_FORWARD_CONCERN_EFFECTS = [
  "risk_level",
  "dependency_caution",
  "parallelization_caution",
  "test_strategy",
  "planning_readiness",
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
