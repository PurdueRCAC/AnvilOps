// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  ignores: ["src/generated/**"],
  languageOptions: {
    ecmaVersion: 2024,
    globals: globals.node,
    parserOptions: {
      projectService: true,
    },
  },
  linterOptions: {
    reportUnusedInlineConfigs: "error",
  },
  rules: {
    "array-callback-return": "error",
    "preserve-caught-error": "warn",
    "no-await-in-loop": "warn",
    "no-control-regex": "error",
    "no-unassigned-vars": "error",
    "no-useless-assignment": "warn",
    "no-use-before-define": ["error", { functions: false }],
    "no-throw-literal": "error",
    "no-unused-expressions": "warn",
    "no-warning-comments": "warn",
    "default-case": "warn",
    "guard-for-in": "warn",
    "no-console": "error",
    "require-await": "warn",
  },
  extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
});
