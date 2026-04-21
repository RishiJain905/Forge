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
        execAsync(`curl -s -o /dev/null -w "%{http_code}" "${url}"`, {
          timeout: 10000,
        })
      )
    );

    let reachable = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        const httpCode = r.value.stdout.trim();
        // Any non-zero HTTP response code means the server responded
        // (e.g. 401, 403, 200 are all "reachable" — network works)
        if (httpCode !== "000") {
          reachable++;
        }
      }
    }

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