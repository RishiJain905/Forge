import { Command } from "commander";

import { runIntakeCommand } from "./intake/runner.js";
import type { IntakeCommandResult } from "./intake/types.js";
import { runPlanCommand } from "./plan/runner.js";
import type { PlanCommandResult } from "./plan/types.js";
import { runSplitCommand } from "./split/runner.js";
import type { SplitCommandResult } from "./split/types.js";
import { runVerifyCommand } from "./verify/runner.js";
import type { VerifyCommandResult } from "./verify/types.js";
import { runExecuteCommand } from "./execute/cli.js";
import type { ExecuteCommandResult } from "./execute/types.js";
import { runIntegrateCommand } from "./integrate/cli.js";
import type { IntegrateCommandResult } from "./integrate/types.js";

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

export function formatSplitCommandOutput(result: SplitCommandResult): string {
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

export function formatExecuteCommandOutput(result: ExecuteCommandResult): string {
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

export function formatIntegrateCommandOutput(result: IntegrateCommandResult): string {
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

  program
    .command("split")
    .description("Run the Step 4 split stage from the persisted Step 3 verify artifact.")
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory for split outputs. Defaults to .forge.",
    )
    .action(async (options: {
      repo?: string;
      outputDir?: string;
    }) => {
      const result = await runSplitCommand(options);
      const output = formatSplitCommandOutput(result);

      if (result.status !== "ready") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      process.stdout.write(output);
    });

  program
    .command("execute")
    .description(
      "Run the Step 5 execute stage — track workstream execution interactively.\n" +
      "When AI context is available (plan.json, verify.json, and FORGE_MODEL_* env vars),\n" +
      "`run <id>` triggers the AI pipeline (prompt builder → model → apply → state transition).\n" +
      "Use --auto or FORGE_EXECUTE_AUTO=1 to auto-execute all unblocked workstreams."
    )
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory. Defaults to .forge.",
    )
    .option("--resume", "Resume from an existing execute.json state.")
    .option("--force", "Force a fresh start even if execute.json exists.")
    .option("--auto", "Auto-execute all unblocked workstreams in merge order (use FORGE_EXECUTE_AUTO env var to enable by default).")
    .action(async (options: {
      repo?: string;
      outputDir?: string;
      resume?: boolean;
      force?: boolean;
      auto?: boolean;
    }) => {
      const result = await runExecuteCommand(options);
      const output = formatExecuteCommandOutput(result);

      if (result.status !== "ready") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      if (result.exitCode !== undefined && result.exitCode !== 0) {
        exitCode = result.exitCode;
      }

      process.stdout.write(output);
    });

  program
    .command("integrate")
    .description(
      "Run the Step 6 integration stage — verify the whole system works together.\n" +
      "Generates integration tests via AI, runs them, and produces integrate.json\n" +
      "and integration-report.md. Requires execute.json from Step 5."
    )
    .option("--repo <path>", "Target repo root. Defaults to the current directory.")
    .option(
      "--output-dir <path>",
      "Custom repo-internal output directory. Defaults to .forge.",
    )
    .option("--force", "Force re-running integration even if integrate.json already exists.")
    .option("--auto", "Non-interactive mode: fail on any warning or error.")
    .option("--test-framework <name>", "Override the auto-detected test framework (e.g. jest, vitest, pytest).")
    .option("--json-only", "Only write integrate.json, skip integration-report.md")
    .option("--delay <seconds>", "Override retry delay in seconds for rate limit backoff", (val) => parseInt(val, 10))
    .option("--max-retries <n>", "Maximum retry attempts before freezing", (val) => parseInt(val, 10))
    .option("--max-duration <ms>", "Maximum duration in ms before freezing", (val) => parseInt(val, 10))
    .option("--max-concurrency <n>", "Max parallel test operations (default: 5)", (val) => parseInt(val, 10))
    .option("--no-color", "Disable color output")
    .action(async (options: {
      repo?: string;
      outputDir?: string;
      force?: boolean;
      auto?: boolean;
      jsonOnly?: boolean;
      testFramework?: string;
      delay?: number;
      maxRetries?: number;
      maxDuration?: number;
      maxConcurrency?: number;
      noColor?: boolean;
    }) => {
      // Validate numeric CLI options
      if (options.delay !== undefined && (!Number.isFinite(options.delay) || options.delay < 0)) {
        process.stderr.write("Error: --delay must be a non-negative number.\n");
        exitCode = 1;
        return;
      }
      if (options.maxRetries !== undefined && (!Number.isFinite(options.maxRetries) || options.maxRetries < 1)) {
        process.stderr.write("Error: --max-retries must be a positive number.\n");
        exitCode = 1;
        return;
      }
      if (options.maxDuration !== undefined && (!Number.isFinite(options.maxDuration) || options.maxDuration < 1)) {
        process.stderr.write("Error: --max-duration must be a positive number.\n");
        exitCode = 1;
        return;
      }
      if (options.maxConcurrency !== undefined && (!Number.isFinite(options.maxConcurrency) || options.maxConcurrency < 1)) {
        process.stderr.write("Error: --max-concurrency must be a positive number.\n");
        exitCode = 1;
        return;
      }

      const result = await runIntegrateCommand({
        ...options,
        maxDurationMs: options.maxDuration,
        noColor: options.noColor,
      });
      const output = formatIntegrateCommandOutput(result);

      if (result.status !== "ready") {
        process.stderr.write(output);
        exitCode = result.exitCode ?? 1;
        return;
      }

      if (result.exitCode !== undefined && result.exitCode !== 0) {
        exitCode = result.exitCode;
      }

      process.stdout.write(output);
    });

  await program.parseAsync(argv, { from: "user" });

  return exitCode;
}
