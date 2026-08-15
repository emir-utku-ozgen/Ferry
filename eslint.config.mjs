import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // mock-anchor/ is a deliberately separate, plain CommonJS Node tool
    // (see mock-anchor/README.md) — not part of the Next.js/TypeScript
    // app, so it isn't held to this config's TS-oriented rules.
    "mock-anchor/**",
  ]),
]);

export default eslintConfig;
