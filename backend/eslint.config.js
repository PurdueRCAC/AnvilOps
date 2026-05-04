// @ts-check

import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  ignores: ["src/generated/prisma/**", "src/generated/openapi.ts"],
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
            from: "server",
            allow: ["services/index", "services/errors", "handlers", "env"],
          },
          {
            from: "db",
            allow: ["db/errors"],
          },
          {
            from: "handlers",
            allow: ["services"],
            importKind: "type",
          },
          {
            from: "handlers",
            allow: ["services/errors", "services/index", "express-utils"],
          },
          {
            from: "express-utils",
            allow: ["server", "handlers"],
            importKind: "type",
          },
          {
            from: "services",
            allow: ["db/errors", "services/errors", "lib"],
          },
          {
            from: ["lib", "handlers", "services"],
            allow: ["db"],
            importKind: "type",
          },
          {
            from: "services/index",
            allow: ["db", "services", "env"],
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
          {
            from: "jobs",
            allow: ["db", "services"],
          },
          {
            from: "index",
            allow: ["env", "db", "server", "services/index"],
          },
          {
            from: "test",
            allow: "*",
          },
        ],
      },
    ],
    "boundaries/no-private": "off",
  },
  extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
  settings: {
    "boundaries/elements": [
      // Modules that can only access the modules which are directly related.
      // Handlers -> Services -> DB
      { type: "services", pattern: "src/service/**" },
      { type: "db", pattern: "src/db/**" },
      { type: "handlers", pattern: "handlers/**" },
      { type: "lib", pattern: "lib/**" },
      // Jobs should be separate because some files have side effects that are undesirable in jobs (e.g. validating environment variables and throwing an error if they aren't present)
      { type: "jobs", pattern: "jobs/**" },
      // Exceptions to above:
      // - Error classes can be accessed between layers
      {
        type: "services/errors",
        pattern: "src/service/errors/index.ts",
        mode: "full",
      },
      { type: "db/errors", pattern: "src/db/errors/index.ts", mode: "full" },
      // - services/index.ts contains instances of all services with default dependencies
      { type: "services/index", pattern: "src/service/index.ts", mode: "full" },
      // Files that can be imported by anyone
      { type: "openapi", pattern: "src/generated/openapi.ts", mode: "full" },
      { type: "logger", pattern: "src/logger.ts", mode: "full" },
      // Files that shouldn't import any AnvilOps files
      { type: "prisma-generated", pattern: "src/generated/prisma/**" },
      {
        type: "prisma-configs",
        pattern: ["prisma/types.d.ts", "prisma.config.ts"],
        mode: "full",
      },
      {
        type: "otel-instrumentation",
        pattern: "src/instrumentation.ts",
        mode: "full",
      },
      // Separate package; should be accessed as "regclient-napi" instead of a direct file path
      { type: "regclient-napi", pattern: "regclient-napi/**" },
      // Web server entrypoint
      { type: "express-utils", pattern: "src/types.ts", mode: "full" },
      { type: "index", pattern: "src/index.ts", mode: "full" },
      { type: "server", pattern: "server/**" },
      // Environment variables
      { type: "env", pattern: "src/lib/env.ts", mode: "full" },
      // Vitest test files
      { type: "test", pattern: "test/**" },
    ],
  },
});
