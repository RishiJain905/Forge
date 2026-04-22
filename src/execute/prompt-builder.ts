import { promises as fs } from "fs";
import path from "node:path";

import type { SplitArtifact, SplitWorkstream } from "../split/types.js";
import type { PlanArtifact, PlanItem } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";

// ---------------------------------------------------------------------------
// Prompt size limits (override with FORGE_EXECUTE_* env vars)
// ---------------------------------------------------------------------------

function readExecuteInt(
  envName: string,
  defaultVal: number,
  min: number,
  max: number
): number {
  const raw = process.env[envName];
  if (raw === undefined || raw.trim() === "") {
    return defaultVal;
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return defaultVal;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * Per-file ceiling for embedded snippets (middle truncation).
 * Actual per-file budget is also limited by the total budget split across files.
 */
function getFileSnippetCharLimit(): number {
  return readExecuteInt("FORGE_EXECUTE_FILE_SNIPPET_CHARS", 1_200, 400, 100_000);
}

/**
 * Max characters for all target-file bodies combined (split evenly across files
 * that have content, then clamped per file by FORGE_EXECUTE_FILE_SNIPPET_CHARS).
 * Prevents many likelyAffectedPaths from producing 30k+ prompts by default.
 */
function getTotalFileSnippetsCharBudget(): number {
  return readExecuteInt("FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS", 5_000, 1_500, 500_000);
}

/** Max characters for workstream description and long prerequisite lines. */
function getTextFieldCharLimit(): number {
  return readExecuteInt("FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS", 400, 200, 50_000);
}

/** Max lines in the constraints block (conflict zones, findings, constraints). */
function getConstraintSectionLineLimit(): number {
  return readExecuteInt("FORGE_EXECUTE_CONSTRAINT_LINES_MAX", 14, 5, 500);
}

/** Max carried-forward concern bullets. */
function getConcernItemLimit(): number {
  return readExecuteInt("FORGE_EXECUTE_MAX_CONCERNS", 6, 1, 200);
}

/**
 * When set, shrink the assembled prompt by dropping text before `# Output` if needed,
 * so the `## CHANGES` / fenced-json contract always remains parseable.
 */
function getOptionalPromptMaxChars(): number | null {
  const raw = process.env.FORGE_EXECUTE_PROMPT_MAX_CHARS;
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 12_000) {
    return null;
  }
  return Math.min(2_000_000, n);
}

/**
 * Remove lines that are duplicates after whitespace-normalization (common when verify
 * repeats the same finding or constraint text).
 */
function dedupeNormalizedLines(
  lines: string[],
  warnings: string[],
  kind: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  const dropped = lines.length - out.length;
  if (dropped > 0) {
    warnings.push(`Omitted ${dropped} duplicate ${kind} line(s) in the execute prompt.`);
  }
  return out;
}

function applyOptionalPromptMaxChars(prompt: string, warnings: string[]): string {
  const maxChars = getOptionalPromptMaxChars();
  if (maxChars === null || prompt.length <= maxChars) {
    return prompt;
  }

  const anchor = "\n# Output\n";
  const idx = prompt.indexOf(anchor);
  if (idx === -1) {
    warnings.push(
      "FORGE_EXECUTE_PROMPT_MAX_CHARS is set but the expected \"# Output\" section was not found; prompt was not capped."
    );
    return prompt;
  }

  const invariantTail = prompt.slice(idx + 1);
  const note =
    "[Forge: earlier prompt sections were truncated — use .forge/plan.json, .forge/verify.json, and files on disk for full context.]\n\n";
  const noteLen = note.length;
  const headBudget = maxChars - invariantTail.length - noteLen - 8;
  if (headBudget < 500) {
    warnings.push(
      `FORGE_EXECUTE_PROMPT_MAX_CHARS=${maxChars} is very small; only part of the tail section is kept.`
    );
    return invariantTail.slice(0, maxChars);
  }

  const head = prompt.slice(0, idx);
  const trimmedHead =
    head.length > headBudget ? `${head.slice(0, headBudget)}\n…\n` : head;
  let next = note + trimmedHead + invariantTail;
  if (next.length > maxChars) {
    const trimMore = next.length - maxChars + 100;
    next =
      note +
      (head.length > headBudget + trimMore
        ? `${head.slice(0, headBudget - trimMore)}\n…\n`
        : trimmedHead) +
      invariantTail;
  }
  if (next.length > maxChars) {
    next = invariantTail.slice(0, maxChars);
  }
  warnings.push(
    `Whole execute prompt capped to ~${maxChars} chars (FORGE_EXECUTE_PROMPT_MAX_CHARS); about ${prompt.length - next.length} chars removed from sections before # Output.`
  );
  return next;
}

/**
 * Single-line clamp (whitespace collapsed) for bullets and titles in lists.
 */
function truncateOneLine(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Keep start + end of a file so the model sees structure; omit middle when over limit.
 */
export function truncateFileBodyForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const marker = `\n\n… [${text.length - maxChars} characters omitted from middle of file — see repo for full source] …\n\n`;
  const budget = maxChars - marker.length;
  if (budget < 200) {
    return `${text.slice(0, Math.max(0, maxChars - 50))}\n… [truncated]`;
  }
  const head = Math.floor(budget / 2);
  const tail = budget - head;
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}

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
 *
 * Prompt size: see FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS, FORGE_EXECUTE_FILE_SNIPPET_CHARS,
 * FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS, FORGE_EXECUTE_CONSTRAINT_LINES_MAX, FORGE_EXECUTE_MAX_CONCERNS,
 * FORGE_EXECUTE_PROMPT_MAX_CHARS (optional hard cap — preserves `# Output` / ## CHANGES instructions).
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
  const fileSection = buildFileSection(fileContents, warnings);

  const textLimit = getTextFieldCharLimit();
  const descNormalized = workstream.description.replace(/\s+/g, " ").trim();
  const descForPrompt = truncateOneLine(workstream.description, textLimit);
  if (descNormalized.length > textLimit) {
    warnings.push(
      "Workstream description was truncated for prompt size (FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS)."
    );
  }

  let prompt = assemblePrompt(
    workstream,
    descForPrompt,
    planItems,
    prerequisiteSection,
    constraintSection,
    concernSection,
    fileSection,
    ctx.repoRoot
  );

  prompt = applyOptionalPromptMaxChars(prompt, warnings);

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
  const lineMax = Math.min(400, getTextFieldCharLimit());
  const prereqs = workstream.mergeOrderRequirements;
  if (prereqs.length === 0) {
    return "None — this workstream has no merge order prerequisites.";
  }
  const lines: string[] = [];
  for (const prereqId of prereqs) {
    const prereqWs = splitArtifact.workstreams.find((w) => w.id === prereqId);
    if (prereqWs) {
      const prereqDescNorm = prereqWs.description.replace(/\s+/g, " ").trim();
      const detail = truncateOneLine(prereqWs.description, lineMax);
      if (prereqDescNorm.length > lineMax) {
        warnings.push(
          `Merge-order line for ${prereqId} truncated (prompt size limit).`
        );
      }
      lines.push(`- ${truncateOneLine(prereqWs.title, 120)} (${prereqId}): ${detail}`);
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
  const lineMax = Math.min(360, getTextFieldCharLimit());
  const maxLines = getConstraintSectionLineLimit();
  const affectedPaths = new Set(workstream.likelyAffectedPaths);
  const lines: string[] = [];

  // Conflict zones from plan that touch this workstream's files
  for (const zone of planArtifact.conflict_zones) {
    const touches = zone.paths.some((p) => affectedPaths.has(p));
    if (touches) {
      const line = `- CONFLICT ZONE: ${zone.title} — ${zone.reason} (risk: ${zone.riskLevel})`;
      lines.push(truncateOneLine(line, lineMax));
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
      const line = `- FINDING: ${finding.summary} (status: ${finding.status})`;
      lines.push(truncateOneLine(line, lineMax));
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
      const line = `- CONSTRAINT: ${constraint.summary}`;
      lines.push(truncateOneLine(line, lineMax));
    }
  }

  const deduped = dedupeNormalizedLines(lines, warnings, "constraint/finding");
  lines.length = 0;
  lines.push(...deduped);

  if (lines.length === 0) {
    return "No specific constraints detected for this workstream's files.";
  }

  if (lines.length > maxLines) {
    const dropped = lines.length - maxLines;
    warnings.push(
      `Constraint/finding list truncated (${dropped} lines omitted; FORGE_EXECUTE_CONSTRAINT_LINES_MAX).`
    );
    lines.length = maxLines;
    lines.push(
      `- … (${dropped} more items omitted — see .forge/plan.json and .forge/verify.json in the repo)`
    );
  }
  return lines.join("\n");
}

function buildConcernSection(
  workstream: SplitWorkstream,
  planArtifact: PlanArtifact,
  warnings: string[]
): string {
  const lineMax = Math.min(400, getTextFieldCharLimit());
  const maxConcerns = getConcernItemLimit();
  const planItemIds = new Set(workstream.sourcePlanItemIds);
  const concerns = planArtifact.carry_forward.concerns.filter((c) =>
    c.planItemIds.some((pid) => planItemIds.has(pid))
  );

  if (concerns.length === 0) {
    return "No carried-forward concerns apply to this workstream.";
  }

  const seenMsg = new Set<string>();
  const uniqueConcerns: typeof concerns = [];
  for (const c of concerns) {
    const key = c.message.replace(/\s+/g, " ").trim().toLowerCase();
    if (seenMsg.has(key)) {
      continue;
    }
    seenMsg.add(key);
    uniqueConcerns.push(c);
  }
  if (uniqueConcerns.length < concerns.length) {
    warnings.push(
      `Omitted ${concerns.length - uniqueConcerns.length} duplicate carried-forward concern(s) in the execute prompt.`
    );
  }

  const slice = uniqueConcerns.slice(0, maxConcerns);
  if (uniqueConcerns.length > maxConcerns) {
    warnings.push(
      `Carried-forward concerns truncated (${uniqueConcerns.length - maxConcerns} omitted; FORGE_EXECUTE_MAX_CONCERNS).`
    );
  }

  return slice
    .map((c) => {
      const raw = `- [${c.source}] ${c.message} (effects: ${c.effects.join(", ")})`;
      return truncateOneLine(raw, lineMax);
    })
    .join("\n");
}

function buildFileSection(
  fileContents: FileContentResult[],
  warnings: string[]
): string {
  const perFileCeiling = getFileSnippetCharLimit();
  const totalBudget = getTotalFileSnippetsCharBudget();
  const withContent = fileContents.filter((fc) => fc.content !== null);
  const n = withContent.length;
  const splitBudget =
    n > 0 ? Math.min(perFileCeiling, Math.floor(totalBudget / n)) : perFileCeiling;

  let truncatedFiles = 0;
  const sections = fileContents.map((fc) => {
    if (fc.content !== null) {
      const body = truncateFileBodyForPrompt(fc.content, splitBudget);
      if (body.length < fc.content.length) {
        truncatedFiles += 1;
      }
      return `FILE: ${fc.path}\n---\n${body}\n---`;
    }
    return `FILE: ${fc.path}\n---\n[FILE NOT FOUND — may need to be created]\n---`;
  });

  if (truncatedFiles > 0) {
    warnings.push(
      `${truncatedFiles} of ${n} target file(s) use truncated snippets (~${splitBudget} chars/file cap; total ${totalBudget} FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS, per-file ceiling ${perFileCeiling} FORGE_EXECUTE_FILE_SNIPPET_CHARS). Read files on disk for full source.`
    );
  } else if (n > 1 && splitBudget < perFileCeiling) {
    warnings.push(
      `File snippets split across ${n} paths (~${splitBudget} chars/file; FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS=${totalBudget}).`
    );
  }
  if (n > 0 && splitBudget < 250) {
    warnings.push(
      "Per-file snippet budget is very small; increase FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS or narrow likelyAffectedPaths."
    );
  }

  return sections.join("\n\n");
}

function assemblePrompt(
  workstream: SplitWorkstream,
  workstreamDescriptionForPrompt: string,
  planItems: PlanItem[],
  prerequisiteSection: string,
  constraintSection: string,
  concernSection: string,
  fileSection: string,
  repoRoot: string
): string {
  const titleLine = truncateOneLine(workstream.title, 120);
  const categoryInfo =
    planItems.length > 0
      ? planItems
          .map(
            (p) =>
              `  - ${p.id}: ${p.category}/${p.riskLevel} — ${truncateOneLine(p.title, 52)}`
          )
          .join("\n")
      : "  (none)";

  return `# Role
Senior engineer. Implement changes in the repo below; snippets are hints only.

# Workstream
Title: ${titleLine}
Task: ${workstreamDescriptionForPrompt}

Plan items:
${categoryInfo}

# Merge order (complete first)
${prerequisiteSection}

# Constraints (verify + plan)
${constraintSection}

# Concerns (plan carry-forward)
${concernSection}

# Target files (truncated snippets — read full files on disk)
${fileSection}

# Repo
${repoRoot}

# Output
Use heading ## CHANGES then a fenced block tagged json (parser requires this exact pattern):

## CHANGES
\`\`\`json
[{"file":"path/to/file.ext","action":"modify","content":"full new file body"}]
\`\`\`

# Rules
1. Only paths listed under Target files
2. Respect constraints; match local style
3. action delete → omit content`;
}