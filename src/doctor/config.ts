import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import type { Check } from "./index.js";

export const configCheck: Check = {
  name: "config",
  async run() {
    const yamlPath = join(process.cwd(), ".forge", "config.yaml");
    const tsPath = join(process.cwd(), ".forge", "forge.config.ts");

    if (existsSync(yamlPath)) {
      try {
        const content = readFileSync(yamlPath, "utf8");
        load(content);
        return {
          name: "config",
          status: "pass" as const,
          message: ".forge/config.yaml is valid",
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          name: "config",
          status: "fail" as const,
          message: `.forge/config.yaml is invalid: ${message}`,
          fix: "Fix the YAML syntax in .forge/config.yaml or run 'forge init' to regenerate.",
        };
      }
    }

    if (existsSync(tsPath)) {
      return {
        name: "config",
        status: "pass" as const,
        message: ".forge/forge.config.ts found",
      };
    }

    return {
      name: "config",
      status: "warn" as const,
      message: "No configuration file found (.forge/config.yaml or .forge/forge.config.ts)",
      fix: "Run 'forge init' to create a config file.",
    };
  },
};