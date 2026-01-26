// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  ignores: ["src/generated/**"],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.node,
    parserOptions: {
      projectService: true,
    },
  },
  linterOptions: {
    reportUnusedInlineConfigs: "error",
  },
  extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
});
