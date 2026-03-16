import type { IntakeArtifact } from "./types.js";

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

export function createIntakeReport(artifact: IntakeArtifact): string {
  const failureSection = artifact.failure
    ? [
        "## Failure",
        "",
        `- Code: \`${artifact.failure.code}\``,
        `- Message: ${artifact.failure.message}`,
        artifact.failure.fallbackReason
          ? `- Fallback: ${artifact.failure.fallbackReason}`
          : "- Fallback: none",
      ].join("\n")
    : [
        "## Failure",
        "",
        "- none",
      ].join("\n");

  return [
    "# Forge Intake Report",
    "",
    `- Status: \`${artifact.status}\``,
    `- Command: \`${artifact.command}\``,
    `- Stage: \`${artifact.stage}\``,
    `- Repo root: \`${artifact.repoRoot}\``,
    `- Output root: \`${artifact.outputRoot}\``,
    "",
    "## Purpose",
    "",
    artifact.purpose,
    "",
    "## Boundary Notes",
    "",
    renderList(artifact.boundaryNotes),
    "",
    "## Deferred Capabilities",
    "",
    renderList([...artifact.writePolicy.deferredCapabilities]),
    "",
    "## Allowed Side Effects",
    "",
    renderList([...artifact.writePolicy.allowedSideEffects]),
    "",
    "## Disallowed Capabilities",
    "",
    renderList([...artifact.writePolicy.disallowedCapabilities]),
    "",
    "## Output Files",
    "",
    `- Artifact: \`${artifact.files.artifactPath}\``,
    `- Report: \`${artifact.files.reportPath}\``,
    "",
    "## Warnings",
    "",
    renderList(artifact.warnings),
    "",
    failureSection,
    "",
    "## Summary",
    "",
    artifact.summary,
    "",
  ].join("\n");
}
