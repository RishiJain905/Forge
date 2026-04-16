import type { ExecuteArtifact } from "./types.js";

function renderSection(title: string, lines: string[]): string {
  return ["", `## ${title}`, "", ...lines].join("\n");
}

function renderList(items: string[]): string {
  if (items.length === 0) return "- none";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function computeDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return "—";
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return formatDuration(ms);
}

function gateStatus(gate: { prerequisitesMet: boolean }): string {
  return gate.prerequisitesMet ? "satisfied" : "pending";
}

function buildWorkstreamRow(ws: {
  workstreamId: string;
  title: string;
  state: string;
  startedAt?: string;
  completedAt?: string;
}): string {
  const duration = computeDuration(ws.startedAt, ws.completedAt);
  const start = ws.startedAt ? new Date(ws.startedAt).toISOString().substring(11, 19) : "—";
  const end = ws.completedAt ? new Date(ws.completedAt).toISOString().substring(11, 19) : "—";
  return `| ${ws.workstreamId} | ${ws.title} | ${ws.state} | ${start} | ${end} | ${duration} |`;
}

function buildRecommendations(artifact: ExecuteArtifact): string[] {
  const { summary, workstreams } = artifact;
  if (summary.completed === summary.total && summary.failed === 0) {
    return ["All workstreams completed successfully. Ready to proceed to Step 6."];
  }
  const failed = workstreams.filter((ws) => ws.state === "failed");
  if (failed.length > 0) {
    return [
      `Rerun failed workstreams before proceeding to Step 6.`,
      `Failed workstreams: ${failed.map((ws) => ws.workstreamId).join(", ")}.`,
    ];
  }
  if (summary.blocked > 0 || summary.queued === summary.total) {
    return ["Check merge order constraints and unblock workstreams before proceeding."];
  }
  if (summary.running > 0) {
    return ["Execution still in progress. Wait for completion before proceeding."];
  }
  return ["Review execution state and determine next steps."];
}

export function createExecuteReport(artifact: ExecuteArtifact): string {
  const { summary, workstreams, mergeOrderGates, transitions } = artifact;

  // Overview
  const overviewLines: string[] = [
    `- Source: \`${artifact.splitSource}\``,
    `- Schema version: \`${artifact.schemaVersion}\``,
    `- Forge version: \`${artifact.forgeVersion}\``,
    `- Timestamp: \`${artifact.createdAt}\``,
    `- Workstream summary: **${summary.total}** total, **${summary.completed}** completed, **${summary.failed}** failed, **${summary.blocked}** blocked`,
  ];
  const overview = renderSection("Overview", overviewLines);

  // Execution Summary
  const execSummaryLines: string[] = [
    `- Queued: ${summary.queued}`,
    `- Running: ${summary.running}`,
    `- Completed: ${summary.completed}`,
    `- Failed: ${summary.failed}`,
    `- Blocked: ${summary.blocked}`,
  ];
  const execSummary = renderSection("Execution Summary", execSummaryLines);

  // Workstream Details
  let wsDetails: string;
  if (workstreams.length === 0) {
    wsDetails = renderSection("Workstream Details", ["- no workstreams"]);
  } else {
    const header = "| ID | Title | State | Started | Completed | Duration |\n|----|-------|-------|---------|-----------|----------|";
    const rows = workstreams.map(buildWorkstreamRow).join("\n");
    wsDetails = renderSection("Workstream Details", [header, rows]);
  }

  // Merge Order Gates
  let gatesSection: string;
  if (mergeOrderGates.length === 0) {
    gatesSection = renderSection("Merge Order Gates", ["- none"]);
  } else {
    const lines = mergeOrderGates.map(
      (gate) =>
        `- \`${gate.workstreamId}\` — prerequisites: [${gate.prerequisites.join(", ")}] — **${gateStatus(gate)}**`
    );
    gatesSection = renderSection("Merge Order Gates", lines);
  }

  // Errors
  const failedWorkstreams = workstreams.filter((ws) => ws.state === "failed");
  let errorsSection: string;
  if (failedWorkstreams.length === 0) {
    errorsSection = renderSection("Errors", ["- none"]);
  } else {
    const lines = failedWorkstreams.map(
      (ws) =>
        `- \`${ws.workstreamId}\` (${ws.title}): ${ws.error ?? "unknown error"}`
    );
    errorsSection = renderSection("Errors", lines);
  }

  // Recommendations
  const recommendations = renderSection("Recommendations", buildRecommendations(artifact));

  // Output Files
  const outputFiles = renderSection("Output Files", [
    `- \`execute.json\` — machine-readable artifact`,
    `- \`execute-report.md\` — this report`,
  ]);

  const body = [
    overview,
    execSummary,
    wsDetails,
    gatesSection,
    errorsSection,
    recommendations,
    outputFiles,
  ].join("\n");

  return `# Forge Execute Report\n${body}\n`;
}
