import { Command } from "commander";

import { runIntakeCommand } from "./intake/runner.js";
import type { IntakeCommandResult } from "./intake/types.js";
import { runPlanCommand } from "./plan/runner.js";
import type { PlanCommandResult } from "./plan/types.js";
import { runVerifyCommand } from "./verify/runner.js";
import type { VerifyCommandResult } from "./verify/types.js";

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function formatIntakeCommandOutput(result: IntakeCommandResult): string {
  const lines = [
    `Status: ${result.status}`,
    `Summary: ${result.summary}`,
    result.outputRoot ? `Output root: ${result.outputRoot}` : null,
    result.artifactPath ? `Artifact: ${result.artifactPath}` : null,
    result.reportPath ? `Report: ${result.reportPath}` : null,
    result.failure ? `Failure: [${result.failure.code}] ${result.failure.message}` : null,
  ].filter((line): line is string => Boolean(line));

  return `${lines.join("\n")}\n`;
}

export function formatPlanCommandOutput(result: PlanCommandResult): string {
  const lines = [
    `Status: ${result.status}`,
    `Summary: ${result.summary}`,
    result.outputRoot ? `Output root: ${result.outputRoot}` : null,
    result.artifactPath ? `Artifact: ${result.artifactPath}` : null,
    result.reportPath ? `Report: ${result.reportPath}` : null,
    result.failure ? `Failure: [${result.failure.code}] ${result.failure.message}` : null,
  ].filter((line): line is string => Boolean(line));

  return `${lines.join("\n")}\n`;
}

export function formatVerifyCommandOutput(result: VerifyCommandResult): string {
  const lines = [
    `Status: ${result.status}`,
    `Summary: ${result.summary}`,
    result.outputRoot ? `Output root: ${result.outputRoot}` : null,
    result.artifactPath ? `Artifact: ${result.artifactPath}` : null,
    result.reportPath ? `Report: ${result.reportPath}` : null,
    result.failure ? `Failure: [${result.failure.code}] ${result.failure.message}` : null,
  ].filter((line): line is string => Boolean(line));

  return `${lines.join("\n")}\n`;
}

export async function runCli(argv: string[]): Promise<number> {
  const program = new Command();
  const intakeFlagPresence = {
    jsonOnly: hasFlag(argv, "--json-only"),
    reportOnly: hasFlag(argv, "--report-only"),
    llmAssist: hasFlag(argv, "--llm-assist"),
    noLlm: hasFlag(argv, "--no-llm"),
    strictFocus: hasFlag(argv, "--strict-focus"),
    failOnLowConfidence: hasFlag(argv, "--fail-on-low-confidence"),
  };

  let exitCode = 0;

  program
    .name("forge")
    .description("Reliability-first CLI for agentic software development.")
    .showHelpAfterError();

  program
    .command("intake")
    .description("Run the Step 1 intake stage without modifying source files.")
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory. Defaults to .forge.",
    )
    .option("--spec <path>", "Read the task input from a markdown spec file.")
    .option("--prompt <text>", "Read the task input from an inline prompt.")
    .option("--notes <path>", "Read supplemental notes from a text or markdown file.")
    .option("--constraints <path>", "Read supplemental constraints from a text or markdown file.")
    .option("--config <path>", "Validate and record an intake config file path.")
    .option("--json-only", "Persist only the intake JSON artifact.")
    .option("--report-only", "Persist only the intake markdown report.")
    .option("--llm-assist", "Record that optional LLM assistance is desired when available.")
    .option("--no-llm", "Force deterministic intake behavior without optional LLM assistance.")
    .option("--strict-focus", "Constrain candidate targets to the provided focus paths.")
    .option(
      "--fail-on-low-confidence",
      "Escalate a low-confidence intake result to a failed run.",
    )
    .option(
      "--focus <path>",
      "Record a repo-relative focus file or directory. Repeat to provide multiple focus paths.",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .action(async (options: {
      repo?: string;
      outputDir?: string;
      spec?: string;
      prompt?: string;
      notes?: string;
      constraints?: string;
      config?: string;
      focus?: string[];
      jsonOnly?: boolean;
      reportOnly?: boolean;
      llmAssist?: boolean;
      llm?: boolean;
      strictFocus?: boolean;
      failOnLowConfidence?: boolean;
    }) => {
      const result = await runIntakeCommand({
        ...options,
        jsonOnly: intakeFlagPresence.jsonOnly,
        reportOnly: intakeFlagPresence.reportOnly,
        llmAssist: intakeFlagPresence.llmAssist,
        noLlm: intakeFlagPresence.noLlm,
        strictFocus: intakeFlagPresence.strictFocus,
        failOnLowConfidence: intakeFlagPresence.failOnLowConfidence,
      });

      const output = formatIntakeCommandOutput(result);

      if (result.status === "failed") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      process.stdout.write(output);
    });

  program
    .command("plan")
    .description("Run the Step 2 planning stage from the persisted Step 1 intake artifact.")
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory. Defaults to .forge.",
    )
    .action(async (options: {
      repo?: string;
      outputDir?: string;
    }) => {
      const result = await runPlanCommand(options);
      const output = formatPlanCommandOutput(result);

      if (result.status !== "ready") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      process.stdout.write(output);
    });

  program
    .command("verify")
    .description("Run the Step 3 verification stage from the persisted Step 2 plan artifact.")
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory. Defaults to .forge.",
    )
    .action(async (options: {
      repo?: string;
      outputDir?: string;
    }) => {
      const result = await runVerifyCommand(options);
      const output = formatVerifyCommandOutput(result);

      if (result.status !== "ready") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      process.stdout.write(output);
    });

  await program.parseAsync(argv, { from: "user" });

  return exitCode;
}
