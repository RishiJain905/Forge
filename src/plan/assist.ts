import type {
  PlanAssistDependencyEdit,
  PlanAssistConflictZoneEdit,
  PlanAssistPlanItemEdit,
  PlanAssistResolution,
  PlanAssistSuggestion,
  PlanFoundationResult,
  PlanModel,
  PlanningAssistHook,
} from "./types.js";

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function createNoopResolution(): PlanAssistResolution {
  return {
    outcome: "not_attempted",
    attempted: false,
    used: false,
    provider: null,
    warnings: [],
    ignoredEdits: [],
    reportNotes: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReportNotes(value: unknown, resolution: PlanAssistResolution): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    resolution.warnings.push("Ignored malformed planning assist reportNotes payload.");
    return [];
  }

  const notes: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      resolution.warnings.push(`Ignored malformed planning assist report note at index ${index}.`);
      continue;
    }

    const note = value[index]
      .replace(/\r?\n|\r/g, " ")
      .trim();
    if (note) {
      notes.push(note);
    }
  }

  return notes;
}

function normalizePlanItemEdits(value: unknown, resolution: PlanAssistResolution): PlanAssistPlanItemEdit[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    resolution.warnings.push("Ignored malformed planning assist planItemEdits payload.");
    return [];
  }

  const edits: PlanAssistPlanItemEdit[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      resolution.ignoredEdits.push(`Ignored malformed plan item edit at index ${index}.`);
      continue;
    }

    const id = normalizeOptionalText(typeof entry.id === "string" ? entry.id : undefined);
    if (!id) {
      resolution.ignoredEdits.push(`Ignored malformed plan item edit at index ${index}.`);
      continue;
    }

    if (entry.title !== undefined && typeof entry.title !== "string") {
      resolution.ignoredEdits.push(`Ignored malformed plan item edit for \`${id}\` because title must be a string.`);
      continue;
    }

    if (entry.description !== undefined && typeof entry.description !== "string") {
      resolution.ignoredEdits.push(`Ignored malformed plan item edit for \`${id}\` because description must be a string.`);
      continue;
    }

    edits.push({
      id,
      ...(entry.title !== undefined ? { title: entry.title as string } : {}),
      ...(entry.description !== undefined ? { description: entry.description as string } : {}),
    });
  }

  return edits;
}

function normalizeDependencyEdits(value: unknown, resolution: PlanAssistResolution): PlanAssistDependencyEdit[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    resolution.warnings.push("Ignored malformed planning assist dependencyEdits payload.");
    return [];
  }

  const edits: PlanAssistDependencyEdit[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      resolution.ignoredEdits.push(`Ignored malformed dependency edit at index ${index}.`);
      continue;
    }

    const planItemId = normalizeOptionalText(
      typeof entry.planItemId === "string" ? entry.planItemId : undefined,
    );
    const dependsOnPlanItemId = normalizeOptionalText(
      typeof entry.dependsOnPlanItemId === "string" ? entry.dependsOnPlanItemId : undefined,
    );
    if (!planItemId || !dependsOnPlanItemId || typeof entry.reason !== "string") {
      resolution.ignoredEdits.push(`Ignored malformed dependency edit at index ${index}.`);
      continue;
    }

    edits.push({
      planItemId,
      dependsOnPlanItemId,
      reason: entry.reason,
    });
  }

  return edits;
}

function normalizeConflictZoneEdits(
  value: unknown,
  resolution: PlanAssistResolution,
): PlanAssistConflictZoneEdit[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    resolution.warnings.push("Ignored malformed planning assist conflictZoneEdits payload.");
    return [];
  }

  const edits: PlanAssistConflictZoneEdit[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      resolution.ignoredEdits.push(`Ignored malformed conflict-zone edit at index ${index}.`);
      continue;
    }

    const id = normalizeOptionalText(typeof entry.id === "string" ? entry.id : undefined);
    if (!id || typeof entry.reason !== "string") {
      resolution.ignoredEdits.push(`Ignored malformed conflict-zone edit at index ${index}.`);
      continue;
    }

    edits.push({
      id,
      reason: entry.reason,
    });
  }

  return edits;
}

function dependencyEditKey(edit: PlanAssistDependencyEdit): string {
  return `${edit.planItemId}:${edit.dependsOnPlanItemId}`;
}

function applyPlanItemEdits(
  model: PlanModel,
  edits: PlanAssistPlanItemEdit[],
  resolution: PlanAssistResolution,
): { planItems: PlanModel["planItems"]; appliedCount: number } {
  const editMap = new Map(edits.map((edit) => [edit.id, edit]));
  let appliedCount = 0;

  for (const edit of edits) {
    if (!model.planItems.some((item) => item.id === edit.id)) {
      resolution.ignoredEdits.push(`Ignored plan item edit for unknown id \`${edit.id}\`.`);
    }
  }

  const planItems = model.planItems.map((item) => {
    const edit = editMap.get(item.id);
    if (!edit) {
      return item;
    }

    const title = normalizeOptionalText(edit.title) ?? item.title;
    const description = normalizeOptionalText(edit.description) ?? item.description;
    if (title !== item.title || description !== item.description) {
      appliedCount += 1;
    }

    return {
      ...item,
      title,
      description,
    };
  });

  return { planItems, appliedCount };
}

