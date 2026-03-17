export const FORGE_INTAKE_COMMAND = "intake" as const;
export const FORGE_STEP_STAGE = "step1" as const;
export const FORGE_SCHEMA_VERSION = "2.0.0" as const;
export const DEFAULT_OUTPUT_DIRECTORY = ".forge" as const;
export const REPORTS_DIRECTORY = "reports" as const;
export const DEBUG_DIRECTORY = "debug" as const;
export const INTAKE_ARTIFACT_NAME = "intake.json" as const;
export const INTAKE_REPORT_NAME = "intake-report.md" as const;
export const INTAKE_DEBUG_ARTIFACT_NAME = "intake-debug.json" as const;

export const STEP1_BOUNDARY_POLICY = {
  command: FORGE_INTAKE_COMMAND,
  stage: FORGE_STEP_STAGE,
  purpose:
    "Define forge intake as a read-only foundation stage that emits durable artifacts without editing source files.",
  allowedSideEffects: [
    "create output directories under the configured output root",
    "write the intake artifact",
    "write the intake report",
    "optionally write an internal debug artifact inside the output root",
  ],
  deferredCapabilities: [
    "forge plan",
    "forge verify",
    "forge split",
    "forge execute",
    "forge integrate",
  ],
  repoReadOnlyOutsideOutputRoot: true,
  disallowedCapabilities: [
    "create plan items",
    "split work into workstreams",
    "create execution packets",
    "perform formal verification work",
    "modify application source files",
    "edit source files directly",
    "run implementation tasks",
  ],
} as const;

export type Step1BoundaryPolicy = typeof STEP1_BOUNDARY_POLICY;
