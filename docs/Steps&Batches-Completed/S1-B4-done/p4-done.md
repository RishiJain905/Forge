# Batch 4 Part 4 Done Summary

## Implemented Spec
- `forge_step1_batch4/part-4-step1-polish-test-hardening-and-freeze-criteria.md`

## What Changed
- Polished the Step 1 report so warning-heavy and failed runs read more coherently by adding an overview signal summary with confidence, warning, ambiguity, and blocking-issue counts, and by replacing the misleading bare `- none` failure text on readiness-blocked failed runs.
- Hardened the freeze suite with low-confidence repeated-run stability coverage, assist-off versus assist-on authoritative-targeting coverage, and failed-but-persisted debug coverage under `FORGE_INTAKE_DEBUG=1`.
- Extended packaged smoke verification so the frozen Step 1 surface now covers spec mode, prompt mode, a low-confidence prompt-success path, and bounded `--llm-assist` fallback behavior without needing any real backend.
- Fixed the one real behavior gap exposed by the new tests: low-confidence escalation failures now persist explicit failure details, while still preserving more specific blocker precedence such as `TASK_GOAL_MISSING`.
- Confirmed there are no remaining blocking Step 1 `TODO`/`FIXME`/`XXX` markers in the Step 1 code and test surfaces, so Step 1 can now be treated as frozen except for future bug fixes.

## Tests Added Or Hardened
- `tests/intake.report.test.ts`
  - Added overview signal-summary regression coverage.
  - Added readiness-blocked `failure: null` report regression coverage.
- `tests/intake.batch4-freeze-criteria.test.ts`
  - Added low-confidence repeated-run stability coverage.
- `tests/intake.llm-policy.test.ts`
  - Added assist-off versus assist-on same-prompt coverage with deterministic candidate-target parity.
- `tests/intake.output-artifacts.test.ts`
  - Added failed-but-persisted low-confidence debug usability coverage.
- `tests/intake.runner.test.ts`
  - Added blocker-precedence regression coverage for `--fail-on-low-confidence`.
- `scripts/smoke.mjs`
  - Added low-confidence prompt smoke coverage.
  - Added bounded `--llm-assist` fallback smoke coverage.

## Failing-Test Categories That Drove The Work
- Report coherence regressions for warning-heavy and readiness-blocked failed output.
- Missing persisted failure details for low-confidence escalation runs.
- Incorrect failure precedence when low confidence and a more specific blocker both existed.
- Freeze-line gaps for repeated-run stability, assist-on/off parity, and packaged CLI smoke coverage.

## Freeze Checklist
- [x] Spec mode is reliable.
- [x] Prompt mode is trustworthy at basic parity.
- [x] Warning and failure behavior is stable.
- [x] Optional debug outputs are coherent and remain auxiliary.
- [x] `--llm-assist` exists in narrow V1 form.
- [x] Artifacts and reports are contract-stable.
- [x] Tests protect both major input modes and major warning/failure paths.
- [x] No major open Step 1 design questions remain.
- [x] Future Step 1 work can now be treated as bug fixes only.

## Key Files
- `src/intake/report.ts`
- `src/intake/runner.ts`
- `tests/intake.report.test.ts`
- `tests/intake.batch4-freeze-criteria.test.ts`
- `tests/intake.llm-policy.test.ts`
- `tests/intake.output-artifacts.test.ts`
- `tests/intake.runner.test.ts`
- `scripts/smoke.mjs`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Batch 4 Part 4 is integrated directly onto `dev`
- Step 1 intake is now frozen for V1 except for future bug fixes

## Follow-On
- Next Batch 4 target: `forge_step1_batch4/part-5-step2-handoff-contract-for-plan.md`
