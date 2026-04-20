import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check } from "./index.js";

const execAsync = promisify(exec);

const TEST_URLS = [
  "https://api.openai.com/v1/models",
  "https://api.anthropic.com/v1/models",
];

export const networkCheck: Check = {
  name: "network",
  async run() {
    const results = await Promise.allSettled(
      TEST_URLS.map((url) =>
        execAsync(`curl -sf -o /dev/null -w "%{http_code}" "${url}"`, {
          timeout: 10000,
        })
      )
    );

    const reachable = results.filter(
      (r) => r.status === "fulfilled"
    ).length;

    if (reachable >= 1) {
      return {
        name: "network",
        status: "pass" as const,
        message: `${reachable}/${TEST_URLS.length} API endpoints reachable`,
      };
    }

    return {
      name: "network",
      status: "warn" as const,
      message: "No API endpoints reachable — network may be down or blocked",
    };
  },
};