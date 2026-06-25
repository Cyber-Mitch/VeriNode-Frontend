import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import colorThemePlugin from "./src/eslint-plugin-color-theme.mjs";

const DANGER_MESSAGE =
  "dangerouslySetInnerHTML is banned (stored-XSS risk). Render sanitized plain text with <SafeText> / sanitizeNodeField instead.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "color-theme": colorThemePlugin,
    },
    rules: {
      "color-theme/no-hardcoded-colors": "warn",
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: DANGER_MESSAGE },
        { selector: "Property[key.name='dangerouslySetInnerHTML']", message: DANGER_MESSAGE },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tests/**",
    "playwright.config.ts",
  ]),
]);

export default eslintConfig;
