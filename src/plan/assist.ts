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
    attempted: false,
    used: false,
    provider: null,
    warnings: [],
    ignoredEdits: [],
    reportNotes: [],
  };
}

function dependencyEditKey(edit: PlanAssistDependencyEdit): string {
  return `${edit.planItemId}:${edit.dependsOnPlanItemId}`;
}

function applyPlanItemEdits(
  model: PlanModel,
  edits: PlanAssistPlanItemEdit[],
  resolution: PlanAssistResolution,
): PlanModel["planItems"] {
  const editMap = new Map(edits.map((edit) => [edit.id, edit]));

  for (const edit of edits) {
    if (!model.planItems.some((item) => item.id === edit.id)) {
      resolution.ignoredEdits.push(`Ignored plan item edit for unknown id \`${edit.id}\`.`);
    }
  }

  return model.planItems.map((item) => {
    const edit = editMap.get(item.id);
    if (!edit) {
      return item;
    }

    return {
      ...item,
      title: normalizeOptionalText(edit.title) ?? item.title,
      description: normalizeOptionalText(edit.description) ?? item.description,
    };
  });
}

function applyDependencyEdits(
  model: PlanModel,
  edits: PlanAssistDependencyEdit[],
  resolution: PlanAssistResolution,
): {
  planItems: PlanModel["planItems"];
  dependencyGraph: PlanModel["dependencyGraph"];
} {
  const validKeys = new Set(model.dependencyGraph.map(dependencyEditKey));
  const editMap = new Map<string, PlanAssistDependencyEdit>();

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
        return edit
          ? { ...dependency, reason: edit.reason.trim() || dependency.reason }
          : dependency;
      }),
    })),
    dependencyGraph: model.dependencyGraph.map((dependency) => {
      const edit = editMap.get(dependencyEditKey(dependency));
      return edit
        ? { ...dependency, reason: edit.reason.trim() || dependency.reason }
        : dependency;
    }),
  };
}

function applyConflictZoneEdits(
  model: PlanModel,
  edits: PlanAssistConflictZoneEdit[],
  resolution: PlanAssistResolution,
): PlanModel["conflictZones"] {
  const editMap = new Map(edits.map((edit) => [edit.id, edit]));

  for (const edit of edits) {
    if (!model.conflictZones.some((zone) => zone.id === edit.id)) {
      resolution.ignoredEdits.push(`Ignored conflict-zone edit for unknown id \`${edit.id}\`.`);
    }
  }

  return model.conflictZones.map((zone) => {
    const edit = editMap.get(zone.id);
    return edit
      ? { ...zone, reason: normalizeOptionalText(edit.reason) ?? zone.reason }
      : zone;
  });
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
    const suggestion = await params.planningAssistHook({
      foundation: params.foundation,
      model: params.model,
    });

    if (!suggestion) {
      return {
        model: params.model,
        resolution,
      };
    }

    resolution.provider = suggestion.provider?.trim() || null;
    resolution.reportNotes = (suggestion.reportNotes ?? []).map((note) => note.trim()).filter(Boolean);

    const planItems = applyPlanItemEdits(params.model, suggestion.planItemEdits ?? [], resolution);
    const dependencyResult = applyDependencyEdits(
      {
        ...params.model,
        planItems,
      },
      suggestion.dependencyEdits ?? [],
      resolution,
    );
    const conflictZones = applyConflictZoneEdits(
      {
        ...params.model,
        planItems: dependencyResult.planItems,
        dependencyGraph: dependencyResult.dependencyGraph,
      },
      suggestion.conflictZoneEdits ?? [],
      resolution,
    );

    resolution.used =
      (suggestion.planItemEdits?.length ?? 0) > 0 ||
      (suggestion.dependencyEdits?.length ?? 0) > 0 ||
      (suggestion.conflictZoneEdits?.length ?? 0) > 0 ||
      resolution.reportNotes.length > 0;

    return {
      model: {
        ...params.model,
        planItems: dependencyResult.planItems,
        dependencyGraph: dependencyResult.dependencyGraph,
        conflictZones,
      },
      resolution,
    };
  } catch (error) {
    resolution.warnings = [
      `Planning assist failed and deterministic planning stayed authoritative: ${error instanceof Error ? error.message : "unknown planning assist failure"}.`,
    ];

    return {
      model: params.model,
      resolution,
    };
  }
}
