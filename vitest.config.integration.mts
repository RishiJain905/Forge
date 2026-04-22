import { defineConfig } from "vitest/config";

/**
 * Used only by `forge integrate` for AI-generated integration tests.
 * `globals: true` matches typical model output (describe/it/expect without imports).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    // Never pick up compiled test output or build trees as test suites.
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-tests/**"],
  },
});
