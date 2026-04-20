import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check } from "./index.js";

const execAsync = promisify(exec);

export const npmCheck: Check = {
  name: "npm",
  async run() {
    try {
      const { stdout } = await execAsync("npm --version", { timeout: 5000 });
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