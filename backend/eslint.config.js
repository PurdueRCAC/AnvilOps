// @ts-check

import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  ignores: ["src/generated/prisma/**"],
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
  plugins: { boundaries },
  rules: {
    ...boundaries.configs.strict.rules,
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
    "@typescript-eslint/no-unused-vars": [
      "error",
      { ignoreRestSiblings: true },
    ],
    "boundaries/element-types": [
      "error",
      {
        // https://www.jsboundaries.dev/docs/setup/rules/
        default: "disallow",
        rules: [
          {
            from: "handlers",
            allow: ["services"],
            importKind: "type",
          },
          {
            from: "handlers",
            allow: ["services/errors", "express-utils"],
          },
          {
            from: "services",
            allow: ["db/errors", "lib"],
          },
          {
            from: "services",
            allow: ["db"],
            importKind: "type",
          },
          {
            from: "*",
            allow: ["openapi"],
            importKind: "type",
          },
          {
            from: "*",
            allow: ["logger"],
          },
          {
            from: ["db", "jobs"],
            allow: ["prisma-generated"],
          },
        ],
      },
    ],
  },
  extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
  settings: {
    "boundaries/elements": [
      { type: "services", pattern: "service/**" },
      { type: "services/errors", pattern: "service/errors/**" },
      { type: "db", pattern: "db/**" },
      { type: "db/errors", pattern: "db/errors/**" },
      { type: "jobs", pattern: "jobs/**" },
      { type: "handlers", pattern: "handlers/**" },
      { type: "lib", pattern: "lib/**" },
      { type: "openapi", pattern: "src/generated/openapi.ts", mode: "full" },
      { type: "prisma-generated", pattern: "src/generated/prisma/**" },
      { type: "regclient-napi", pattern: "regclient-napi/**" },
      { type: "express-utils", pattern: "src/types.ts", mode: "full" },
      { type: "logger", pattern: "src/logger.ts", mode: "full" },
      { type: "index", pattern: "src/index.ts", mode: "full" },
      {
        type: "prisma-configs",
        pattern: ["prisma/types.d.ts", "prisma.config.ts"],
        mode: "full",
      },
      // { type: "non-src", pattern: "!src/**", mode: "full" },
    ],
  },
});
