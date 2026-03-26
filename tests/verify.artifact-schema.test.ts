import assert from "node:assert/strict";
import { join } from "node:path";

import { FORGE_SCHEMA_VERSION } from "../src/intake/constants.js";
import type { PlanArtifact } from "../src/plan/types.js";
import {
  FORGE_VERIFY_FULL_COMMAND,
  FORGE_VERIFY_STAGE,
  STEP3_ALLOWED_SIDE_EFFECTS,
  STEP3_DEFERRED_CAPABILITIES,
  STEP3_DETERMINISTIC_FIRST_NOTES,
  STEP3_DISALLOWED_CAPABILITIES,
  STEP3_VERIFY_PURPOSE,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_STATE_MODEL_REQUIRED_FIELDS,
  VERIFY_STRUCTURAL_FOCUS_AREAS,
  VERIFY_SUPPORTED_LANES,
  VERIFY_TARGET_REQUIRED_FIELDS,
  VERIFY_TARGET_RISK_SOURCES,
  VERIFY_TLC_STATUSES,
} from "../src/verify/constants.js";
import type {
  VerifyFormalLaneContract,
  VerifyPlanReference,
  VerifyTargetContract,
} from "../src/verify/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgePlanBinary,
  verifyArtifactPath,
  verifyReportPath,
} from "./support/forge-cli.js";
import { buildFormalVerifyArtifactFixture } from "./support/verify-formal-fixtures.js";

type VerifyDiagnostics = {
  usability_status: "actionable" | "non_actionable" | "upstream_blocked";
  warning_items: Array<{ code: string; message: string }>;
  blocking_items: Array<{ code: string; message: string }>;
  partial_output: { code: string; message: string; fallbackReason?: string } | null;
};

type VerifyReadiness = {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "blocked";
  summary: string;
  warning_items: Array<{ code: string; message: string }>;
  blocking_issues: Array<{ code: string; message: string }>;
  partial_output: { code: string; message: string; fallbackReason?: string } | null;
  constraining_concern_ids: string[];
  recommended_user_actions: string[];
};

type VerifyArtifact = {
  schemaVersion: string;
  command: string;
  stage: string;
  status: "ready" | "blocked" | "failed";
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: {
    mode: string;
    repoReadOnlyOutsideOutputRoot: boolean;
    allowedRoot: string;
    allowedSideEffects: readonly string[];
    deferredCapabilities: readonly string[];
    disallowedCapabilities: readonly string[];
  };
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: readonly string[];
  source_plan: VerifyPlanReference;
  verification_target_contract: VerifyTargetContract;
  formal_lane_contract: VerifyFormalLaneContract;
  verification_targets: Array<{
    id: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    riskSummary: string;
    candidateLanes: string[];
    sourceRiskSources: string[];
    expectedFindingKinds: string[];
    verificationCaseIds: string[];
    traceabilityNotes: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    goal: string;
    status: string;
    summary: string;
    findings: string[];
    mitigations: string[];
    constraints: string[];
    traceabilityNotes: string[];
    formalDetails: {
      enteredFormalLane: boolean;
      entryCriteria: string[];
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      trace: string | null;
      errors: string[];
      cautionNotes: string[];
    } | null;
  }>;
  structural_verification: {
    status: string;
    summary: string;
    findings: unknown[];
    constraints: unknown[];
  };
  formal_verification: {
    status: string;
    summary: string;
    caution_notes: unknown[];
    state_models: unknown[];
    tla_specs: unknown[];
    tlc_results: unknown[];
    findings: unknown[];
    constraints: unknown[];
  };
  findings: unknown[];
  constraints: unknown[];
  carry_forward: PlanArtifact["carry_forward"];
  verification_diagnostics: VerifyDiagnostics;
  verification_readiness: VerifyReadiness;
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

const REQUIRED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_plan",
  "verification_target_contract",
  "formal_lane_contract",
  "verification_targets",
  "verification_cases",
  "structural_verification",
  "formal_verification",
  "findings",
  "constraints",
  "carry_forward",
  "verification_diagnostics",
  "verification_readiness",
  "failure",
] as const;

