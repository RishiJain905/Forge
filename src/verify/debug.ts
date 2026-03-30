import { VERIFY_DEBUG_ENV_VAR } from "./constants.js";
import type {
  VerifyArtifact,
  VerifyConstraint,
  VerifyDebugArtifact,
  VerifyFinding,
  VerifyResolvedOutputPaths,
} from "./types.js";

interface PlannedWrite {
  filePath: string;
  contents: string;
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireDebugPath(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Verify debug output path is missing: ${name}.`);
  }

  return value;
}

function selectFindings(
  artifact: VerifyArtifact,
  lane: "structural" | "formal",
): VerifyFinding[] {
  return artifact.findings.filter((finding) => finding.lane === lane);
}

function selectConstraints(
  artifact: VerifyArtifact,
  lane: "structural" | "formal",
): VerifyConstraint[] {
  return artifact.constraints.filter((constraint) => constraint.lane === lane);
}

export function isVerifyDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[VERIFY_DEBUG_ENV_VAR] === "1";
}

export function createVerifyDebugArtifact(
  artifact: VerifyArtifact,
  paths: VerifyResolvedOutputPaths,
): VerifyDebugArtifact {
  return {
    command: artifact.command,
    stage: artifact.stage,
    status: artifact.status,
    purpose: artifact.purpose,
    repoRoot: artifact.repoRoot,
    outputRoot: artifact.outputRoot,
    summary: artifact.summary,
    files: {
      debugArtifactPath: requireDebugPath(paths.debugArtifactPath, "debugArtifactPath"),
      debugVerificationCasesPath: requireDebugPath(
        paths.debugVerificationCasesPath,
        "debugVerificationCasesPath",
      ),
      debugStructuralFindingsPath: requireDebugPath(
        paths.debugStructuralFindingsPath,
        "debugStructuralFindingsPath",
      ),
      debugVerificationReadinessPath: requireDebugPath(
        paths.debugVerificationReadinessPath,
        "debugVerificationReadinessPath",
      ),
      debugStateModelsPath: requireDebugPath(paths.debugStateModelsPath, "debugStateModelsPath"),
      debugTlaSpecsPath: requireDebugPath(paths.debugTlaSpecsPath, "debugTlaSpecsPath"),
      debugTlcResultsPath: requireDebugPath(paths.debugTlcResultsPath, "debugTlcResultsPath"),
    },
    verification_cases: artifact.verification_cases,
    structural_verification: {
      findings: selectFindings(artifact, "structural"),
    },
    formal_verification: {
      state_models: artifact.formal_verification.state_models,
      tla_specs: artifact.formal_verification.tla_specs,
      tlc_results: artifact.formal_verification.tlc_results,
    },
    verification_diagnostics: artifact.verification_diagnostics,
    verification_readiness: artifact.verification_readiness,
    failure: artifact.failure,
  };
}

export function createVerifyDebugWrites(params: {
  artifact: VerifyArtifact;
  paths: VerifyResolvedOutputPaths;
}): PlannedWrite[] {
  const debugArtifact = createVerifyDebugArtifact(params.artifact, params.paths);

  return [
    {
      filePath: requireDebugPath(params.paths.debugArtifactPath, "debugArtifactPath"),
      contents: stringifyJson(debugArtifact),
    },
    {
      filePath: requireDebugPath(
        params.paths.debugVerificationCasesPath,
        "debugVerificationCasesPath",
      ),
      contents: stringifyJson({ verification_cases: params.artifact.verification_cases }),
    },
    {
      filePath: requireDebugPath(
        params.paths.debugStructuralFindingsPath,
        "debugStructuralFindingsPath",
      ),
      contents: stringifyJson({
        findings: selectFindings(params.artifact, "structural"),
        constraints: selectConstraints(params.artifact, "structural"),
      }),
    },
    {
      filePath: requireDebugPath(
        params.paths.debugVerificationReadinessPath,
        "debugVerificationReadinessPath",
      ),
      contents: stringifyJson({
        verification_readiness: params.artifact.verification_readiness,
      }),
    },
    {
      filePath: requireDebugPath(params.paths.debugStateModelsPath, "debugStateModelsPath"),
      contents: stringifyJson({ state_models: params.artifact.formal_verification.state_models }),
    },
    {
      filePath: requireDebugPath(params.paths.debugTlaSpecsPath, "debugTlaSpecsPath"),
      contents: stringifyJson({ tla_specs: params.artifact.formal_verification.tla_specs }),
    },
    {
      filePath: requireDebugPath(params.paths.debugTlcResultsPath, "debugTlcResultsPath"),
      contents: stringifyJson({
        tlc_results: params.artifact.formal_verification.tlc_results,
        findings: selectFindings(params.artifact, "formal"),
        constraints: selectConstraints(params.artifact, "formal"),
      }),
    },
  ];
}
