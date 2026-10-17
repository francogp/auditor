import { AuditConfig } from "./auditConfigTypes.js";
//#region src/core/vitePlusConfigSync.d.ts
export declare const LEGACY_CONFIG_FILES: readonly ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "tsdown.config.ts", "tsdown.config.js", "tsconfig.build.json", ".oxlintrc.json", ".oxfmtrc.json"];
export type VitePlusSyncTarget = 'lint' | 'fmt';
/**
 * Scans for legacy ESLint configuration files and extracts globalIgnores entries.
 */
export declare function findLegacyEslintIgnores(projectRoot: string): string[];
/**
 * Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
 * Evaluates paths.ignoreGlobs, paths.ignoredDirs, paths.ignoredPatterns,
 * test roots (when paths.includeTestsInCodeAudit === false), legacy ESLint
 * globalIgnores, and target-specific exclusions (lint or fmt).
 */
export declare function resolveAuditConfigIgnoreGlobs(config: AuditConfig, target?: VitePlusSyncTarget, projectRoot?: string): string[];
export declare function buildCanonicalVitePlusConfig(auditConfig: AuditConfig, projectRoot?: string): string;
export declare function extractObjectPropertyBlock(fileContent: string, propName: string): string | null;
export declare const STRICT_RULE_CHECKS: readonly ["@typescript-eslint/no-explicit-any", "@typescript-eslint/ban-ts-comment", "@typescript-eslint/consistent-type-assertions", "@typescript-eslint/no-floating-promises", "@francogp/domain-type/no-double-cast-unknown", "@francogp/domain-type/no-legacy-date", "unicorn/prefer-node-protocol", "no-debugger", "no-else-return", "no-empty", "max-depth", "import/no-duplicates", "eqeqeq", "prefer-const", "no-var", "no-self-compare", "no-eval", "vue/no-async-in-computed-properties", "vue/no-side-effects-in-computed-properties", "vue/no-export-in-script-setup", "vue/no-lifecycle-after-await", "vue/no-watch-after-await", "vue/prefer-import-from-vue", "vitest/no-identical-title", "vitest/no-focused-tests", "vitest/no-disabled-tests", "vitest/prefer-to-have-length", "vitest/valid-title", "import/no-self-import", "import/no-empty-named-blocks", "no-useless-catch", "no-useless-rename", "no-sparse-arrays", "no-shadow-restricted-names", "unicorn/prefer-string-starts-ends-with", "unicorn/throw-new-error", "unicorn/no-useless-spread", "@typescript-eslint/no-unnecessary-type-assertion", "@typescript-eslint/consistent-indexed-object-style", "@typescript-eslint/no-empty-object-type", "@typescript-eslint/no-unnecessary-template-expression", "@typescript-eslint/no-unnecessary-type-arguments", "@typescript-eslint/no-unnecessary-type-constraint", "@typescript-eslint/prefer-function-type", "@typescript-eslint/prefer-return-this-type", "@typescript-eslint/ban-tslint-comment", "import/no-mutable-exports", "no-extend-native", "no-proto", "no-iterator", "prefer-object-has-own", "no-useless-computed-key", "node/no-exports-assign", "import/no-webpack-loader-syntax", "import/no-dynamic-require", "import/no-amd", "import/no-named-default", "no-new-wrappers", "no-array-constructor", "no-caller", "unicorn/no-new-buffer", "no-implied-eval", "no-new-func", "no-script-url", "default-case-last", "radix", "no-return-assign", "no-multi-assign", "no-sequences", "no-labels", "no-void", "no-useless-call", "yoda", "no-unneeded-ternary", "promise/no-new-statics", "promise/valid-params", "promise/no-return-in-finally", "node/no-new-require", "node/no-path-concat", "unicorn/no-unnecessary-array-flat-depth", "unicorn/no-unnecessary-array-splice-count", "unicorn/no-unreadable-iife", "unicorn/no-useless-switch-case", "unicorn/no-useless-promise-resolve-reject", "unicorn/prefer-array-some", "unicorn/no-unnecessary-slice-end", "unicorn/explicit-timer-delay", "unicorn/prefer-date-now", "unicorn/prefer-math-min-max", "unicorn/prefer-math-trunc", "unicorn/prefer-prototype-methods", "unicorn/prefer-regexp-test", "unicorn/prefer-default-parameters", "unicorn/prefer-global-this", "unicorn/prefer-optional-catch-binding", "unicorn/prefer-string-trim-start-end", "prefer-exponentiation-operator", "prefer-numeric-literals", "prefer-rest-params", "vitest/no-duplicate-hooks", "vitest/no-test-prefixes", "vitest/no-test-return-statement", "vitest/prefer-to-contain", "vitest/prefer-to-be", "vitest/prefer-comparison-matcher", "vitest/no-import-node-test", "vitest/no-interpolation-in-snapshots", "vitest/prefer-expect-resolves", "vitest/prefer-mock-promise-shorthand", "vitest/prefer-mock-return-shorthand", "vitest/prefer-strict-equal", "vitest/prefer-to-be-truthy", "vitest/prefer-to-be-falsy", "vitest/prefer-to-be-object", "vitest/prefer-todo", "vue/no-expose-after-await", "vue/return-in-computed-property", "vue/no-import-compiler-macros", "vue/valid-next-tick", "vue/no-deprecated-destroyed-lifecycle", "vue/component-definition-name-casing", "vue/define-emits-declaration", "vue/define-props-declaration", "vue/next-tick-style", "vue/prop-name-casing", "vue/require-direct-export", "vue/require-typed-ref", "@typescript-eslint/explicit-member-accessibility", "@typescript-eslint/explicit-function-return-type", "@typescript-eslint/no-unused-vars", "vue/no-required-prop-with-default", "vue/no-deprecated-model-definition", "no-useless-assignment"];
export declare function syncViteConfigWithAuditConfig(projectRoot: string, auditConfig?: AuditConfig): {
  modified: boolean;
  content: string;
};
export declare function cleanLegacyConfigFiles(projectRoot: string): readonly string[];
export declare function rewriteImportsToVitePlus(projectRoot: string, dirs?: readonly string[]): number;
export declare function migrateNodeVersion(projectRoot: string): boolean;
export declare function getVitePlusDefaultExcludeGlobs(projectRoot: string): string[];
export declare function migrateViteCommandsToVp(cmd: string): string;
export declare function syncPackageJsonForVitePlus(projectRoot: string): boolean;
export declare function syncVSCodeSettings(projectRoot: string, auditConfig?: AuditConfig): boolean;
export declare function repairVitePlusProject(projectRoot: string): {
  removedConfigs: readonly string[];
  rewrittenFiles: number;
  viteConfigSync: {
    modified: boolean;
    content: string;
  };
  nodeVersionMigrated: boolean;
  packageJsonUpdated: boolean;
  vscodeSync: boolean;
};
//#endregion