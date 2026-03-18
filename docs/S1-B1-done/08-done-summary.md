# Batch 1.08 Complete: Output Artifacts and Write Rules

## Spec implemented
- Step 1 intake now uses explicit persistence writers for the machine-readable artifact and human-readable report instead of keeping raw file writes inline in the runner.
- Intake now has deterministic output bootstrap and write-order rules, including safe creation of `.forge/`, `reports/`, and the optional internal `debug/` directory.
- Intake now supports optional internal debug artifact output behind `FORGE_INTAKE_DEBUG=1`, writing a machine-readable debug payload inside the resolved output root.
- Partial configured-root write failures are now cleaned up before fallback persistence, so the final JSON artifact and markdown report always describe the same run state.
- Failed persistence runs now surface explicit failure details in CLI output when durable artifact/report output cannot be relied on.

## What changed
- Added a dedicated persistence helper to own directory bootstrap, ordered critical writes, cleanup of partial outputs, and best-effort debug artifact emission.
- Added a debug artifact builder for internal pipeline and persistence diagnostics without widening the stable public intake artifact schema.
- Extended output-path resolution to include a debug artifact path under the same output-root-only boundary policy as the main artifact and report.
- Refactored the intake runner to build the debug payload and hand all writes through the new persistence layer.
- Added output-artifact-specific automated coverage for partial-write cleanup, internal debug emission, and no-durable-output failure messaging.

## Main code surfaces
- `src/intake/persistence.ts`
- `src/intake/debug.ts`
- `src/intake/runner.ts`
- `src/intake/path-policy.ts`
- `src/intake/options.ts`
- `src/intake/constants.ts`
- `src/intake/types.ts`
- `src/cli.ts`
- `tests/intake.output-artifacts.test.ts`
- `package.json`

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Acceptance result
- Step 1 now creates required output directories safely before writing selected outputs.
- Partial write failures are surfaced clearly and no longer leave contradictory configured-root artifacts behind after fallback.
- Human-readable and machine-readable outputs stay aligned to the same persisted run state.
- All writes, including debug output, remain confined to the resolved output root.
