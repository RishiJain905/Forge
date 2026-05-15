import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Check } from "./index.js";

const execFileAsync = promisify(execFile);

export const gitCleanCheck: Check = {
  name: "git-clean",
  async run() {
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
        timeout: 5000,
      });

      const output = stdout.trim();

      if (output === "") {
        return {
          name: "git-clean",
          status: "pass" as const,
          message: "Working tree is clean",
        };
      }

      const fileCount = output.split("\n").filter(Boolean).length;
      return {
        name: "git-clean",
        status: "warn" as const,
        message: `Working tree has ${fileCount} modified/untracked file(s)`,
      };
    } catch {
      return {
        name: "git-clean",
        status: "warn" as const,
        message: "Could not determine git working tree status",
      };
    }
  },
};