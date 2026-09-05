import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

// Plain .js works here because this package is ESM ("type": "module"), unlike the
// CommonJS api-servers which need eslint.config.mjs.
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      // Vendored upstream source, not ours to lint.
      "Clawde_Code-main",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Ratchet rules: warnings, counted against --max-warnings in CI and lowered
      // over time. Everything else stays an error and fails immediately.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Deliberately NOT enabled here, unlike the api-servers: this is a terminal
      // app, so stdout is the product, not a logging shortcut.
      "no-console": "off",
    },
  },
  // Must stay last: turns off every stylistic rule that would fight prettier.
  prettier
);
