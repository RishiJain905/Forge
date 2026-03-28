import assert from "node:assert/strict";
import path from "node:path";
import { resolveOutputFilePath } from "../src/intake/path-policy.js";
import { BoundaryPolicyError } from "../src/intake/errors.js";

async function runScenario(name: string, scenario: () => void | Promise<void>): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await runScenario("resolveOutputFilePath happy path", () => {
  const root = "/fake/root";
  const result = resolveOutputFilePath(root, "subdir", "file.txt");
  assert.equal(result, path.resolve(root, "subdir", "file.txt"));
});

await runScenario("resolveOutputFilePath happy path - absolute inside root", () => {
  const root = "/fake/root";
  const result = resolveOutputFilePath(root, path.resolve(root, "subdir", "file.txt"));
  assert.equal(result, path.resolve(root, "subdir", "file.txt"));
});

await runScenario("resolveOutputFilePath edge case - root itself", () => {
  const root = "/fake/root";
  const result = resolveOutputFilePath(root, ".");
  assert.equal(result, path.resolve(root, "."));
});

await runScenario("resolveOutputFilePath boundary violation - outside root via relative path", () => {
  const root = "/fake/root";
  assert.throws(
    () => resolveOutputFilePath(root, "..", "outside.txt"),
    BoundaryPolicyError
  );
});

await runScenario("resolveOutputFilePath boundary violation - outside root via absolute path", () => {
  const root = "/fake/root";
  const outsidePath = "/fake/outside/file.txt";
  assert.throws(
    () => resolveOutputFilePath(root, outsidePath),
    BoundaryPolicyError
  );
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