function applyDependencyEdits(
  model: PlanModel,
  edits: PlanAssistDependencyEdit[],
  resolution: PlanAssistResolution,
): {
  planItems: PlanModel["planItems"];
  dependencyGraph: PlanModel["dependencyGraph"];
  appliedCount: number;
} {
  const validKeys = new Set(model.dependencyGraph.map(dependencyEditKey));
  const editMap = new Map<string, PlanAssistDependencyEdit>();
  let appliedCount = 0;

  for (const edit of edits) {
    const key = dependencyEditKey(edit);
    if (!validKeys.has(key)) {
      resolution.ignoredEdits.push(
        `Ignored dependency edit for unknown edge \`${edit.planItemId}\` -> \`${edit.dependsOnPlanItemId}\`.`,
      );
      continue;
    }

    editMap.set(key, edit);
  }

  return {
    planItems: model.planItems.map((item) => ({
      ...item,
      dependencies: item.dependencies.map((dependency) => {
        const edit = editMap.get(`${item.id}:${dependency.planItemId}`);
        const reason = edit?.reason.trim() || dependency.reason;
        if (reason !== dependency.reason) {
          appliedCount += 1;
        }

        return edit ? { ...dependency, reason } : dependency;
      }),
    })),
    dependencyGraph: model.dependencyGraph.map((dependency) => {
      const edit = editMap.get(dependencyEditKey(dependency));
      const reason = edit?.reason.trim() || dependency.reason;
      return edit ? { ...dependency, reason } : dependency;
    }),
    appliedCount,
  };
}

function applyConflictZoneEdits(
  model: PlanModel,
  edits: PlanAssistConflictZoneEdit[],
  resolution: PlanAssistResolution,
): { conflictZones: PlanModel["conflictZones"]; appliedCount: number } {
  const editMap = new Map(edits.map((edit) => [edit.id, edit]));
  let appliedCount = 0;

  for (const edit of edits) {
    if (!model.conflictZones.some((zone) => zone.id === edit.id)) {
      resolution.ignoredEdits.push(`Ignored conflict-zone edit for unknown id \`${edit.id}\`.`);
    }
  }

  const conflictZones = model.conflictZones.map((zone) => {
    const edit = editMap.get(zone.id);
    const reason = edit ? normalizeOptionalText(edit.reason) ?? zone.reason : zone.reason;
    if (reason !== zone.reason) {
      appliedCount += 1;
    }

    return edit ? { ...zone, reason } : zone;
  });

  return { conflictZones, appliedCount };
}

export async function applyPlanningAssist(params: {
  foundation: PlanFoundationResult;
  model: PlanModel;
  planningAssistHook?: PlanningAssistHook;
}): Promise<{ model: PlanModel; resolution: PlanAssistResolution }> {
  const resolution = createNoopResolution();

  if (!params.planningAssistHook) {
    return {
      model: params.model,
      resolution,
    };
  }

  resolution.attempted = true;

  try {
    const hookInput = structuredClone({
      foundation: params.foundation,
      model: params.model,
    });
    const rawSuggestion = await params.planningAssistHook({
      foundation: hookInput.foundation,
      model: hookInput.model,
    });

    if (!rawSuggestion) {
      resolution.outcome = "no_suggestion";
      return {
        model: params.model,
        resolution,
      };
    }

    if (!isRecord(rawSuggestion)) {
      resolution.outcome = "ignored_only";
      resolution.warnings = [
        "Ignored malformed planning assist payload and kept deterministic planning authoritative.",
      ];
      return {
        model: params.model,
        resolution,
      };
    }

    resolution.provider = typeof rawSuggestion.provider === "string"
      ? rawSuggestion.provider.trim() || null
      : null;
    if (rawSuggestion.provider !== undefined && typeof rawSuggestion.provider !== "string") {
      resolution.warnings.push("Ignored malformed planning assist provider value.");
    }
    resolution.reportNotes = normalizeReportNotes(rawSuggestion.reportNotes, resolution);

    const normalizedPlanItemEdits = normalizePlanItemEdits(rawSuggestion.planItemEdits, resolution);
    const normalizedDependencyEdits = normalizeDependencyEdits(rawSuggestion.dependencyEdits, resolution);
    const normalizedConflictZoneEdits = normalizeConflictZoneEdits(
      rawSuggestion.conflictZoneEdits,
      resolution,
    );

    const planItemResult = applyPlanItemEdits(params.model, normalizedPlanItemEdits, resolution);
    const dependencyResult = applyDependencyEdits(
      {
        ...params.model,
        planItems: planItemResult.planItems,
      },
      normalizedDependencyEdits,
      resolution,
    );
    const conflictZoneResult = applyConflictZoneEdits(
      {
        ...params.model,
        planItems: dependencyResult.planItems,
        dependencyGraph: dependencyResult.dependencyGraph,
      },
      normalizedConflictZoneEdits,
      resolution,
    );
    const appliedCount =
      planItemResult.appliedCount +
      dependencyResult.appliedCount +
      conflictZoneResult.appliedCount;
    resolution.used = appliedCount > 0 || resolution.reportNotes.length > 0;
    if (resolution.used) {
      resolution.outcome = "applied";
    } else if (resolution.ignoredEdits.length > 0 || resolution.warnings.length > 0) {
      resolution.outcome = "ignored_only";
    } else {
      resolution.outcome = "no_suggestion";
    }

    return {
      model: {
        ...params.model,
        planItems: dependencyResult.planItems,
        dependencyGraph: dependencyResult.dependencyGraph,
        conflictZones: conflictZoneResult.conflictZones,
      },
      resolution,
    };
  } catch (error) {
    resolution.outcome = "failed";
    resolution.warnings = [
      `Planning assist failed and deterministic planning stayed authoritative: ${error instanceof Error ? error.message : "unknown planning assist failure"}.`,
    ];

    return {
      model: params.model,
      resolution,
    };
  }
}
