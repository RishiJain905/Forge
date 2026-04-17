import { promises as fs } from "fs";
import path from "node:path";

import type { SplitArtifact, SplitWorkstream } from "../split/types.js";
import type { PlanArtifact, PlanItem } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";

export interface PromptBuildContext {
  workstreamId: string;
  splitArtifact: SplitArtifact;
  planArtifact: PlanArtifact;
  verifyArtifact: VerifyArtifact;
  repoRoot: string;
}

export interface FileContentResult {
  path: string;
  content: string | null;
  warning: string | null;
}

export interface BuiltPrompt {
  prompt: string;
  warnings: string[];
  fileContents: FileContentResult[];
}

/**
 * Build a rich, structured AI prompt for a single workstream.
 *
 * Draws context from:
 * - split.json: workstream description, likelyAffectedPaths, mergeOrderRequirements
 * - plan.json: plan item category/risk, conflict zones, carried-forward concerns
 * - verify.json: findings, constraints
 *
 * Reads target file contents from disk (repoRoot + likelyAffectedPaths).
 * Missing files produce warnings instead of crashes.
 */
export async function buildWorkstreamPrompt(
  ctx: PromptBuildContext
): Promise<BuiltPrompt> {
  const warnings: string[] = [];
  const workstream = resolveWorkstream(
    ctx.workstreamId,
    ctx.splitArtifact,
    warnings
  );
  if (!workstream) {
    throw new Error(
      `Workstream ${ctx.workstreamId} not found in split artifact`
    );
  }

  const fileContents = await getTargetFileContents(
    workstream.likelyAffectedPaths,
    ctx.repoRoot,
    warnings
  );

  const planItems = resolvePlanItems(
    workstream.sourcePlanItemIds,
    ctx.planArtifact,
    warnings
  );
  const prerequisiteSection = buildMergeOrderSection(
    workstream,
    ctx.splitArtifact,
    warnings
  );
  const constraintSection = buildConstraintSection(
    workstream,
    ctx.verifyArtifact,
    ctx.planArtifact,
    warnings
  );
  const concernSection = buildConcernSection(
    workstream,
    ctx.planArtifact,
    warnings
  );
  const fileSection = buildFileSection(fileContents);

  const prompt = assemblePrompt(
    workstream,
    planItems,
    prerequisiteSection,
    constraintSection,
    concernSection,
    fileSection
  );

  return { prompt, warnings, fileContents };
}

/**
 * Read the current contents of all files listed in likelyAffectedPaths.
 * Missing files produce a warning — never throw.
 */
