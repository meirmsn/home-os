import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // react-hooks v7+ ships compiler-only rules (purity, immutability, etc.)
  // that fail with "definition not found" unless the React compiler is set up.
  // Register the plugin explicitly (Next.js config uses a legacy compat shim
  // that loses the rule definitions) and disable compiler-only rules.
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: { "react-hooks/purity": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
