import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import css from "@eslint/css";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // The build output is generated code.
  globalIgnores(["dist/"]),
  // JavaScript and Vue. The Vue config goes inside `extends` so this block's `files` applies to it
  // too: listed on its own it has no file filter, so its rules also run on CSS files and crash there.
  {
    files: ["**/*.{js,mjs,cjs,vue}"],
    plugins: { js },
    extends: ["js/recommended", pluginVue.configs["flat/essential"]],
    languageOptions: { globals: globals.browser },
  },
  // The tests and the tool configs run in Node.
  { files: ["tests/**/*.js", "*.config.js"], languageOptions: { globals: globals.node } },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);
