# Task 1: AI Prompt Builder

**Agent:** GLM
**Step:** 5.3.1

## Goal

Build the prompt-builder.ts module that constructs a rich, structured AI prompt for each workstream. The prompt draws from split.json, plan.json, and verify.json to give the AI model everything it needs to implement the workstream correctly.

## In Scope

- `src/execute/prompt-builder.ts` — new file
- Read `likelyAffectedPaths` from split.json workstream → read actual file contents from disk
- Read plan item context (requirement text, category, risk level) for each sourcePlanItemId
- Read verify constraints (conflict zones, findings, constraints, carried-forward concerns)
- Read merge order requirements for this workstream
- Build a structured prompt with clear sections: role, instructions, constraints, target files, expected output format
- Output format: structured JSON or markdown that the model-connector can parse
- Include explicit safety instructions: do not modify files outside likelyAffectedPaths, respect conflict zones
- Unit tests: `tests/execute.ai-prompt-builder.test.ts`

## Out of Scope

- Actually calling the AI model (that's task 2)
- Writing files to disk (that's task 2)
- CLI integration (that's task 3)
- Multi-agent coordination
- Concurrent prompt generation

## Task List

1. Read and understand `src/split/types.ts` — `SplitWorkstream`, `likelyAffectedPaths`, `mergeOrderRequirements`, `streamConstraintDetails`
2. Read and understand `src/plan/types.ts` — `PlanItem`, `requirement`, `category`, `riskLevel`
3. Read and understand `src/verify/types.ts` — `Finding`, `Constraint`, conflict zones
4. Design the prompt structure (sections: system role, workstream description, constraints, file contents, output format)
5. Implement `src/execute/prompt-builder.ts`:
   - `buildWorkstreamPrompt(workstreamId: string, splitArtifact, planArtifact, verifyArtifact): string`
   - `getTargetFileContents(paths: string[], repoRoot: string): Promise<Map<string, string>>`
   - `buildConstraintSection(streamConstraintDetail): string`
6. Add error handling: missing files, missing plan items, missing verify data
7. Write `tests/execute.ai-prompt-builder.test.ts`

## Prompt Structure

```
# System Role
You are a skilled software engineer implementing changes to a codebase.

# Workstream Description
Title: {title}
Description: {description}
Category: {category} (e.g., implementation, configuration, test)

# What Must Complete First (Merge Order)
Before this workstream can be considered complete, the following must be completed:
{list of prerequisite workstream titles and their descriptions}

# Implementation Constraints (from Verify step)
CRITICAL CONSTRAINTS:
{list each constraint/finding/conflict zone that applies to this workstream's files}

# Carried-Forward Concerns
{list any concerns from the planning phase that apply}

# Target Files
Below are the CURRENT contents of files you must modify:

FILE: {path}
---
{current contents}
---

# Your Task
Based on the workstream description and constraints above, make the necessary changes to the target files.

# Output Format
Return your changes in the following format:

## CHANGES
```json
[
  {
    "file": "path/to/file.ext",
    "action": "create" | "modify" | "delete",
    "content": "full new content (for create/modify)"
  }
]
```

# Rules
1. Only modify files listed in "Target Files" above
2. Do not touch files outside the target files
3. Respect all constraints listed
4. Preserve existing code style and formatting
5. If a file must be deleted, indicate action: "delete" with no content
```

## Acceptance Criteria

- [ ] `prompt-builder.ts` exists and exports `buildWorkstreamPrompt`
- [ ] Prompt includes workstream title, description, category
- [ ] Prompt includes merge order prerequisites with their descriptions
- [ ] Prompt includes all applicable constraints from verify (conflict zones, findings, constraints)
- [ ] Prompt includes carried-forward concerns from plan
- [ ] Prompt includes current file contents for all `likelyAffectedPaths`
- [ ] Prompt specifies JSON output format with file, action, content fields
- [ ] Missing file in `likelyAffectedPaths` produces a warning, not a crash
- [ ] Missing plan item produces a warning, not a crash
- [ ] Unit tests pass: `npm run test -- --grep "prompt-builder"`
- [ ] TypeScript compiles: `npm run typecheck`
