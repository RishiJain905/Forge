import assert from "node:assert/strict";

async function runScenario(name: string, scenario: () => Promise<void> | void): Promise<void> {
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
  "verification targets module exposes initial verification target detection",
  async () => {
    const moduleUrl = new URL("../src/intake/verification-targets.js", import.meta.url).href;
    const verificationTargetsModule = (await import(moduleUrl)) as Record<string, unknown>;

    assert.equal(
      typeof verificationTargetsModule.buildInitialVerificationTargets,
      "function",
      "expected verification-targets.ts to export buildInitialVerificationTargets",
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
