import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "Past versions",
    "coverage",
    "esbuild.config.mjs",
    "main.js",
    "tests/mobile-harness.js",
    "package-lock.json",
    "versions.json",
  ]),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mts", "manifest.json"],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["tests/chat-browser-regression.cjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, plugin: "readonly", leaf: "readonly", file: "readonly", chat: "readonly", draw: "readonly", append: "readonly", settle: "readonly" },
      parserOptions: { projectService: false },
    },
    // Standalone Node browser fixture, never included in the Obsidian bundle.
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/no-static-styles-assignment": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
);