async function runScenario(name: string, scenario: () => Promise<void>): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function prepareWarningHeavyPlanArtifact(): Promise<{ repoRoot: string; planArtifact: PlanArtifact }> {
  const repoRoot = await createTempRepo("forge-verify-artifact-schema-");

  const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  const planArtifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));

  return { repoRoot, planArtifact };
}

function createVerifyArtifactFixture(repoRoot: string, planArtifact: PlanArtifact): VerifyArtifact {
  const outputRoot = join(repoRoot, ".forge");

  return {
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_VERIFY_FULL_COMMAND,
    stage: FORGE_VERIFY_STAGE,
    status: "ready",
    purpose: STEP3_VERIFY_PURPOSE,
    repoRoot,
    requestedOutputRoot: null,
    outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: outputRoot,
      allowedSideEffects: [...STEP3_ALLOWED_SIDE_EFFECTS],
      deferredCapabilities: [...STEP3_DEFERRED_CAPABILITIES],
      disallowedCapabilities: [...STEP3_DISALLOWED_CAPABILITIES],
    },
    files: {
      artifactPath: verifyArtifactPath(repoRoot),
      reportPath: verifyReportPath(repoRoot),
    },
    startedAt: "2026-03-17T00:00:00.000Z",
    finishedAt: "2026-03-17T00:01:00.000Z",
    summary: planArtifact.planning_readiness.summary,
    boundaryNotes: [...STEP3_DETERMINISTIC_FIRST_NOTES],
    source_plan: {
      artifactPath: join(repoRoot, ".forge", "plan.json"),
      command: planArtifact.command,
      repoRoot: planArtifact.repoRoot,
      status: planArtifact.status,
      summary: planArtifact.summary,
      readyForVerification: planArtifact.planning_readiness.ready,
      planningReadinessStatus: planArtifact.planning_readiness.status,
      failure: planArtifact.failure,
    },
    verification_target_contract: {
      requiredFields: [...VERIFY_TARGET_REQUIRED_FIELDS],
      riskSources: [...VERIFY_TARGET_RISK_SOURCES],
      structuralFocusAreas: [...VERIFY_STRUCTURAL_FOCUS_AREAS],
      formalFocusAreas: [...VERIFY_FORMAL_FOCUS_AREAS],
      supportedLanes: [...VERIFY_SUPPORTED_LANES],
    },
    formal_lane_contract: {
      tooling: [...VERIFY_FORMAL_TOOLING],
      entryCriteria: [...VERIFY_FORMAL_ENTRY_CRITERIA],
      stateModelRequiredFields: [...VERIFY_STATE_MODEL_REQUIRED_FIELDS],
      tlcStatuses: [...VERIFY_TLC_STATUSES],
    },
    verification_targets: [
      {
        id: "verify-target-001",
        title: "Verify config surface for package.json",
        category: "config_surface",
        sourcePlanItemIds: ["plan-item-config"],
        riskSummary: "Step 3 should inspect Config Surface across package.json.",
        candidateLanes: ["structural"],
        sourceRiskSources: ["plan_item_verification_relevance"],
        expectedFindingKinds: ["merge_or_serialization_contradiction"],
        verificationCaseIds: ["verify-case-001"],
        traceabilityNotes: ["Step 2 marked plan-item-config as verification-relevant for config_surface."],
      },
    ],
    verification_cases: [
      {
        id: "verify-case-001",
        verificationTargetId: "verify-target-001",
        title: "Verify config surface for package.json (structural)",
        category: "config_surface",
        sourcePlanItemIds: ["plan-item-config"],
        lanes: ["structural"],
        goal: "Check config surface structurally against Step 2 signals.",
        status: "not_run",
        summary: "Selected for structural verification in Part 3; execution has not run yet.",
        findings: [],
        mitigations: [],
        constraints: [],
        traceabilityNotes: ["Step 2 marked plan-item-config as verification-relevant for config_surface."],
        formalDetails: null,
      },
    ],
    structural_verification: {
      status: "not_run",
      summary: "1 structural verification case(s) were selected in Part 3; execution has not run yet.",
      findings: [],
      constraints: [],
    },
    formal_verification: {
      status: "not_run",
      summary: "No formal verification cases were selected in Part 3.",
      caution_notes: [],
      state_models: [],
      tla_specs: [],
      tlc_results: [],
      findings: [],
      constraints: [],
    },
    findings: [],
    constraints: [],
    carry_forward: planArtifact.carry_forward,
    verification_diagnostics: {
      usability_status: planArtifact.planning_diagnostics.usability_status,
      warning_items: planArtifact.planning_diagnostics.warning_items,
      blocking_items: [],
      partial_output: planArtifact.planning_diagnostics.partial_output,
    },
    verification_readiness: {
      ready: planArtifact.planning_readiness.ready,
      status: planArtifact.planning_readiness.status,
      summary: planArtifact.planning_readiness.summary,
      warning_items: planArtifact.planning_readiness.warning_items,
      blocking_issues: planArtifact.planning_readiness.blocking_issues,
      partial_output: planArtifact.planning_readiness.partial_output,
      constraining_concern_ids: planArtifact.planning_readiness.constraining_concern_ids,
      recommended_user_actions: planArtifact.planning_readiness.recommended_user_actions,
    },
    failure: null,
  };
}

