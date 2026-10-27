import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "next-env.d.ts",
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".cache/**",
    ".local/**",
    "tmp/pdfs/**",
  ]),
]);
