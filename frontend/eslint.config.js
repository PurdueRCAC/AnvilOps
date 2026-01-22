// @ts-check

import js from "@eslint/js";
import tailwindcss from "eslint-plugin-better-tailwindcss";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  ignores: ["dist"],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
    parserOptions: {
      projectService: true,
    },
  },
  settings: {
    "better-tailwindcss": {
      entryPoint: "src/index.css",
    },
  },
  rules: {
    "no-warning-comments": "warn",
    "default-case": "warn",
    "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    "better-tailwindcss/enforce-consistent-class-order": "off",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: {
          attributes: false, // Don't report errors for functions in JSX attributes that are expected to return `void` but actually return a Promise
        },
      },
    ],
    "react-refresh/only-export-components": "warn",
  },
  extends: [
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    reactPlugin.configs.flat.recommended,
    reactPlugin.configs.flat["jsx-runtime"],
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.vite,
    jsxA11y.flatConfigs.recommended,
    tailwindcss.configs.recommended,
  ],
});
