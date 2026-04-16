# Step 5 Batch 3 -- Task 1 Done

**Task:** AI Prompt Builder
**Agent:** GLM
**Completed:** 2025-04-16

## Files Created

- `src/execute/prompt-builder.ts` -- AI prompt builder module
- `tests/execute.ai-prompt-builder.test.ts` -- Unit tests for prompt builder (11 scenarios)

## Files Modified

- `package.json` -- Added `execute.ai-prompt-builder.test.js` to test script and `test:prompt-builder` convenience script

## What was built

### prompt-builder.ts

- `buildWorkstreamPrompt(ctx: PromptBuildContext): Promise<BuiltPrompt>` -- Main entry point, constructs a rich AI prompt per workstream
- `getTargetFileContents(paths, repoRoot, warnings): Promise<FileContentResult[]>` -- Reads file contents from disk, warns on missing files
- Internal helpers: `resolveWorkstream`, `resolvePlanItems`, `buildMergeOrderSection`, `buildConstraintSection`, `buildConcernSection`, `buildFileSection`, `assemblePrompt`

### Prompt Structure

Each prompt contains the following sections:
1. System Role -- "You are a skilled software engineer"
2. Workstream Description -- title, description, plan item context (category, risk level)
3. Merge Order Prerequisites -- prerequisite workstream titles and descriptions
4. Implementation Constraints -- conflict zones, findings, constraints from verify
5. Carried-Forward Concerns -- from plan carry_forward
6. Target Files -- current contents of all likelyAffectedPaths
7. Output Format -- JSON array with file, action, content
8. Safety Rules -- only modify listed files, respect constraints

### Error Handling

- Missing workstream ID: throws Error
- Missing file in likelyAffectedPaths: warning, not crash (content = null, FILE NOT FOUND in prompt)
- Missing plan item: warning, not crash
- Missing merge order prerequisite: warning, not crash

## Verification

- `npm run typecheck` -- PASS
- `npm run build` -- PASS
- `tests/execute.ai-prompt-builder.test.ts` -- 11/11 scenarios PASS
- `npm run test` -- ALL PASS (no regressions)