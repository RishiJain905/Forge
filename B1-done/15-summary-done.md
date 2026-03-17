# Batch 1.15 Done Summary

## Implemented Spec
- `forge_step1_batch1_impl/15-llm-usage-policy-and-control.md`

## What Changed
- Replaced the old defer-only `--llm-assist` behavior with a real deterministic-first optional reasoning policy.
- Added an internal optional reasoning hook interface so intake can accept assist-side ambiguity, warning, and follow-up enrichment without making LLM output the source of truth.
- Kept deterministic repo facts authoritative by ignoring conflicting optional reasoning target suggestions and surfacing override notes in warnings and confidence reasons.
- Added focused coverage for no-backend fallback, injected hook enrichment, `--no-llm` suppression, and deterministic override behavior.

## Key Files
- `src/intake/llm.ts`
- `src/intake/options.ts`
- `src/intake/runner.ts`
- `src/intake/analysis.ts`
- `src/intake/debug.ts`
- `src/intake/types.ts`
- `tests/intake.llm-policy.test.ts`
- `tests/intake.cli-flags.test.ts`
- `package.json`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Merged worktree branch: `batch1-15-llm-policy`
- Verification must be rerun on merged `dev` before cleanup is complete.

## Follow-On
- Next Batch 1 target: `forge_step1_batch1_impl/16-focus-directory-and-targeting-rules.md`
