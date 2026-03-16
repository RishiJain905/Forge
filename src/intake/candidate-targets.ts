import type { CandidateTarget, RepoContext, ResolvedTaskSource } from "./types.js";

function buildCandidateTarget(
  path: string,
  kind: CandidateTarget["kind"],
  matchType: CandidateTarget["matchType"],
  reason: string,
): CandidateTarget {
  return {
    path,
    kind,
    matchType,
    reason,
  };
}

export function resolveCandidateTargets(
  taskSource: ResolvedTaskSource | null,
  repoContext: RepoContext,
): CandidateTarget[] {
  const text = taskSource?.rawText.toLowerCase() ?? "";
  const explicitTargets: CandidateTarget[] = [];

  for (const sourceFile of repoContext.sourceFiles) {
    if (text.includes(sourceFile.toLowerCase())) {
      explicitTargets.push(
        buildCandidateTarget(
          sourceFile,
          "source",
          "explicit",
          "Matched a source file path mentioned in the task input.",
        ),
      );
    }
  }

  for (const testFile of repoContext.testFiles) {
    if (text.includes(testFile.toLowerCase())) {
      explicitTargets.push(
        buildCandidateTarget(
          testFile,
          "test",
          "explicit",
          "Matched a test file path mentioned in the task input.",
        ),
      );
    }
  }

  if (explicitTargets.length > 0) {
    return explicitTargets;
  }

  const fallbackTargets: CandidateTarget[] = [];

  if (repoContext.sourceFiles.length > 0) {
    fallbackTargets.push(
      buildCandidateTarget(
        repoContext.sourceFiles[0],
        "source",
        "fallback",
        "Inferred a likely source target from the repo layout.",
      ),
    );
  }

  if (repoContext.testFiles.length > 0) {
    fallbackTargets.push(
      buildCandidateTarget(
        repoContext.testFiles[0],
        "test",
        "fallback",
        "Inferred a likely test target from the repo layout.",
      ),
    );
  }

  if (fallbackTargets.length > 0) {
    return fallbackTargets;
  }

  if (repoContext.manifestFiles.length > 0) {
    return [
      buildCandidateTarget(
        repoContext.manifestFiles[0],
        "manifest",
        "fallback",
        "Inferred a likely manifest target from the repo layout.",
      ),
    ];
  }

  return [];
}
