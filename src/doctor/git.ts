import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./index.js";

const execFileAsync = promisify(execFile);

export const gitCheck: Check = {
  name: "git",
  async run() {
    try {
      const { stdout } = await execFileAsync("git", ["--version"], { timeout: 5000 });
      const version = stdout.trim();

      if (existsSync(join(process.cwd(), ".git"))) {
        return {
          name: "git",
          status: "pass" as const,
          message: `${version}`,
        };
      }

      return {
        name: "git",
        status: "warn" as const,
        message: `${version} — not inside a git repository`,
      };
    } catch {
      return {
        name: "git",
        status: "fail" as const,
        message: "Git is not installed or not available in PATH.",
        fix: "Install Git: https://git-scm.com/",
      };
    }
  },
};