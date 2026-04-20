// ---------------------------------------------------------------------------
// Integrate step — human-readable report generator
// ---------------------------------------------------------------------------
// Produces a Markdown report from the IntegrateArtifact with sections for
// the goal, workstream summary, test results, individual test details,
// failure diagnostics, AI recommendations, and next-step guidance.
//
// Exported function:
//   createIntegrationReport(artifact) — returns a Markdown string
// ---------------------------------------------------------------------------

import type { IntegrateArtifact, IntegrationTestCase } from "./types.js";
import type { ErrorClassification } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Render a section heading (##) followed by lines. */
function renderSection(title: string, lines: string[]): string {
  return [`## ${title}`, "", ...lines].join("\n");
}

/** Render a Markdown list from items. */
function renderList(items: string[]): string {
  if (items.length === 0) return "- none";
  return items.map((item) => `- ${item}`).join("\n");
}

/** Format a duration in milliseconds to a human-readable string. */
function formatDuration(ms: number): string {
  if (ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Parse the workstreamsSummary string produced by buildWorkstreamsSummary.
 * Input format: "Total: X, Completed: Y, Failed: Z, Changes: W"
 * Returns an object with numeric values or undefined if parsing fails.
 */
function parseWorkstreamsSummary(
  summary: string
): { total: number; completed: number; failed: number; changes: number } | null {
  const totalMatch = summary.match(/Total:\s*(\d+)/);
  const completedMatch = summary.match(/Completed:\s*(\d+)/);
  const failedMatch = summary.match(/Failed:\s*(\d+)/);
  const changesMatch = summary.match(/Changes:\s*(\d+)/);

  if (!totalMatch || !completedMatch || !failedMatch || !changesMatch) {
    return null;
  }

  return {
    total: parseInt(totalMatch[1], 10),
    completed: parseInt(completedMatch[1], 10),
    failed: parseInt(failedMatch[1], 10),
    changes: parseInt(changesMatch[1], 10),
  };
}

/** Map an IntegrationTestState to a display icon. */
function statusIcon(status: string): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "skipped":
      return "⏭️";
    case "pending":
      return "⏳";
    default:
      return "❓";
  }
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

/** Render the top-level Overview section. */
function renderOverview(artifact: IntegrateArtifact): string {
  const lines = [
    `- **Date**: ${artifact.createdAt}`,
    `- **Goal**: ${artifact.goal}`,
    `- **AI Model**: ${artifact.summary.aiModelUsed}`,
    `- **Attempts**: ${artifact.attemptCount ?? 1}`,
    `- **Schema Version**: \`${artifact.schemaVersion}\``,
    `- **Forge Version**: \`${artifact.forgeVersion}\``,
  ];
  return renderSection("Overview", lines);
}

/** Render the How to Reproduce section. */
function renderHowToReproduce(): string {
  return renderSection("How to Reproduce", [
    "```bash",
    "forge integrate --repo .",
    "```",
  ]);
}

/** Render the Troubleshooting section. */
function renderTroubleshooting(artifact: IntegrateArtifact): string {
  const lines: string[] = [];
  if (artifact.summary.failed > 0) {
    lines.push(`- **${artifact.summary.failed} test(s) failed** — review individual test errors above`);
    lines.push("- Check that all workstream changes were applied correctly");
    lines.push("- Verify the test framework is correctly detected");
    lines.push("- Try `forge integrate --force` to re-run from scratch");
    lines.push("- Check `forge integrate --help` for available flags");
  } else {
    lines.push("- All tests passed — no troubleshooting needed");
  }
  return renderSection("Troubleshooting", lines);
}

/** Render the workstreams summary as a table. */
function renderWorkstreamsSummary(artifact: IntegrateArtifact): string {
  const parsed = parseWorkstreamsSummary(artifact.workstreamsSummary);

  if (parsed) {
    const header =
      "| Metric | Count |\n|--------|-------|";
    const rows = [
      `| Total | ${parsed.total} |`,
      `| Completed | ${parsed.completed} |`,
      `| Failed | ${parsed.failed} |`,
      `| Changes | ${parsed.changes} |`,
    ].join("\n");

    return renderSection("Workstreams Summary", [header, rows]);
  }

  // Fallback: render the raw string if parsing fails
  return renderSection("Workstreams Summary", [
    artifact.workstreamsSummary,
  ]);
}

/** Render the test results summary table. */
function renderTestResultsTable(artifact: IntegrateArtifact): string {
  const s = artifact.summary;

  const header =
    "| Metric | Value |\n|--------|-------|";
  const rows = [
    `| Passed | ${s.passed} |`,
    `| Failed | ${s.failed} |`,
    `| Skipped | ${s.skipped} |`,
    `| Duration | ${formatDuration(s.durationMs)} |`,
  ].join("\n");

  return renderSection("Test Results", [header, rows]);
}

/** Render the test files list with paths and test counts. */
function renderTestFiles(artifact: IntegrateArtifact): string {
  if (artifact.testFiles.length === 0) {
    return renderSection("Test Files", ["- none"]);
  }

  const header =
    "| Path | Tests | Language | Framework |\n|------|-------|----------|-----------|";
  const rows = artifact.testFiles
    .map((tf) => `| \`${tf.path}\` | ${tf.testCount} | ${tf.language} | ${tf.framework} |`)
    .join("\n");

  return renderSection("Test Files", [header, rows]);
}

/** Render individual test results with status icons. */
function renderIndividualResults(artifact: IntegrateArtifact): string {
  if (artifact.tests.length === 0) {
    return renderSection("Individual Test Results", ["- none"]);
  }

  const header =
    "| Status | ID | Name | Duration |\n|--------|----|------|----------|";
  const rows = artifact.tests
    .map((tc) => {
      const icon = statusIcon(tc.status);
      const duration = tc.durationMs != null ? formatDuration(tc.durationMs) : "—";
      return `| ${icon} ${tc.status} | ${tc.id} | ${tc.name} | ${duration} |`;
    })
    .join("\n");

  return renderSection("Individual Test Results", [header, rows]);
}

/** Render failed test errors in code blocks. */
function renderFailedTestErrors(artifact: IntegrateArtifact): string {
  const failed = artifact.tests.filter(
    (tc) => tc.status === "failed" && tc.error
  );

  if (failed.length === 0) {
    return renderSection("Failed Test Errors", ["- none"]);
  }

  const lines = failed.map((tc) => {
    const block = [
      `**${tc.name}** (\`${tc.id}\`)`,
      "",
      "```",
      tc.error!,
      "```",
    ].join("\n");
    return block;
  });

  return renderSection("Failed Test Errors", lines);
}

/** Render AI recommendations from failed tests. */
function renderAIRecommendations(artifact: IntegrateArtifact): string {
  // Collect recommendations from failed tests that have a recommendation field
  const failedWithRecs = artifact.tests.filter(
    (tc) =>
      tc.status === "failed" &&
      tc.recommendation &&
      tc.recommendation.trim().length > 0
  );

  // Also include artifact-level recommendations
  const allRecommendations: string[] = [];

  if (failedWithRecs.length > 0) {
    for (const tc of failedWithRecs) {
      allRecommendations.push(
        `**${tc.name}**: ${tc.recommendation}`
      );
    }
  }

  if (artifact.recommendations.length > 0) {
    for (const rec of artifact.recommendations) {
      // Avoid duplicating recommendations that are already included from test cases
      if (!allRecommendations.some((existing) => existing.endsWith(rec))) {
        allRecommendations.push(rec);
      }
    }
  }

  if (allRecommendations.length === 0) {
    return renderSection("AI Recommendations", ["- none"]);
  }

  return renderSection("AI Recommendations", [renderList(allRecommendations)]);
}

/** Render the Next Steps section with guidance based on pass/fail status. */
function renderNextSteps(artifact: IntegrateArtifact): string {
  const allPassed = artifact.summary.failed === 0 && artifact.summary.passed > 0;

  if (allPassed) {
    return renderSection("Next Steps", [
      "All integration tests passed. You may proceed with confidence:",
      "",
      "- Review the generated test files and consider committing them to the repository",
      "- Run `forge integrate` again if you make further changes to verify continued correctness",
      "- Proceed to the next step in the Forge pipeline",
    ]);
  }

  // Some failures exist
  const lines: string[] = [
    `${artifact.summary.failed} integration test(s) failed. Recommended actions:`,
    "",
    "- Review the **Failed Test Errors** section above for details on each failure",
    "- Follow the **AI Recommendations** for suggested fixes",
    "- Fix the underlying issues and re-run `forge integrate`",
  ];

  if (artifact.summary.skipped > 0) {
    lines.push(
      `- ${artifact.summary.skipped} test(s) were skipped — investigate whether they should be enabled`
    );
  }

  return renderSection("Next Steps", lines);
}

// ---------------------------------------------------------------------------
// createIntegrationReport
// ---------------------------------------------------------------------------

/**
 * Create a human-readable Markdown report from the IntegrateArtifact.
 *
 * Sections:
 *   1. Title — "Forge Integration Report"
 *   2. Overview — date, goal, AI model, schema/forge version
 *   3. How to Reproduce — command to reproduce the integration
 *   4. Workstreams Summary — table with total/completed/failed/changes
 *   5. Test Results — table with passed/failed/skipped/duration
 *   6. Test Files — list with paths, test counts, language, framework
 *   7. Individual Test Results — table with status icons (✅/❌/⏭️)
 *   8. Failed Test Errors — errors in code blocks
 *   9. AI Recommendations — from failed tests
 *  10. Troubleshooting — guidance based on pass/fail status
 *  11. Next Steps — guidance based on pass/fail status
 *
 * @param artifact  The validated IntegrateArtifact.
 * @returns A Markdown string representing the full report.
 */
export function createIntegrationReport(artifact: IntegrateArtifact): string {
  const sections = [
    renderOverview(artifact),
    "",
    renderHowToReproduce(),
    "",
    renderWorkstreamsSummary(artifact),
    "",
    renderTestResultsTable(artifact),
    "",
    renderTestFiles(artifact),
    "",
    renderIndividualResults(artifact),
    "",
    renderFailedTestErrors(artifact),
    "",
    renderAIRecommendations(artifact),
    "",
    renderTroubleshooting(artifact),
    "",
    renderNextSteps(artifact),
  ];

  return ["# Forge Integration Report", "", sections.join("\n\n"), ""].join("\n");
}

// ---------------------------------------------------------------------------
// createFrozenReport
// ---------------------------------------------------------------------------

/**
 * Create a human-readable Markdown report for a frozen integration.
 *
 * A frozen integration occurs when freeze criteria (e.g. max retries exceeded,
 * auth failure, parse failure) stop the retry loop before a successful AI
 * response is obtained. The report clearly marks the integration as frozen
 * and explains why, along with next-step guidance.
 *
 * @param artifact   The frozen IntegrateArtifact.
 * @param lastError  The ErrorClassification that triggered the freeze.
 * @returns A Markdown string representing the frozen report.
 */
export function createFrozenReport(
  artifact: IntegrateArtifact,
  lastError: ErrorClassification
): string {
  const parsed = parseWorkstreamsSummary(artifact.workstreamsSummary);

  // Build the workstreams table rows
  let workstreamsSection: string;
  if (parsed) {
    const header =
      "| Metric | Count |\n|--------|-------|";
    const rows = [
      `| Total | ${parsed.total} |`,
      `| Completed | ${parsed.completed} |`,
      `| Failed | ${parsed.failed} |`,
    ].join("\n");
    workstreamsSection = renderSection("Workstreams Summary", [header, rows]);
  } else {
    workstreamsSection = renderSection("Workstreams Summary", [
      artifact.workstreamsSummary,
    ]);
  }

  // Build the next steps section
  const nextStepsLines: string[] = [
    "The integration was frozen before tests could be generated. To resolve:",
    "",
    "- Address the issue described above and re-run `forge integrate`",
    "- Use `--force` to overwrite the frozen artifact",
  ];
  if (lastError.type === "rate_limit") {
    nextStepsLines.push("- Wait a few minutes for the rate limit to reset and try again");
  }

  const sections = [
    `**Date**: ${artifact.createdAt}`,
    `**Goal**: ${artifact.goal}`,
    `**Status**: ❌ INTEGRATION FROZEN`,
    `**Frozen At**: ${artifact.frozenAt ?? "unknown"}`,
    `**Attempts**: ${artifact.attemptCount ?? 0}`,
    "",
    `⚠️ **Integration was frozen** — not all tests could be verified.`,
    `**Final Error:** ${artifact.finalError ?? "Unknown"}`,
    "",
    renderSection("Reason for Freeze", [
      "```",
      artifact.finalError ?? "unknown error",
      "```",
    ]),
    "",
    renderSection("Suggestion", [
      lastError.suggestion,
    ]),
    "",
    workstreamsSection,
    "",
    renderSection("Next Steps", nextStepsLines),
    "",
    "*This integration was frozen and may be incomplete.*",
  ];

  return ["# Forge Integration Report — [FROZEN]", "", sections.join("\n\n"), ""].join("\n");
}
