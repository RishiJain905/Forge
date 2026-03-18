import type {
  CandidateTarget,
  InitialVerificationTarget,
} from "./types.js";

function toVerificationReason(target: CandidateTarget): string {
  if (target.kind === "test") {
    return "Initial test surface related to the requested change.";
  }

  if (target.kind === "manifest") {
    return "Configuration or manifest surface that may constrain later verification.";
  }

  return "Initial code surface to inspect before later verification work.";
}

export function buildInitialVerificationTargets(
  candidateTargets: CandidateTarget[],
): InitialVerificationTarget[] {
  const seen = new Set<string>();
  const targets: InitialVerificationTarget[] = [];

  for (const candidateTarget of candidateTargets) {
    const key = `${candidateTarget.kind}:${candidateTarget.path}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    targets.push({
      path: candidateTarget.path,
      kind: candidateTarget.kind,
      reason: toVerificationReason(candidateTarget),
    });
  }

  return targets;
}
