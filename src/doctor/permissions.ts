import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Check } from "./index.js";

export const permissionsCheck: Check = {
  name: "permissions",
  async run() {
    const forgeDir = join(process.cwd(), ".forge");

    if (!existsSync(forgeDir)) {
      return {
        name: "permissions",
        status: "pass" as const,
        message: ".forge/ does not exist yet (will be created with correct permissions)",
      };
    }

    try {
      await access(forgeDir, constants.W_OK);
      return {
        name: "permissions",
        status: "pass" as const,
        message: ".forge/ is writable",
      };
    } catch {
      return {
        name: "permissions",
        status: "fail" as const,
        message: ".forge/ is not writable",
        fix: "Change permissions: chmod u+w .forge/",
      };
    }
  },
};