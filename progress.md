# Progress

## Completed
- Batch 1.01: `01-purpose-and-boundary.md`
  - Implemented the initial Forge CLI scaffold and the `forge intake` Step 1 command.
  - Enforced the Step 1 boundary so writes stay inside `.forge/` or a repo-internal configured equivalent.
  - Added artifact/report persistence with failed-run fallback behavior.
  - Added boundary-focused automated tests and smoke verification.
- Batch 1.02: `02-command-goal-and-success.md`
  - Added primary task input support with `--spec` and `--prompt`.
  - Normalized task goals and acceptance-criteria signals into the intake artifact.
  - Added repo grounding, candidate-target inference, and deterministic success/warning/failed readiness evaluation.
  - Persisted `taskSpec`, `repoContext`, `candidateTargets`, `ambiguities`, and `nextStepReadiness`.
  - Expanded tests to cover success, warning, failed, and real Commander CLI parsing paths.
- Batch 1.03: `03-input-modes-and-mode-resolution.md`
  - Made mode resolution for `--spec` and `--prompt` explicit and deterministic.
  - Normalized both entry modes into one shared raw-input object before downstream parsing.
  - Added public artifact/report metadata for `input_mode` and `source_inputs`.
  - Added prompt-mode ambiguity guidance for prompts that are too short to be actionable.
  - Expanded automated coverage and smoke assertions for the new input-mode behavior.
- Batch 1.04: `04-input-contract-and-validation.md`
  - Added validation-critical CLI support for `--notes`, `--constraints`, `--config`, and repeatable `--focus`.
  - Introduced early input validation with blocking issues, warnings, and useful failed artifact/report persistence when a repo root is available.
  - Normalized notes and constraints into `source_inputs` and appended them to downstream parser input.
  - Surfaced `config_path` and `focus_paths` metadata in the artifact/report while explicitly warning that their behavioral use is deferred.
  - Added dedicated validation-focused automated coverage plus smoke updates for the new stable source-input metadata.
- Batch 1.05: `05-cli-surface-and-flag-behavior.md`
  - Added the remaining Step 1 CLI flags for output selection, LLM mode selection, and low-confidence escalation intent.
  - Introduced deterministic runtime option resolution for default output behavior, output-mode conflicts, and LLM-mode conflicts.
  - Made `--json-only` and `--report-only` control which intake files are persisted while keeping the human-readable CLI summary stable.
  - Added durable `runtime_options` metadata to the artifact/report and explicit deferred-behavior warnings for `--llm-assist` and `--fail-on-low-confidence`.
  - Expanded automated coverage and smoke assertions for the new CLI surface and flag behavior contract.
- Batch 1.06: `06-core-responsibilities.md`
  - Added explicit internal result types and pipeline stages for task parsing, repo inspection, engineering-only inference, and ambiguity/confidence analysis.
  - Reworked intake orchestration so all four responsibilities feed a shared assembled result before artifact persistence.
  - Moved candidate-target generation under the explicit inference responsibility while keeping the public artifact/report contract stable.
  - Added preliminary internal confidence analysis that now drives warning context without yet exposing the later public confidence section.
  - Added dedicated automated coverage for the new responsibility pipeline and assembly path.
- Batch 1.07: `07-non-goals-and-boundary-enforcement.md`
  - Added a dedicated boundary-enforcement helper that now shapes the final Step 1 output before artifact/report persistence.
  - Added pointer-only `initialVerificationTargets` output so intake can identify later verification surfaces without performing verification work.
  - Expanded boundary notes and report language to explicitly defer code edits, workstream splitting, and formal verification requests to later workflow stages.
  - Strengthened Step 1 boundary policy constants to document excluded capabilities more explicitly.
  - Added dedicated automated coverage for semantic non-goals and boundary-safe failed-run behavior.
- Batch 1.08: `08-output-artifacts-and-write-rules.md`
  - Refactored intake persistence into explicit artifact/report/debug writer helpers with deterministic directory bootstrap and write ordering.
  - Added internal debug artifact emission behind `FORGE_INTAKE_DEBUG=1`, scoped to the resolved output root.
  - Added cleanup of partial configured-root writes before fallback persistence so artifact/report outputs stay aligned to the same run state.
  - Surfaced explicit persistence failure details in CLI failure output when durable files cannot be trusted.
  - Added dedicated automated coverage for partial-write cleanup, debug artifact emission, and no-durable-output failure messaging.
