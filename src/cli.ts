import { Command } from "commander";

import { runIntakeCommand } from "./intake/runner.js";

export async function runCli(argv: string[]): Promise<number> {
  const program = new Command();

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
    .action(async (options: { repo?: string; outputDir?: string }) => {
      const result = await runIntakeCommand(options);

      const lines = [
        `Status: ${result.status}`,
        `Summary: ${result.summary}`,
        result.outputRoot ? `Output root: ${result.outputRoot}` : null,
        result.artifactPath ? `Artifact: ${result.artifactPath}` : null,
        result.reportPath ? `Report: ${result.reportPath}` : null,
      ].filter((line): line is string => Boolean(line));

      const output = `${lines.join("\n")}\n`;

      if (result.status === "failed") {
        process.stderr.write(output);
        exitCode = 1;
        return;
      }

      process.stdout.write(output);
    });

  await program.parseAsync(argv, { from: "user" });

  return exitCode;
}
