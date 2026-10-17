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
export declare const OXLINT_FIXABLE_RULES_LIST: readonly ["no-var", "prefer-const", "eqeqeq", "no-else-return", "no-unneeded-ternary", "prefer-object-has-own", "no-useless-computed-key", "no-new-wrappers", "no-array-constructor", "no-useless-call", "no-useless-rename", "no-useless-concat", "no-extra-boolean-cast", "no-unused-labels", "no-compare-neg-zero", "prefer-exponentiation-operator", "prefer-numeric-literals", "prefer-object-spread", "prefer-rest-params", "prefer-spread", "yoda", "no-unnecessary-type-assertion", "@typescript-eslint/no-unnecessary-type-assertion", "consistent-indexed-object-style", "@typescript-eslint/consistent-indexed-object-style", "consistent-type-assertions", "@typescript-eslint/consistent-type-assertions", "no-unnecessary-template-expression", "@typescript-eslint/no-unnecessary-template-expression", "no-unnecessary-type-arguments", "@typescript-eslint/no-unnecessary-type-arguments", "prefer-function-type", "@typescript-eslint/prefer-function-type", "prefer-return-this-type", "@typescript-eslint/prefer-return-this-type", "ban-tslint-comment", "@typescript-eslint/ban-tslint-comment", "ban-ts-comment", "@typescript-eslint/ban-ts-comment", "no-explicit-any", "@typescript-eslint/no-explicit-any", "unicorn/prefer-node-protocol", "unicorn/prefer-string-starts-ends-with", "unicorn/throw-new-error", "unicorn/no-useless-spread", "unicorn/no-unnecessary-slice-end", "unicorn/no-unnecessary-array-splice-count", "unicorn/explicit-timer-delay", "unicorn/prefer-date-now", "unicorn/prefer-prototype-methods", "unicorn/prefer-regexp-test", "unicorn/prefer-optional-catch-binding", "unicorn/prefer-string-trim-start-end", "unicorn/no-useless-promise-resolve-reject", "vitest/no-test-prefixes", "vitest/prefer-to-contain", "vitest/prefer-to-be", "vitest/prefer-comparison-matcher", "vitest/prefer-expect-resolves", "vitest/prefer-mock-promise-shorthand", "vitest/prefer-mock-return-shorthand", "vitest/prefer-to-have-length", "vitest/prefer-to-be-object", "vitest/prefer-todo", "vitest/valid-title", "vue/no-import-compiler-macros", "vue/valid-next-tick", "vue/no-deprecated-destroyed-lifecycle", "vue/component-definition-name-casing", "vue/next-tick-style", "vue/prefer-import-from-vue", "node/no-exports-assign", "promise/no-new-statics", "no-useless-assignment"];
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