- Batch 1.09: `09-main-artifact-schema.md`
  - Extracted the top-level intake artifact contract into a dedicated schema module instead of keeping the validator only inline in artifact assembly.
  - Locked the stable top-level field set for `.forge/intake.json` and made the runtime validator reject unexpected extra top-level keys.
  - Tightened version, command, and stage metadata validation so the public artifact contract stays explicit and boring.
  - Added direct schema-focused automated coverage for exact top-level keys plus rejection of missing version fields, missing top-level sections, and invalid status values.
  - Kept the existing artifact assembly path and public field names intact while hardening the formal schema contract.
- Batch 1.10: `10-detailed-artifact-sections.md`
  - Replaced the public artifact’s internal camelCase section leakage with an explicit section-mapping layer that emits stable `snake_case` Step 1 section names.
  - Added dedicated public `risk_analysis` and `confidence` sections so intake now persists deterministic risk zones and confidence signals directly in `.forge/intake.json`.
  - Normalized the documented detailed section field names and made every documented section present even when empty or defaulted.
  - Updated the markdown report, smoke verification, and intake artifact consumers to align with the new detailed section contract.
  - Added dedicated automated coverage for the normalized section contract, typed risk zones, stable confidence output, and failed-run default section behavior.

- Batch 1.11: `11-human-readable-report-contract.md`
  - Reworked the intake markdown report into a stable human-readable heading contract with explicit `Overview` and `Assumptions` sections.
  - Kept the report grounded in artifact data and derived assumptions only from existing artifact signals instead of adding a new JSON field.
  - Preserved existing report output-path behavior while making warning, ambiguity, confidence, and readiness sections easier for humans to inspect.
  - Added dedicated report-renderer tests and wired them into the default `npm.cmd test` suite.
- Batch 1.12: `12-confidence-model-and-scoring.md`
  - Added a dedicated rules-based confidence resolver and moved confidence scoring out of the inline intake analysis flow.
  - Kept the public `confidence` artifact/report shape stable while making levels and component strengths reproducible from explicit parser, repo, targeting, and ambiguity signals.
  - Added resolver-focused automated coverage plus end-to-end tests for weak repo inspection when explicitly referenced test paths are missing.
  - Kept `--fail-on-low-confidence` deferred so Batch 1.13 can handle final status escalation separately.
- Batch 1.13: `13-failure-warning-and-status-resolution.md`
  - Finalized deterministic intake status resolution across blocking failures, warnings, ambiguities, and confidence outcomes.
  - Activated `--fail-on-low-confidence` so low-confidence but structurally usable results can escalate from `warning` to `failed` when requested.
  - Kept failed-run persistence best-effort so repo-resolved runs still emit useful artifact/report output when possible.
  - Added focused status-policy coverage plus CLI regression tests for low-confidence warning-vs-failure behavior.
- Batch 1.14: `14-prompt-mode-implementation-rules.md`
  - Added deterministic prompt normalization so prompt mode derives a synthetic title, goal, summary, and structured requirement candidates from inline prompts without changing the public artifact/report contract.
  - Added prompt-mode open-question handling for missing acceptance criteria, unclear scope, missing constraints, and repo-shape conflicts.
  - Tightened prompt confidence scoring so broad or weakly grounded prompts downgrade more aggressively while explicit grounded prompts remain capable of `success`.
  - Added focused automated coverage for structured prompt normalization, broad prompt follow-up guidance, and prompt/repo conflict handling.

## Current Branch State
- `dev` includes the completed Batch 1.14 implementation.
- `execution.md` now explicitly requires completed worktree branches to be merged back into their source branch before a task is considered complete, unless the user explicitly requests a PR-only workflow.

## Verification
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run smoke`

## Next
- Continue Batch 1 with `forge_step1_batch1_impl/15-llm-usage-policy-and-control.md`.