await runScenario(
  "verify artifact exposes the frozen top-level keys and the populated Part 3 nested shape",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = createVerifyArtifactFixture(repoRoot, planArtifact);

      assert.deepEqual(Object.keys(artifact).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());

      const parsed = validateVerifyArtifact!(artifact);

      assert.deepEqual(Object.keys(parsed).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());
      assert.equal(parsed.schemaVersion, FORGE_SCHEMA_VERSION);
      assert.equal(parsed.command, FORGE_VERIFY_FULL_COMMAND);
      assert.equal(parsed.stage, FORGE_VERIFY_STAGE);
      assert.equal(parsed.status, "ready");
      assert.equal(parsed.purpose, STEP3_VERIFY_PURPOSE);
      assert.equal(parsed.repoRoot, repoRoot);
      assert.equal(parsed.requestedOutputRoot, null);
      assert.equal(parsed.outputRoot, join(repoRoot, ".forge"));
      assert.equal(parsed.writePolicy.mode, "output-root-only");
      assert.equal(parsed.writePolicy.repoReadOnlyOutsideOutputRoot, true);
      assert.equal(parsed.writePolicy.allowedRoot, join(repoRoot, ".forge"));
      assert.deepEqual(parsed.writePolicy.allowedSideEffects, [...STEP3_ALLOWED_SIDE_EFFECTS]);
      assert.deepEqual(parsed.writePolicy.deferredCapabilities, [...STEP3_DEFERRED_CAPABILITIES]);
      assert.deepEqual(parsed.writePolicy.disallowedCapabilities, [...STEP3_DISALLOWED_CAPABILITIES]);
      assert.equal(parsed.files.artifactPath, verifyArtifactPath(repoRoot));
      assert.equal(parsed.files.reportPath, verifyReportPath(repoRoot));
      assert.equal(parsed.startedAt, "2026-03-17T00:00:00.000Z");
      assert.equal(parsed.finishedAt, "2026-03-17T00:01:00.000Z");
      assert.equal(parsed.summary, planArtifact.planning_readiness.summary);
      assert.deepEqual(parsed.boundaryNotes, [...STEP3_DETERMINISTIC_FIRST_NOTES]);
      assert.equal(parsed.source_plan.artifactPath, join(repoRoot, ".forge", "plan.json"));
      assert.equal(parsed.source_plan.command, planArtifact.command);
      assert.equal(parsed.source_plan.status, planArtifact.status);
      assert.equal(parsed.source_plan.readyForVerification, planArtifact.planning_readiness.ready);
      assert.equal(parsed.source_plan.planningReadinessStatus, planArtifact.planning_readiness.status);
      assert.equal(parsed.source_plan.failure, planArtifact.failure);
      assert.deepEqual(parsed.verification_target_contract.requiredFields, [...VERIFY_TARGET_REQUIRED_FIELDS]);
      assert.deepEqual(parsed.verification_target_contract.riskSources, [...VERIFY_TARGET_RISK_SOURCES]);
      assert.deepEqual(parsed.verification_target_contract.structuralFocusAreas, [...VERIFY_STRUCTURAL_FOCUS_AREAS]);
      assert.deepEqual(parsed.verification_target_contract.formalFocusAreas, [...VERIFY_FORMAL_FOCUS_AREAS]);
      assert.deepEqual(parsed.verification_target_contract.supportedLanes, [...VERIFY_SUPPORTED_LANES]);
      assert.deepEqual(parsed.formal_lane_contract.tooling, [...VERIFY_FORMAL_TOOLING]);
      assert.deepEqual(parsed.formal_lane_contract.entryCriteria, [...VERIFY_FORMAL_ENTRY_CRITERIA]);
      assert.deepEqual(parsed.formal_lane_contract.stateModelRequiredFields, [...VERIFY_STATE_MODEL_REQUIRED_FIELDS]);
      assert.deepEqual(parsed.formal_lane_contract.tlcStatuses, [...VERIFY_TLC_STATUSES]);
      assert.equal(parsed.verification_targets.length, 1);
      assert.equal(parsed.verification_cases.length, 1);
      assert.equal(parsed.verification_targets[0]?.sourceRiskSources.length, 1);
      assert.equal(parsed.verification_targets[0]?.verificationCaseIds[0], "verify-case-001");
      assert.equal(parsed.verification_cases[0]?.verificationTargetId, "verify-target-001");
      assert.deepEqual(parsed.verification_cases[0]?.lanes, ["structural"]);
      assert.equal(parsed.structural_verification.status, "not_run");
      assert.match(parsed.structural_verification.summary, /selected in Part 3/i);
      assert.equal(parsed.formal_verification.status, "not_run");
      assert.match(parsed.formal_verification.summary, /No formal verification cases/i);
      assert.deepEqual(parsed.formal_verification.caution_notes, []);
      assert.equal(parsed.findings.length, 0);
      assert.equal(parsed.constraints.length, 0);
      assert.deepEqual(parsed.carry_forward, planArtifact.carry_forward);
      assert.equal(parsed.verification_diagnostics.usability_status, planArtifact.planning_diagnostics.usability_status);
      assert.deepEqual(parsed.verification_diagnostics.warning_items, planArtifact.planning_diagnostics.warning_items);
      assert.deepEqual(parsed.verification_diagnostics.blocking_items, []);
      assert.equal(parsed.verification_diagnostics.partial_output, planArtifact.planning_diagnostics.partial_output);
      assert.equal(parsed.verification_readiness.ready, planArtifact.planning_readiness.ready);
      assert.equal(parsed.verification_readiness.status, planArtifact.planning_readiness.status);
      assert.equal(parsed.verification_readiness.summary, planArtifact.planning_readiness.summary);
      assert.deepEqual(parsed.verification_readiness.warning_items, planArtifact.planning_readiness.warning_items);
      assert.deepEqual(parsed.verification_readiness.blocking_issues, planArtifact.planning_readiness.blocking_issues);
      assert.equal(parsed.verification_readiness.partial_output, planArtifact.planning_readiness.partial_output);
      assert.deepEqual(
        parsed.verification_readiness.constraining_concern_ids,
        planArtifact.planning_readiness.constraining_concern_ids,
      );
      assert.deepEqual(
        parsed.verification_readiness.recommended_user_actions,
        planArtifact.planning_readiness.recommended_user_actions,
      );
      assert.equal(parsed.failure, null);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify artifact rejects a case that does not point at an existing target",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = createVerifyArtifactFixture(repoRoot, planArtifact);
      artifact.verification_cases[0] = {
        ...artifact.verification_cases[0]!,
        verificationTargetId: "missing-target-id",
      };

      assert.throws(
        () => validateVerifyArtifact!(artifact),
        /existing verification target|target/i,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify artifact rejects duplicate verification target ids",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = createVerifyArtifactFixture(repoRoot, planArtifact);
      artifact.verification_targets.push({
        ...artifact.verification_targets[0]!,
        verificationCaseIds: [],
      });

      assert.throws(
        () => validateVerifyArtifact!(artifact),
        /target ids must be unique|duplicate/i,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify artifact rejects duplicate verification case ids listed on a target",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = createVerifyArtifactFixture(repoRoot, planArtifact);
      artifact.verification_targets[0] = {
        ...artifact.verification_targets[0]!,
        verificationCaseIds: ["verify-case-001", "verify-case-001"],
      };

      assert.throws(
        () => validateVerifyArtifact!(artifact),
        /case ids must not contain duplicates|duplicate/i,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify artifact rejects extra top-level fields",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = createVerifyArtifactFixture(repoRoot, planArtifact);

      assert.throws(
        () =>
          validateVerifyArtifact!({
            ...artifact,
            unexpected_top_level_field: true,
          }),
        /unrecognized|unexpected/i,
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "verify artifact accepts formal lane metadata, generated specs, and mixed TLC statuses",
  async () => {
    const { repoRoot, planArtifact } = await prepareWarningHeavyPlanArtifact();

    try {
      const schemaModule = await import("../src/verify/schema.js");
      const validateVerifyArtifact = (
        schemaModule as Record<string, unknown>
      ).validateVerifyArtifact as ((artifact: unknown) => VerifyArtifact) | undefined;

      assert.equal(typeof validateVerifyArtifact, "function");

      const artifact = buildFormalVerifyArtifactFixture({
        repoRoot,
        planArtifact,
      });

      assert.deepEqual(Object.keys(artifact).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());

      const parsed = validateVerifyArtifact!(artifact) as Record<string, unknown>;
      const verificationCases = parsed.verification_cases as Array<Record<string, unknown>>;
      const formalVerification = parsed.formal_verification as Record<string, unknown>;

      assert.equal(formalVerification.status, "failed");
      assert.match(String(formalVerification.summary), /mixed TLC outcomes/i);
      assert.deepEqual(
        (formalVerification.state_models as Array<Record<string, unknown>>).map((model) => model.verification_case_id),
        ["verify-case-001", "verify-case-002", "verify-case-003", "verify-case-004"],
      );
      assert.deepEqual(
        (formalVerification.tla_specs as Array<Record<string, unknown>>).map((spec) => spec.generation_status),
        ["generated", "generated", "generated", "generated"],
      );
      assert.deepEqual(
        (formalVerification.tla_specs as Array<Record<string, unknown>>).map((spec) => spec.name),
        [
          "ForgeVerifyOwnership1 TLA+ spec",
          "ForgeVerifyOwnership2 TLA+ spec",
          "ForgeVerifyOwnership3 TLA+ spec",
          "ForgeVerifyOwnership4 TLA+ spec",
        ],
      );
      assert.deepEqual(
        (formalVerification.tlc_results as Array<Record<string, unknown>>).map((result) => result.status),
        ["passed", "failed", "errored", "invalid_spec"],
      );
      assert.ok((formalVerification.caution_notes as string[]).length > 0);
      assert.equal(
        verificationCases.filter((verificationCase) => verificationCase.formalDetails !== null).length,
        4,
      );
      const structuralCase = verificationCases.find((verificationCase) => verificationCase.category === "config_surface");
      const formalCase = verificationCases.find((verificationCase) => verificationCase.id === "verify-case-002");
      assert.equal(structuralCase?.formalDetails, null);
      assert.equal((formalCase?.formalDetails as Record<string, unknown> | undefined)?.tlcResultId, "verify-tlc-result-002");
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
