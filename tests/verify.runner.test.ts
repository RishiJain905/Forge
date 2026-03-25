import assert from "node:assert/strict";

async function runScenario(name: string, scenario: () => Promise<void>): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await runScenario(
  "verify runner exposes a public command execution entrypoint for Step 3",
  async () => {
    const runnerModule = await import("../src/verify/runner.js");
    const runVerifyCommand = (runnerModule as Record<string, unknown>).runVerifyCommand;

    assert.equal(typeof runVerifyCommand, "function");
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
