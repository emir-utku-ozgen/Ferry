import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test runner for lib/* and component-exported pure functions (SOW
 * Deliverable 2: "automated test suite" — none existed before this).
 * mock-anchor/ has its own, separate test setup (`node --test`, no new
 * dependency needed there) since it's a standalone package — see
 * mock-anchor/settlement.test.js.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", "mock-anchor/**", ".next/**"],
  },
});
