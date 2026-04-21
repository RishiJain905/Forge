import type { Check } from "./index.js";

export const nodeCheck: Check = {
  name: "node",
  async run() {
    const version = process.version;
    const major = parseInt(version.slice(1).split(".")[0], 10);

    if (major >= 20) {
      return {
        name: "node",
        status: "pass" as const,
        message: `Node.js ${version} (>=20 required)`,
      };
    }

    return {
      name: "node",
      status: "fail" as const,
      message: `Node.js ${version} is too old. >=20 required.`,
      fix: "Install Node.js 20 or later: https://nodejs.org/",
    };
  },
};