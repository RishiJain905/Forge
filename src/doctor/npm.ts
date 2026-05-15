import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Check } from "./index.js";

const execFileAsync = promisify(execFile);

/** .cmd shims need the shell on Windows; bare `npm` + `shell: true` matches PowerShell. */
function npmExecOptions(extra: { timeout?: number }): { timeout?: number; shell?: boolean } {
  return process.platform === "win32"
    ? { ...extra, shell: true }
    : extra;
}

export const npmCheck: Check = {
  name: "npm",
  async run() {
    try {
      const { stdout } = await execFileAsync("npm", ["--version"], npmExecOptions({ timeout: 5000 }));
      const version = stdout.trim();

      return {
        name: "npm",
        status: "pass" as const,
        message: `npm ${version}`,
      };
    } catch {
      return {
        name: "npm",
        status: "fail" as const,
        message: "npm is not installed or not available in PATH.",
        fix: "Install Node.js (includes npm): https://nodejs.org/",
      };
    }
  },
};