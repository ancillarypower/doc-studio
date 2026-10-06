import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Phase A keeps the artifact's code as-is, so only correctness rules fail CI; style findings warn.
export default tseslint.config(
  { ignores: ["dist", "reference", "src/pdf/**/*.js", "src/seal/**/*.js", "**/*.d.ts", "playwright-report", "test-results", "visual-report", "fixtures"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-undef": "off",
      "no-empty": "warn",
      "no-empty-pattern": "warn",
      "no-control-regex": "off",
      "no-useless-escape": "warn",
      "no-cond-assign": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
);
