import { AuditFinding, GitIgnoreRequirement } from "../../core/auditContract.js";
import { RawLintFileReport, RawLintMessage } from "../../core/reportUtils.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_oxlint.d.ts
export declare const OXLINT_RULES: readonly ["oxlint-violation"];
export type OxlintRuleId = (typeof OXLINT_RULES)[number];
export type RawOxlintMessage = RawLintMessage;
export type RawOxlintFileReport = RawLintFileReport;
export interface OxlintDiagnostic {
  message: string;
  code?: string;
  severity?: string;
  filename?: string;
  labels?: Array<{
    span?: {
      line?: number;
      column?: number;
      offset?: number;
      length?: number;
    };
  }>;
}
export interface OxlintJsonReport {
  diagnostics?: OxlintDiagnostic[];
  number_of_files?: number;
  number_of_rules?: number;
}
export declare const OXLINT_FIXABLE_RULES_LIST: readonly ["arrow-body-style", "capitalized-comments", "curly", "func-names", "no-array-constructor", "no-compare-neg-zero", "no-div-regex", "no-else-return", "no-extra-boolean-cast", "no-extra-label", "no-implicit-coercion", "no-negated-condition", "no-new-wrappers", "no-regex-spaces", "no-unsafe-negation", "no-unused-labels", "no-useless-computed-key", "no-useless-escape", "no-useless-rename", "no-var", "object-shorthand", "one-var", "prefer-arrow-callback", "prefer-const", "prefer-destructuring", "prefer-exponentiation-operator", "prefer-numeric-literals", "prefer-object-has-own", "prefer-object-spread", "prefer-spread", "prefer-template", "preserve-caught-error", "sort-imports", "sort-keys", "sort-vars", "unicode-bom", "use-isnan", "valid-typeof", "yoda", "array-type", "ban-ts-comment", "ban-tslint-comment", "consistent-generic-constructors", "consistent-indexed-object-style", "consistent-type-assertions", "consistent-type-exports", "consistent-type-imports", "dot-notation", "explicit-member-accessibility", "no-confusing-void-expression", "no-duplicate-type-constituents", "no-explicit-any", "no-extra-non-null-assertion", "no-import-type-side-effects", "no-meaningless-void-operator", "no-restricted-types", "no-unnecessary-boolean-literal-compare", "no-unnecessary-template-expression", "no-unnecessary-type-arguments", "no-unnecessary-type-assertion", "no-useless-empty-export", "no-wrapper-object-types", "prefer-as-const", "prefer-function-type", "prefer-includes", "prefer-namespace-keyword", "prefer-nullish-coalescing", "prefer-readonly", "prefer-reduce-type-parameter", "prefer-return-this-type", "prefer-string-starts-ends-with", "prefer-ts-expect-error", "promise-function-async", "return-await", "@typescript-eslint/array-type", "@typescript-eslint/ban-ts-comment", "@typescript-eslint/ban-tslint-comment", "@typescript-eslint/consistent-generic-constructors", "@typescript-eslint/consistent-indexed-object-style", "@typescript-eslint/consistent-type-assertions", "@typescript-eslint/consistent-type-exports", "@typescript-eslint/consistent-type-imports", "@typescript-eslint/dot-notation", "@typescript-eslint/explicit-member-accessibility", "@typescript-eslint/no-confusing-void-expression", "@typescript-eslint/no-duplicate-type-constituents", "@typescript-eslint/no-explicit-any", "@typescript-eslint/no-extra-non-null-assertion", "@typescript-eslint/no-import-type-side-effects", "@typescript-eslint/no-meaningless-void-operator", "@typescript-eslint/no-restricted-types", "@typescript-eslint/no-unnecessary-boolean-literal-compare", "@typescript-eslint/no-unnecessary-template-expression", "@typescript-eslint/no-unnecessary-type-arguments", "@typescript-eslint/no-unnecessary-type-assertion", "@typescript-eslint/no-useless-empty-export", "@typescript-eslint/no-wrapper-object-types", "@typescript-eslint/prefer-as-const", "@typescript-eslint/prefer-function-type", "@typescript-eslint/prefer-includes", "@typescript-eslint/prefer-namespace-keyword", "@typescript-eslint/prefer-nullish-coalescing", "@typescript-eslint/prefer-readonly", "@typescript-eslint/prefer-reduce-type-parameter", "@typescript-eslint/prefer-return-this-type", "@typescript-eslint/prefer-string-starts-ends-with", "@typescript-eslint/prefer-ts-expect-error", "@typescript-eslint/promise-function-async", "@typescript-eslint/return-await", "unicorn/catch-error-name", "unicorn/consistent-assert", "unicorn/consistent-date-clone", "unicorn/consistent-existence-index-check", "unicorn/consistent-template-literal-escape", "unicorn/empty-brace-spaces", "unicorn/escape-case", "unicorn/explicit-length-check", "unicorn/explicit-timer-delay", "unicorn/no-console-spaces", "unicorn/no-hex-escape", "unicorn/no-instanceof-array", "unicorn/no-length-as-slice-end", "unicorn/no-negated-condition", "unicorn/no-nested-ternary", "unicorn/no-single-promise-in-promise-methods", "unicorn/no-typeof-undefined", "unicorn/no-unnecessary-array-splice-count", "unicorn/no-unnecessary-await", "unicorn/no-unnecessary-slice-end", "unicorn/no-useless-fallback-in-spread", "unicorn/no-useless-iterator-to-array", "unicorn/no-useless-promise-resolve-reject", "unicorn/no-useless-undefined", "unicorn/no-zero-fractions", "unicorn/number-literal-case", "unicorn/numeric-separators-style", "unicorn/prefer-array-flat-map", "unicorn/prefer-bigint-literals", "unicorn/prefer-class-fields", "unicorn/prefer-classlist-toggle", "unicorn/prefer-date-now", "unicorn/prefer-dom-node-append", "unicorn/prefer-dom-node-dataset", "unicorn/prefer-dom-node-text-content", "unicorn/prefer-import-meta-properties", "unicorn/prefer-keyboard-event-key", "unicorn/prefer-negative-index", "unicorn/prefer-node-protocol", "unicorn/prefer-optional-catch-binding", "unicorn/prefer-prototype-methods", "unicorn/prefer-query-selector", "unicorn/prefer-regexp-test", "unicorn/prefer-set-size", "unicorn/prefer-single-call", "unicorn/prefer-spread", "unicorn/prefer-string-raw", "unicorn/prefer-string-replace-all", "unicorn/prefer-string-slice", "unicorn/prefer-string-starts-ends-with", "unicorn/prefer-string-trim-start-end", "unicorn/prefer-type-error", "unicorn/relative-url-style", "unicorn/require-array-join-separator", "unicorn/require-module-specifiers", "unicorn/require-number-to-fixed-digits-argument", "unicorn/switch-case-braces", "unicorn/text-encoding-identifier-case", "unicorn/throw-new-error", "vitest/consistent-test-it", "vitest/consistent-vitest-vi", "vitest/no-alias-methods", "vitest/no-importing-vitest-globals", "vitest/no-test-prefixes", "vitest/no-unneeded-async-expect-function", "vitest/padding-around-after-all-blocks", "vitest/padding-around-test-blocks", "vitest/prefer-called-once", "vitest/prefer-called-times", "vitest/prefer-called-with", "vitest/prefer-comparison-matcher", "vitest/prefer-describe-function-title", "vitest/prefer-expect-resolves", "vitest/prefer-expect-type-of", "vitest/prefer-import-in-mock", "vitest/prefer-importing-vitest-globals", "vitest/prefer-lowercase-title", "vitest/prefer-mock-promise-shorthand", "vitest/prefer-mock-return-shorthand", "vitest/prefer-strict-boolean-matchers", "vitest/prefer-to-be", "vitest/prefer-to-be-object", "vitest/prefer-to-contain", "vitest/prefer-to-have-been-called-times", "vitest/prefer-to-have-length", "vitest/prefer-todo", "vitest/valid-title", "vue/component-definition-name-casing", "vue/next-tick-style", "vue/no-deprecated-destroyed-lifecycle", "vue/prefer-import-from-vue", "vue/require-prop-type-constructor", "vue/valid-next-tick", "import/consistent-type-specifier-style", "import/newline-after-import", "import/no-duplicates", "import/no-empty-named-blocks", "jsx_a11y/aria-props", "jsx_a11y/aria-unsupported-elements", "jsx_a11y/no-aria-hidden-on-focusable", "jsx_a11y/no-redundant-roles", "jsx_a11y/scope", "react/jsx-boolean-value", "react/jsx-curly-brace-presence", "react/jsx-fragments", "react/jsx-props-no-spread-multi", "react/self-closing-comp", "node/no-exports-assign", "promise/no-new-statics", "oxc/no-const-enum"];
export type OxlintFixableRule = (typeof OXLINT_FIXABLE_RULES_LIST)[number];
export declare const OXLINT_FIXABLE_RULES: ReadonlySet<string>;
/**
 * Checks whether an Oxlint rule or diagnostic code has automated fix capability.
 */
export declare function isOxlintRuleFixable(ruleName: string): boolean;
/**
 * Parses raw JSON output from Vite+ (Oxlint) into canonical AuditFindings.
 * Elevates all diagnostics to severity: 'error' (Zero-Warning Policy).
 */
export declare function parseOxlintResults(input: string | object | object[], cwd?: string): AuditFinding[];
export declare class OxlintAuditor extends BaseAuditor<OxlintRuleId> {
  static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  constructor(projectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion