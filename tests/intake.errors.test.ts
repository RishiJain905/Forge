import assert from "node:assert/strict";
import { extractErrorCode, hasErrorCode, IntakeError, RepoResolutionError, BoundaryPolicyError, PersistenceError } from "../src/intake/errors.js";

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

await runScenario("extractErrorCode returns the code from an IntakeError", () => {
  const error = new IntakeError("TEST_CODE", "Test message");
  assert.equal(extractErrorCode(error), "TEST_CODE");
});

await runScenario("extractErrorCode returns the code from a subclass of IntakeError", () => {
  const repoError = new RepoResolutionError("Test message");
  assert.equal(extractErrorCode(repoError), "REPO_RESOLUTION_FAILED");

  const boundaryError = new BoundaryPolicyError("Test message");
  assert.equal(extractErrorCode(boundaryError), "BOUNDARY_POLICY_VIOLATION");

  const persistenceError = new PersistenceError("Test message");
  assert.equal(extractErrorCode(persistenceError), "PERSISTENCE_FAILED");
});

await runScenario("extractErrorCode returns the code from a generic object with a code property", () => {
  assert.equal(extractErrorCode({ code: "CUSTOM_CODE" }), "CUSTOM_CODE");
});

await runScenario("extractErrorCode converts numeric codes to string", () => {
  assert.equal(extractErrorCode({ code: 404 }), "404");
  assert.equal(extractErrorCode({ code: 0 }), "0");
});

await runScenario("extractErrorCode handles symbol codes by converting to string", () => {
  assert.equal(extractErrorCode({ code: Symbol("TEST") }), "Symbol(TEST)");
});

await runScenario("extractErrorCode returns undefined for objects without a code property", () => {
  assert.equal(extractErrorCode({ message: "No code" }), undefined);
  assert.equal(extractErrorCode(new Error("Standard error")), undefined);
  assert.equal(extractErrorCode({}), undefined);
});

await runScenario("extractErrorCode returns undefined for primitives and null", () => {
  assert.equal(extractErrorCode(null), undefined);
  assert.equal(extractErrorCode(undefined), undefined);
  assert.equal(extractErrorCode("string error"), undefined);
  assert.equal(extractErrorCode(123), undefined);
  assert.equal(extractErrorCode(true), undefined);
  assert.equal(extractErrorCode(false), undefined);
  assert.equal(extractErrorCode(Symbol("error")), undefined);
});

await runScenario("hasErrorCode returns true if error matches code", () => {
  const error = new IntakeError("TARGET_CODE", "Test");
  assert.equal(hasErrorCode(error, "TARGET_CODE"), true);
  assert.equal(hasErrorCode({ code: "TARGET_CODE" }, "TARGET_CODE"), true);
});

await runScenario("hasErrorCode returns false if error does not match code", () => {
  const error = new IntakeError("OTHER_CODE", "Test");
  assert.equal(hasErrorCode(error, "TARGET_CODE"), false);
  assert.equal(hasErrorCode({ code: "OTHER_CODE" }, "TARGET_CODE"), false);
  assert.equal(hasErrorCode({ code: 123 }, "123"), true);
  assert.equal(hasErrorCode({ code: 123 }, "456"), false);
});

await runScenario("hasErrorCode returns false if error has no code", () => {
  assert.equal(hasErrorCode(new Error("No code"), "TARGET_CODE"), false);
  assert.equal(hasErrorCode({}, "TARGET_CODE"), false);
  assert.equal(hasErrorCode(null, "TARGET_CODE"), false);
  assert.equal(hasErrorCode("string error", "TARGET_CODE"), false);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
