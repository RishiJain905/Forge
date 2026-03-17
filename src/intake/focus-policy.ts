import type { CandidateTarget } from "./types.js";

export const NON_STRICT_FOCUS_WARNING =
  "Focus paths do not cover all likely targets, so candidate targeting keeps out-of-focus evidence available but prioritizes the focused paths.";

export const STRICT_FOCUS_WARNING =
  "Strict focus excluded likely relevant candidate targets outside the provided focus paths.";

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function normalizeFocusPath(value: string): string {
  const normalized = normalizePathForComparison(value);
  return normalized.length > 0 ? normalized : ".";
}

function isTargetInFocus(targetPath: string, focusPaths: string[]): boolean {
  const normalizedTargetPath = normalizePathForComparison(targetPath);

  for (const rawFocusPath of focusPaths) {
    const normalizedFocusPath = normalizeFocusPath(rawFocusPath);

    if (normalizedFocusPath === ".") {
      return true;
    }

    if (
      normalizedTargetPath === normalizedFocusPath ||
      normalizedTargetPath.startsWith(`${normalizedFocusPath}/`)
    ) {
      return true;
    }
  }

  return false;
}

export interface FocusTargetingResolution {
  candidateTargets: CandidateTarget[];
  warnings: string[];
  signals: {
    focusApplied: boolean;
    strictFocusApplied: boolean;
    focusMatchedTargetCount: number;
    outOfFocusTargetCount: number;
  };
}

export function resolveFocusTargeting(params: {
  candidateTargets: CandidateTarget[];
  focusPaths: string[];
  strictFocus: boolean;
}): FocusTargetingResolution {
  const focusApplied = params.focusPaths.length > 0;

  if (!focusApplied) {
    return {
      candidateTargets: [...params.candidateTargets],
      warnings: [],
      signals: {
        focusApplied: false,
        strictFocusApplied: params.strictFocus,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
    };
  }

  const inFocusTargets: CandidateTarget[] = [];
  const outOfFocusTargets: CandidateTarget[] = [];

  for (const candidateTarget of params.candidateTargets) {
    if (isTargetInFocus(candidateTarget.path, params.focusPaths)) {
      inFocusTargets.push(candidateTarget);
      continue;
    }

    outOfFocusTargets.push(candidateTarget);
  }

  const warnings: string[] = [];
  const candidateTargets = params.strictFocus
    ? [...inFocusTargets]
    : [...inFocusTargets, ...outOfFocusTargets];

  if (outOfFocusTargets.length > 0) {
    warnings.push(
      params.strictFocus
        ? STRICT_FOCUS_WARNING
        : NON_STRICT_FOCUS_WARNING,
    );
  }

  return {
    candidateTargets,
    warnings,
    signals: {
      focusApplied: true,
      strictFocusApplied: params.strictFocus,
      focusMatchedTargetCount: inFocusTargets.length,
      outOfFocusTargetCount: outOfFocusTargets.length,
    },
  };
}
