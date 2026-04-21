# Batch 4 Part 3 Done Summary

## Implemented Spec
- `forge_step1_batch4/part-3-edge-cases-warnings-failures-and-debug-outputs.md`

## What Changed
- Hardened git-context failure classification so plain non-git folders now stay on the stable `not_repo` path without spurious warning output, while unexpected git-command failures remain warning-grade and developer-readable.
- Added structured `GIT_CONTEXT_FAILED` and `CONFIDENCE_DEGRADED` warning items so warning-causing edge cases are visible in the artifact, report, and debug surfaces instead of only appearing as free-text messages.
- Surfaced visible optional-reasoning provenance through existing confidence reasons whenever `--llm-assist` materially enriches the task wording or other assist output, without changing deterministic candidate targeting.
- Expanded `warnings.json` so debug output now includes the compact optional-reasoning usage summary (`requested`, `attempted`, `used`, `provider`) while preserving structured warning items, readiness state, and failure details.
- Added focused regression coverage for git warning typing, confidence warning typing, assist provenance, and debug warning payload completeness while keeping the Step 1 top-level artifact contract stable.

## Completion Checklist
- [x] Plain-folder non-git runs no longer downgrade clean success paths with false git warnings
- [x] Unexpected git failures emit structured warning items and remain non-blocking when filesystem grounding is still usable
- [x] Confidence degradation now appears in structured warning output as well as human-readable warnings
- [x] Assist enrichment leaves visible provenance in existing public/debug surfaces without becoming authoritative
- [x] Debug warning output carries optional-reasoning usage metadata plus readiness/failure context
- [x] No new CLI flags or top-level Step 1 schema surface were introduced
- [x] Full verification is green on `dev`

## Key Files
- `src/intake/git-context.ts`
- `src/intake/analysis.ts`
- `src/intake/llm.ts`
- `src/intake/debug.ts`
- `tests/intake.git-context.test.ts`
- `tests/intake.analysis.test.ts`
- `tests/intake.llm-policy.test.ts`
- `tests/intake.output-artifacts.test.ts`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Batch 4 Part 3 is integrated onto `dev`
- Step 1 warning/failure/debug hardening is now materially closer to the Batch 4 freeze line while keeping deterministic intake authoritative

## Follow-On
- Next Batch 4 target: `forge_step1_batch4/part-4-step1-polish-test-hardening-and-freeze-criteria.md`