export async function getTargetFileContents(
  paths: string[],
  repoRoot: string,
  warnings: string[] = []
): Promise<FileContentResult[]> {
  const results: FileContentResult[] = [];
  for (const filePath of paths) {
    const absolutePath = path.resolve(repoRoot, filePath);
    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      results.push({ path: filePath, content, warning: null });
    } catch {
      const warning = `Warning: Could not read file ${filePath} — file may not exist yet`;
      warnings.push(warning);
      results.push({ path: filePath, content: null, warning });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveWorkstream(
  id: string,
  splitArtifact: SplitArtifact,
  warnings: string[]
): SplitWorkstream | null {
  const ws = splitArtifact.workstreams.find((w) => w.id === id);
  if (!ws) {
    warnings.push(`Workstream ${id} not found in split artifact`);
    return null;
  }
  return ws;
}

function resolvePlanItems(
  sourcePlanItemIds: string[],
  planArtifact: PlanArtifact,
  warnings: string[]
): PlanItem[] {
  const items: PlanItem[] = [];
  for (const pid of sourcePlanItemIds) {
    const item = planArtifact.plan_items.find((p) => p.id === pid);
    if (item) {
      items.push(item);
    } else {
      warnings.push(
        `Plan item ${pid} referenced by workstream not found in plan artifact`
      );
    }
  }
  return items;
}

function buildMergeOrderSection(
  workstream: SplitWorkstream,
  splitArtifact: SplitArtifact,
  warnings: string[]
): string {
  const prereqs = workstream.mergeOrderRequirements;
  if (prereqs.length === 0) {
    return "None — this workstream has no merge order prerequisites.";
  }
  const lines: string[] = [];
  for (const prereqId of prereqs) {
    const prereqWs = splitArtifact.workstreams.find((w) => w.id === prereqId);
    if (prereqWs) {
      lines.push(`- ${prereqWs.title} (${prereqId}): ${prereqWs.description}`);
    } else {
      warnings.push(
        `Merge order prerequisite ${prereqId} not found in split artifact`
      );
      lines.push(`- ${prereqId} (details not found)`);
    }
  }
  return lines.join("\n");
}

function buildConstraintSection(
  workstream: SplitWorkstream,
  verifyArtifact: VerifyArtifact,
  planArtifact: PlanArtifact,
  warnings: string[]
): string {
  const affectedPaths = new Set(workstream.likelyAffectedPaths);
  const lines: string[] = [];

  // Conflict zones from plan that touch this workstream's files
  for (const zone of planArtifact.conflict_zones) {
    const touches = zone.paths.some((p) => affectedPaths.has(p));
    if (touches) {
      lines.push(
        `- CONFLICT ZONE: ${zone.title} — ${zone.reason} (risk: ${zone.riskLevel})`
      );
    }
  }

  // Findings from verify that relate to this workstream's source plan items
  const planItemIds = new Set(workstream.sourcePlanItemIds);
  for (const finding of verifyArtifact.findings) {
    const case_ = verifyArtifact.verification_cases.find(
      (c) => c.id === finding.verification_case_id
    );
    if (
      case_ &&
      case_.sourcePlanItemIds.some((pid) => planItemIds.has(pid))
    ) {
      lines.push(`- FINDING: ${finding.summary} (status: ${finding.status})`);
    }
  }

  // Constraints from verify that relate to this workstream's source plan items
  for (const constraint of verifyArtifact.constraints) {
    const case_ = verifyArtifact.verification_cases.find(
      (c) => c.id === constraint.verification_case_id
    );
    if (
      case_ &&
      case_.sourcePlanItemIds.some((pid) => planItemIds.has(pid))
    ) {
      lines.push(`- CONSTRAINT: ${constraint.summary}`);
    }
  }

  if (lines.length === 0) {
    return "No specific constraints detected for this workstream's files.";
  }
  return lines.join("\n");
}

function buildConcernSection(
  workstream: SplitWorkstream,
  planArtifact: PlanArtifact,
  _warnings: string[]
): string {
  const planItemIds = new Set(workstream.sourcePlanItemIds);
  const concerns = planArtifact.carry_forward.concerns.filter((c) =>
    c.planItemIds.some((pid) => planItemIds.has(pid))
  );

  if (concerns.length === 0) {
    return "No carried-forward concerns apply to this workstream.";
  }
  return concerns
    .map(
      (c) =>
        `- [${c.source}] ${c.message} (effects: ${c.effects.join(", ")})`
    )
    .join("\n");
}

function buildFileSection(fileContents: FileContentResult[]): string {
  return fileContents
    .map((fc) => {
      if (fc.content !== null) {
        return `FILE: ${fc.path}\n---\n${fc.content}\n---`;
      }
      return `FILE: ${fc.path}\n---\n[FILE NOT FOUND — may need to be created]\n---`;
    })
    .join("\n\n");
}

function assemblePrompt(
  workstream: SplitWorkstream,
  planItems: PlanItem[],
  prerequisiteSection: string,
  constraintSection: string,
  concernSection: string,
  fileSection: string
): string {
  const categoryInfo =
    planItems.length > 0
      ? planItems
          .map(
            (p) => `  - ${p.title}: category=${p.category}, risk=${p.riskLevel}`
          )
          .join("\n")
      : "  (no plan item details available)";

  return `# System Role
You are a skilled software engineer implementing changes to a codebase.

# Workstream Description
Title: ${workstream.title}
Description: ${workstream.description}

Plan Item Context:
${categoryInfo}

# What Must Complete First (Merge Order)
${prerequisiteSection}

# Implementation Constraints (from Verify step)
CRITICAL CONSTRAINTS:
${constraintSection}

# Carried-Forward Concerns
${concernSection}

# Target Files
Below are the CURRENT contents of files you must modify:

${fileSection}

# Your Task
Based on the workstream description and constraints above, make the necessary changes to the target files.

# Output Format
Return your changes in the following format:

## CHANGES
\`\`\`json
[
  {
    "file": "path/to/file.ext",
    "action": "create" | "modify" | "delete",
    "content": "full new content (for create/modify)"
  }
]
\`\`\`

# Rules
1. Only modify files listed in "Target Files" above
2. Do not touch files outside the target files
3. Respect all constraints listed
4. Preserve existing code style and formatting
5. If a file must be deleted, indicate action: "delete" with no content`;
}