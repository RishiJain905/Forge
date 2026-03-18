# Batch 1.17 Done Summary

## Implemented Spec
- `forge_step1_batch1_impl/17-git-context-rules.md`

## What Changed
- Added git-aware repo root enrichment so intake prefers the git top-level when the requested path is inside a worktree, while preserving filesystem fallback when git is absent or unusable.
- Added a dedicated `repo_context.git_context` contract with normalized status, repo root, branch, and bounded recent-file hints.
- Kept git non-blocking: plain folders and missing git stay warning-free, while unexpected git failures downgrade to a non-blocking warning that filesystem grounding was used instead.
- Added dedicated git-context end-to-end coverage plus schema, section-mapping, report, and responsibility updates so the new contract is locked into the default `npm.cmd test` suite.

## Key Files
- `src/intake/git-context.ts`
- `src/intake/path-policy.ts`
- `src/intake/repo-context.ts`
- `src/intake/runner.ts`
- `src/intake/types.ts`
- `tests/intake.git-context.test.ts`
- `tests/support/forge-cli.ts`

## Verification
- `npm.cmd test` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run smoke` - PASS

## Final Branch State
- Target branch: `dev`
- Merged worktree branch: `codex/batch1-17-git-context`

## Follow-On
- Next Batch 1 target: `forge_step1_batch1_impl/19-out-of-scope-and-deferral-rules.md`
