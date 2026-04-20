import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check } from "./index.js";

const execAsync = promisify(exec);

export const gitCleanCheck: Check = {
  name: "gitClean",
  async run() {
    try {
      const { stdout } = await execAsync("git status --porcelain", {
        timeout: 5000,
      });

      const output = stdout.trim();

      if (output === "") {
        return {
          name: "gitClean",
          status: "pass" as const,
          message: "Working tree is clean",
        };
      }

      const fileCount = output.split("\n").filter(Boolean).length;
      return {
        name: "gitClean",
        status: "warn" as const,
        message: `Working tree has ${fileCount} modified/untracked file(s)`,
      };
    } catch {
      return {
        name: "gitClean",
        status: "warn" as const,
        message: "Could not determine git working tree status",
      };
    }
  },
};