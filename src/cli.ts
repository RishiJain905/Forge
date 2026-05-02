import { createRequire } from "node:module";
import { Command } from "commander";
import { resolve } from "node:path";

import { initForge } from "./init.js";
import { runDoctor, printDoctorResults } from "./doctor/index.js";
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
import { checkForUpdate, selfUpdate } from "./update.js";
import {
  resolveConfig,
  getConfigValue,
  setConfigValue,
  unsetConfigValue,
  openInEditor,
} from "./config.js";
import { loadRepoDotenv } from "./repo-dotenv.js";

/** Resolved from dist/src/cli.js → package root (works under npm/npx symlinks). */
const requireFromCli = createRequire(import.meta.url);
const packageJson = requireFromCli("../../package.json") as { version: string };

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
  loadRepoDotenv(resolve(process.cwd()));

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
    .version(packageJson.version)
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
      "Loads repo-root `.env` when present. When a model is configured (env + `.forge/config.yaml`),\n" +
      "`run <id>` runs the AI pipeline (prompt → model → apply → completed). Otherwise workstreams stay in manual mode.\n" +
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

  program
    .command("init")
    .description("Initialize Forge in the current directory.")
    .option("--dir <path>", "Target directory.")
    .option("--yes", "Non-interactive, use defaults.")
    .option("--force", "Overwrite existing .forge/ directory.")
    .action(async (options: { dir?: string; yes?: boolean; force?: boolean }) => {
      try {
        await initForge(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        exitCode = 1;
      }
    });

  program
    .command("doctor")
    .description("Run pre-flight environment checks")
    .option("--fix", "Auto-fix what can be fixed")
    .option("--checks <list>", "Comma-separated list of checks to run (e.g., node,git,npm)")
    .action(async (options: { fix?: boolean; checks?: string }) => {
      const checkNames = options.checks
        ? options.checks.split(",").map((s: string) => s.trim())
        : undefined;

      const results = await runDoctor({
        fix: options.fix,
        checks: checkNames,
      });

      printDoctorResults(results);

      if (results.some((r) => r.status === "fail")) {
        exitCode = 1;
      }
    });

  program
    .command("config")
    .description("View and edit Forge configuration.")
    .option("--list", "List all configuration values")
    .option("--get <key>", "Get a specific config value by dot key")
    .option("--set <pair>", "Set a config value (key=value)")
    .option("--unset <key>", "Remove a config value")
    .option("--edit", "Open the config in $EDITOR")
    .action(async (options: {
      list?: boolean;
      get?: string;
      set?: string;
      unset?: string;
      edit?: boolean;
    }) => {
      try {
        const hasAction = options.get || options.set || options.unset || options.edit;
        if (!hasAction || options.list) {
          const { sources, values } = resolveConfig();
          const lines: string[] = [];
          const stack: Array<{ obj: unknown; prefix: string }> = [{ obj: values, prefix: "" }];
          while (stack.length > 0) {
            const { obj, prefix } = stack.pop()!;
            if (typeof obj !== "object" || obj === null) {
              const source = sources[prefix] ?? "unknown";
              lines.push(`${prefix}=${JSON.stringify(obj)} (${source})`);
              continue;
            }
            const keys = Object.keys(obj as Record<string, unknown>);
            for (let i = keys.length - 1; i >= 0; i--) {
              const k = keys[i];
              const path = prefix ? `${prefix}.${k}` : k;
              stack.push({ obj: (obj as Record<string, unknown>)[k], prefix: path });
            }
          }
          process.stdout.write(lines.join("\n") + "\n");
          return;
        }

        if (options.get) {
          const value = getConfigValue(options.get);
          if (value === undefined) {
            process.stderr.write(`Error: Key '${options.get}' not found.\n`);
            exitCode = 1;
            return;
          }
          process.stdout.write(`${JSON.stringify(value)}\n`);
          return;
        }

        if (options.set) {
          const idx = options.set.indexOf("=");
          if (idx === -1) {
            process.stderr.write("Error: --set must be in key=value format.\n");
            exitCode = 1;
            return;
          }
          const key = options.set.slice(0, idx);
          const raw = options.set.slice(idx + 1);
          let value: unknown = raw;
          try {
            value = JSON.parse(raw);
          } catch {
            // use raw string
          }
          setConfigValue(key, value);
          process.stdout.write(`Set ${key}=${JSON.stringify(value)}\n`);
          return;
        }

        if (options.unset) {
          unsetConfigValue(options.unset);
          process.stdout.write(`Unset ${options.unset}\n`);
          return;
        }

        if (options.edit) {
          openInEditor();
          return;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        exitCode = 1;
      }
    });

  program
    .command("update")
    .description("Check for updates and update Forge to the latest version")
    .option("--dry-run", "Show what would be updated without installing")
    .option("--yes", "Update without prompting")
    .action(async (options: { dryRun?: boolean; yes?: boolean }) => {
      try {
        if (options.dryRun) {
          const info = await checkForUpdate();
          if (info.outdated) {
            console.log(`Update available: ${info.current} → ${info.latest}`);
          } else {
            console.log(`Forge is up to date (${info.current}).`);
          }
          return;
        }
        await selfUpdate(options.yes);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        exitCode = 1;
      }
    });

  await program.parseAsync(argv, { from: "user" });

  return exitCode;
}
