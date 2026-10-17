import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { extractParsedConfigSummary, isRuleValueCompliant } from "../../core/viteConfigAst.js";
import { LEGACY_CONFIG_FILES, buildCanonicalVitePlusConfig, cleanLegacyConfigFiles, repairVitePlusProject, resolveAuditConfigIgnoreGlobs, syncViteConfigWithAuditConfig } from "../../core/vitePlusConfigSync.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_vite_plus_config.ts
enableCompileCache();
const VITE_PLUS_CONFIG_RULES = [
	"vite-plus-config-core",
	"vite-plus-config-lint",
	"vite-plus-config-fmt",
	"vite-plus-config-pack",
	"vite-plus-config-ts"
];
const ANTI_CASTRATION_SPECS = [
	{
		oxlintRule: "@typescript-eslint/no-explicit-any",
		message: `La regla '@typescript-eslint/no-explicit-any' debe estar configurada en 'error' en vite.config.ts para cumplir con /domain-type-first.`
	},
	{
		oxlintRule: "@typescript-eslint/ban-ts-comment",
		ruleId: "vite-plus-config-ts-ignore-allowed",
		description: "Regla ban-ts-comment no es error",
		message: `La regla '@typescript-eslint/ban-ts-comment' debe estar configurada en 'error' en vite.config.ts para prohibir supresiones (@ts-ignore) en tipos de dominio.`
	},
	{
		oxlintRule: "@francogp/domain-type/no-double-cast-unknown",
		ruleId: "vite-plus-config-double-cast-allowed",
		description: "Falta prohibir doble casteo",
		message: `Falta la regla '@francogp/domain-type/no-double-cast-unknown' configurada en 'error' para prohibir el casteo hacia unknown.`
	},
	{
		oxlintRule: "@francogp/domain-type/no-legacy-date",
		ruleId: "vite-plus-config-legacy-date-allowed",
		description: "Falta prohibir Date legado",
		message: `Falta la regla '@francogp/domain-type/no-legacy-date' configurada en 'error' para prohibir new Date() y Date.now().`
	},
	{
		oxlintRule: "no-debugger",
		ruleId: "vite-plus-config-debugger-allowed",
		description: "Regla no-debugger no es error",
		message: `La regla 'no-debugger' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-node-protocol",
		ruleId: "vite-plus-config-node-protocol-missing",
		description: "Falta unicorn/prefer-node-protocol",
		message: `La regla 'unicorn/prefer-node-protocol' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-floating-promises",
		ruleId: "vite-plus-config-floating-promises-allowed",
		description: "Falta no-floating-promises",
		message: `La regla '@typescript-eslint/no-floating-promises' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "max-depth",
		ruleId: "vite-plus-config-max-depth-missing",
		description: "Falta límite de nesting max-depth",
		message: `La regla 'max-depth' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "prefer-const",
		ruleId: "vite-plus-config-prefer-const-missing",
		description: "Falta regla prefer-const",
		message: `La regla 'prefer-const' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-var",
		ruleId: "vite-plus-config-no-var-missing",
		description: "Falta regla estricta no-var",
		message: `La regla 'no-var' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-self-compare",
		ruleId: "vite-plus-config-self-compare-allowed",
		description: "Falta regla no-self-compare",
		message: `La regla 'no-self-compare' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-eval",
		ruleId: "vite-plus-config-no-eval-allowed",
		description: "Falta prohibir eval dinámico",
		message: `La regla 'no-eval' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-async-in-computed-properties",
		ruleId: "vite-plus-config-vue-async-computed-allowed",
		description: "Falta vue/no-async-in-computed",
		message: `La regla 'vue/no-async-in-computed-properties' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-side-effects-in-computed-properties",
		ruleId: "vite-plus-config-vue-side-effects-computed-allowed",
		description: "Falta vue/no-side-effects-in-comp",
		message: `La regla 'vue/no-side-effects-in-computed-properties' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-export-in-script-setup",
		ruleId: "vite-plus-config-vue-script-setup-exports-allowed",
		description: "Falta vue/no-export-in-script",
		message: `La regla 'vue/no-export-in-script-setup' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-lifecycle-after-await",
		ruleId: "vite-plus-config-vue-lifecycle-after-await-allowed",
		description: "Falta vue/no-lifecycle-await",
		message: `La regla 'vue/no-lifecycle-after-await' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-watch-after-await",
		ruleId: "vite-plus-config-vue-watch-after-await-allowed",
		description: "Falta vue/no-watch-after-await",
		message: `La regla 'vue/no-watch-after-await' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/prefer-import-from-vue",
		ruleId: "vite-plus-config-vue-prefer-import-missing",
		description: "Falta vue/prefer-import-from-vue",
		message: `La regla 'vue/prefer-import-from-vue' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-identical-title",
		ruleId: "vite-plus-config-vitest-identical-title-allowed",
		description: "Falta vitest/no-identical-title",
		message: `La regla 'vitest/no-identical-title' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-focused-tests",
		ruleId: "vite-plus-config-vitest-focused-tests-allowed",
		description: "Falta vitest/no-focused-tests",
		message: `La regla 'vitest/no-focused-tests' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-disabled-tests",
		ruleId: "vite-plus-config-vitest-disabled-tests-allowed",
		description: "Falta vitest/no-disabled-tests",
		message: `La regla 'vitest/no-disabled-tests' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-have-length",
		ruleId: "vite-plus-config-vitest-have-length-missing",
		description: "Falta vitest/prefer-have-length",
		message: `La regla 'vitest/prefer-to-have-length' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/valid-title",
		ruleId: "vite-plus-config-vitest-valid-title-missing",
		description: "Falta vitest/valid-title",
		message: `La regla 'vitest/valid-title' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-self-import",
		ruleId: "vite-plus-config-import-self-allowed",
		description: "Falta import/no-self-import",
		message: `La regla 'import/no-self-import' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-empty-named-blocks",
		ruleId: "vite-plus-config-import-empty-named-blocks-allowed",
		description: "Falta import/no-empty-named",
		message: `La regla 'import/no-empty-named-blocks' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-catch",
		ruleId: "vite-plus-config-no-useless-catch-missing",
		description: "Falta regla no-useless-catch",
		message: `La regla 'no-useless-catch' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-rename",
		ruleId: "vite-plus-config-no-useless-rename-missing",
		description: "Falta regla no-useless-rename",
		message: `La regla 'no-useless-rename' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-sparse-arrays",
		ruleId: "vite-plus-config-no-sparse-arrays-missing",
		description: "Falta regla no-sparse-arrays",
		message: `La regla 'no-sparse-arrays' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-shadow-restricted-names",
		ruleId: "vite-plus-config-no-shadow-restricted-names-missing",
		description: "Falta no-shadow-restricted",
		message: `La regla 'no-shadow-restricted-names' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-string-starts-ends-with",
		ruleId: "vite-plus-config-unicorn-string-starts-ends-missing",
		description: "Falta unicorn/string-starts",
		message: `La regla 'unicorn/prefer-string-starts-ends-with' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/throw-new-error",
		ruleId: "vite-plus-config-unicorn-throw-error-missing",
		description: "Falta unicorn/throw-new-error",
		message: `La regla 'unicorn/throw-new-error' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-spread",
		ruleId: "vite-plus-config-unicorn-useless-spread-missing",
		description: "Falta unicorn/no-useless-spread",
		message: `La regla 'unicorn/no-useless-spread' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-assertion",
		ruleId: "vite-plus-config-no-unnecessary-type-assertion-missing",
		description: "Falta no-unnecessary-type-assertion",
		message: `La regla '@typescript-eslint/no-unnecessary-type-assertion' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/consistent-indexed-object-style",
		ruleId: "vite-plus-config-consistent-indexed-object-style-missing",
		description: "Falta consistent-indexed-object-style",
		message: `La regla '@typescript-eslint/consistent-indexed-object-style' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-empty-object-type",
		ruleId: "vite-plus-config-no-empty-object-type-missing",
		description: "Falta no-empty-object-type",
		message: `La regla '@typescript-eslint/no-empty-object-type' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-template-expression",
		ruleId: "vite-plus-config-no-unnecessary-template-missing",
		description: "Falta no-unnecessary-template",
		message: `La regla '@typescript-eslint/no-unnecessary-template-expression' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-arguments",
		ruleId: "vite-plus-config-no-unnecessary-type-arguments-missing",
		description: "Falta no-unnecessary-type-arguments",
		message: `La regla '@typescript-eslint/no-unnecessary-type-arguments' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-constraint",
		ruleId: "vite-plus-config-no-unnecessary-type-constraint-missing",
		description: "Falta no-unnecessary-type-constraint",
		message: `La regla '@typescript-eslint/no-unnecessary-type-constraint' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/prefer-function-type",
		ruleId: "vite-plus-config-prefer-function-type-missing",
		description: "Falta prefer-function-type",
		message: `La regla '@typescript-eslint/prefer-function-type' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/prefer-return-this-type",
		ruleId: "vite-plus-config-prefer-return-this-type-missing",
		description: "Falta prefer-return-this-type",
		message: `La regla '@typescript-eslint/prefer-return-this-type' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/ban-tslint-comment",
		ruleId: "vite-plus-config-ban-tslint-comment-missing",
		description: "Falta ban-tslint-comment",
		message: `La regla '@typescript-eslint/ban-tslint-comment' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-mutable-exports",
		ruleId: "vite-plus-config-import-no-mutable-exports-missing",
		description: "Falta import/no-mutable-exports",
		message: `La regla 'import/no-mutable-exports' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-extend-native",
		ruleId: "vite-plus-config-no-extend-native-missing",
		description: "Falta no-extend-native",
		message: `La regla 'no-extend-native' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-proto",
		ruleId: "vite-plus-config-no-proto-missing",
		description: "Falta regla no-proto",
		message: `La regla 'no-proto' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-iterator",
		ruleId: "vite-plus-config-no-iterator-missing",
		description: "Falta regla no-iterator",
		message: `La regla 'no-iterator' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "prefer-object-has-own",
		ruleId: "vite-plus-config-prefer-object-has-own-missing",
		description: "Falta prefer-object-has-own",
		message: `La regla 'prefer-object-has-own' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-computed-key",
		ruleId: "vite-plus-config-no-useless-computed-key-missing",
		description: "Falta no-useless-computed-key",
		message: `La regla 'no-useless-computed-key' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "node/no-exports-assign",
		ruleId: "vite-plus-config-node-no-exports-assign-missing",
		description: "Falta node/no-exports-assign",
		message: `La regla 'node/no-exports-assign' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-webpack-loader-syntax",
		ruleId: "vite-plus-config-import-no-webpack-loader-missing",
		description: "Falta import/no-webpack-loader",
		message: `La regla 'import/no-webpack-loader-syntax' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-dynamic-require",
		ruleId: "vite-plus-config-import-no-dynamic-require-missing",
		description: "Falta import/no-dynamic-require",
		message: `La regla 'import/no-dynamic-require' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-amd",
		ruleId: "vite-plus-config-import-no-amd-missing",
		description: "Falta import/no-amd",
		message: `La regla 'import/no-amd' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "import/no-named-default",
		ruleId: "vite-plus-config-import-no-named-default-missing",
		description: "Falta import/no-named-default",
		message: `La regla 'import/no-named-default' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-new-wrappers",
		ruleId: "vite-plus-config-no-new-wrappers-missing",
		description: "Falta regla no-new-wrappers",
		message: `La regla 'no-new-wrappers' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-array-constructor",
		ruleId: "vite-plus-config-no-array-constructor-missing",
		description: "Falta no-array-constructor",
		message: `La regla 'no-array-constructor' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-caller",
		ruleId: "vite-plus-config-no-caller-missing",
		description: "Falta regla no-caller",
		message: `La regla 'no-caller' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-new-buffer",
		ruleId: "vite-plus-config-unicorn-no-new-buffer-missing",
		description: "Falta unicorn/no-new-buffer",
		message: `La regla 'unicorn/no-new-buffer' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-implied-eval",
		ruleId: "vite-plus-config-no-implied-eval-missing",
		description: "Falta regla no-implied-eval",
		message: `La regla 'no-implied-eval' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-new-func",
		ruleId: "vite-plus-config-no-new-func-missing",
		description: "Falta regla no-new-func",
		message: `La regla 'no-new-func' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-script-url",
		ruleId: "vite-plus-config-no-script-url-missing",
		description: "Falta regla no-script-url",
		message: `La regla 'no-script-url' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "default-case-last",
		ruleId: "vite-plus-config-default-case-last-missing",
		description: "Falta default-case-last",
		message: `La regla 'default-case-last' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "radix",
		ruleId: "vite-plus-config-radix-missing",
		description: "Falta regla radix en parseInt",
		message: `La regla 'radix' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-return-assign",
		ruleId: "vite-plus-config-no-return-assign-missing",
		description: "Falta no-return-assign",
		message: `La regla 'no-return-assign' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-multi-assign",
		ruleId: "vite-plus-config-no-multi-assign-missing",
		description: "Falta no-multi-assign",
		message: `La regla 'no-multi-assign' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-sequences",
		ruleId: "vite-plus-config-no-sequences-missing",
		description: "Falta regla no-sequences",
		message: `La regla 'no-sequences' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-labels",
		ruleId: "vite-plus-config-no-labels-missing",
		description: "Falta regla no-labels",
		message: `La regla 'no-labels' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-void",
		ruleId: "vite-plus-config-no-void-missing",
		description: "Falta regla no-void",
		message: `La regla 'no-void' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-call",
		ruleId: "vite-plus-config-no-useless-call-missing",
		description: "Falta no-useless-call",
		message: `La regla 'no-useless-call' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "yoda",
		ruleId: "vite-plus-config-yoda-missing",
		description: "Falta regla yoda",
		message: `La regla 'yoda' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-unneeded-ternary",
		ruleId: "vite-plus-config-no-unneeded-ternary-missing",
		description: "Falta no-unneeded-ternary",
		message: `La regla 'no-unneeded-ternary' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "promise/no-new-statics",
		ruleId: "vite-plus-config-promise-no-new-statics-missing",
		description: "Falta promise/no-new-statics",
		message: `La regla 'promise/no-new-statics' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "promise/valid-params",
		ruleId: "vite-plus-config-promise-valid-params-missing",
		description: "Falta promise/valid-params",
		message: `La regla 'promise/valid-params' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "promise/no-return-in-finally",
		ruleId: "vite-plus-config-promise-no-return-finally-missing",
		description: "Falta no-return-in-finally",
		message: `La regla 'promise/no-return-in-finally' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "node/no-new-require",
		ruleId: "vite-plus-config-node-no-new-require-missing",
		description: "Falta node/no-new-require",
		message: `La regla 'node/no-new-require' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "node/no-path-concat",
		ruleId: "vite-plus-config-node-no-path-concat-missing",
		description: "Falta node/no-path-concat",
		message: `La regla 'node/no-path-concat' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-array-flat-depth",
		ruleId: "vite-plus-config-unicorn-flat-depth-missing",
		description: "Falta no-array-flat-depth",
		message: `La regla 'unicorn/no-unnecessary-array-flat-depth' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-array-splice-count",
		ruleId: "vite-plus-config-unicorn-splice-count-missing",
		description: "Falta no-array-splice-count",
		message: `La regla 'unicorn/no-unnecessary-array-splice-count' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unreadable-iife",
		ruleId: "vite-plus-config-unicorn-unreadable-iife-missing",
		description: "Falta unicorn/no-unreadable-iife",
		message: `La regla 'unicorn/no-unreadable-iife' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-switch-case",
		ruleId: "vite-plus-config-unicorn-useless-switch-missing",
		description: "Falta no-useless-switch-case",
		message: `La regla 'unicorn/no-useless-switch-case' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-promise-resolve-reject",
		ruleId: "vite-plus-config-unicorn-useless-promise-missing",
		description: "Falta no-useless-promise",
		message: `La regla 'unicorn/no-useless-promise-resolve-reject' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-array-some",
		ruleId: "vite-plus-config-unicorn-prefer-array-some-missing",
		description: "Falta unicorn/prefer-array-some",
		message: `La regla 'unicorn/prefer-array-some' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-slice-end",
		ruleId: "vite-plus-config-unicorn-unnecessary-slice-missing",
		description: "Falta no-unnecessary-slice-end",
		message: `La regla 'unicorn/no-unnecessary-slice-end' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/explicit-timer-delay",
		ruleId: "vite-plus-config-unicorn-explicit-timer-delay-missing",
		description: "Falta explicit-timer-delay",
		message: `La regla 'unicorn/explicit-timer-delay' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-date-now",
		ruleId: "vite-plus-config-unicorn-prefer-date-now-missing",
		description: "Falta unicorn/prefer-date-now",
		message: `La regla 'unicorn/prefer-date-now' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-math-min-max",
		ruleId: "vite-plus-config-unicorn-prefer-math-min-max-missing",
		description: "Falta prefer-math-min-max",
		message: `La regla 'unicorn/prefer-math-min-max' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-math-trunc",
		ruleId: "vite-plus-config-unicorn-prefer-math-trunc-missing",
		description: "Falta unicorn/prefer-math-trunc",
		message: `La regla 'unicorn/prefer-math-trunc' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-prototype-methods",
		ruleId: "vite-plus-config-unicorn-prefer-proto-methods-missing",
		description: "Falta prefer-prototype-methods",
		message: `La regla 'unicorn/prefer-prototype-methods' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-regexp-test",
		ruleId: "vite-plus-config-unicorn-prefer-regexp-test-missing",
		description: "Falta prefer-regexp-test",
		message: `La regla 'unicorn/prefer-regexp-test' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-default-parameters",
		ruleId: "vite-plus-config-unicorn-default-params-missing",
		description: "Falta prefer-default-parameters",
		message: `La regla 'unicorn/prefer-default-parameters' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-global-this",
		ruleId: "vite-plus-config-unicorn-prefer-global-this-missing",
		description: "Falta prefer-global-this",
		message: `La regla 'unicorn/prefer-global-this' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-optional-catch-binding",
		ruleId: "vite-plus-config-unicorn-opt-catch-binding-missing",
		description: "Falta opt-catch-binding",
		message: `La regla 'unicorn/prefer-optional-catch-binding' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-string-trim-start-end",
		ruleId: "vite-plus-config-unicorn-string-trim-missing",
		description: "Falta string-trim-start-end",
		message: `La regla 'unicorn/prefer-string-trim-start-end' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "prefer-exponentiation-operator",
		ruleId: "vite-plus-config-prefer-exponentiation-missing",
		description: "Falta prefer-exponentiation",
		message: `La regla 'prefer-exponentiation-operator' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "prefer-numeric-literals",
		ruleId: "vite-plus-config-prefer-numeric-literals-missing",
		description: "Falta prefer-numeric-literals",
		message: `La regla 'prefer-numeric-literals' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "prefer-rest-params",
		ruleId: "vite-plus-config-prefer-rest-params-missing",
		description: "Falta prefer-rest-params",
		message: `La regla 'prefer-rest-params' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-duplicate-hooks",
		ruleId: "vite-plus-config-vitest-duplicate-hooks-allowed",
		description: "Falta vitest/no-duplicate-hooks",
		message: `La regla 'vitest/no-duplicate-hooks' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-test-prefixes",
		ruleId: "vite-plus-config-vitest-test-prefixes-allowed",
		description: "Falta vitest/no-test-prefixes",
		message: `La regla 'vitest/no-test-prefixes' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-test-return-statement",
		ruleId: "vite-plus-config-vitest-test-return-allowed",
		description: "Falta test-return-statement",
		message: `La regla 'vitest/no-test-return-statement' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-contain",
		ruleId: "vite-plus-config-vitest-to-contain-missing",
		description: "Falta vitest/prefer-to-contain",
		message: `La regla 'vitest/prefer-to-contain' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be",
		ruleId: "vite-plus-config-vitest-to-be-missing",
		description: "Falta vitest/prefer-to-be",
		message: `La regla 'vitest/prefer-to-be' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-comparison-matcher",
		ruleId: "vite-plus-config-vitest-comparison-matcher-missing",
		description: "Falta comparison-matcher",
		message: `La regla 'vitest/prefer-comparison-matcher' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-import-node-test",
		ruleId: "vite-plus-config-vitest-no-import-node-test-missing",
		description: "Falta no-import-node-test",
		message: `La regla 'vitest/no-import-node-test' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-interpolation-in-snapshots",
		ruleId: "vite-plus-config-vitest-interpolation-snap-missing",
		description: "Falta no-interpolation-snap",
		message: `La regla 'vitest/no-interpolation-in-snapshots' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-expect-resolves",
		ruleId: "vite-plus-config-vitest-expect-resolves-missing",
		description: "Falta prefer-expect-resolves",
		message: `La regla 'vitest/prefer-expect-resolves' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-mock-promise-shorthand",
		ruleId: "vite-plus-config-vitest-mock-promise-missing",
		description: "Falta mock-promise-shorthand",
		message: `La regla 'vitest/prefer-mock-promise-shorthand' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-mock-return-shorthand",
		ruleId: "vite-plus-config-vitest-mock-return-missing",
		description: "Falta mock-return-shorthand",
		message: `La regla 'vitest/prefer-mock-return-shorthand' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-strict-equal",
		ruleId: "vite-plus-config-vitest-strict-equal-missing",
		description: "Falta prefer-strict-equal",
		message: `La regla 'vitest/prefer-strict-equal' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-truthy",
		ruleId: "vite-plus-config-vitest-to-be-truthy-missing",
		description: "Falta prefer-to-be-truthy",
		message: `La regla 'vitest/prefer-to-be-truthy' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-falsy",
		ruleId: "vite-plus-config-vitest-to-be-falsy-missing",
		description: "Falta prefer-to-be-falsy",
		message: `La regla 'vitest/prefer-to-be-falsy' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-object",
		ruleId: "vite-plus-config-vitest-to-be-object-missing",
		description: "Falta prefer-to-be-object",
		message: `La regla 'vitest/prefer-to-be-object' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-todo",
		ruleId: "vite-plus-config-vitest-todo-missing",
		description: "Falta vitest/prefer-todo",
		message: `La regla 'vitest/prefer-todo' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-expose-after-await",
		ruleId: "vite-plus-config-vue-expose-after-await-allowed",
		description: "Falta no-expose-after-await",
		message: `La regla 'vue/no-expose-after-await' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/return-in-computed-property",
		ruleId: "vite-plus-config-vue-return-in-computed-missing",
		description: "Falta return-in-computed",
		message: `La regla 'vue/return-in-computed-property' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-import-compiler-macros",
		ruleId: "vite-plus-config-vue-no-import-macros-missing",
		description: "Falta no-import-compiler-macros",
		message: `La regla 'vue/no-import-compiler-macros' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/valid-next-tick",
		ruleId: "vite-plus-config-vue-valid-next-tick-missing",
		description: "Falta vue/valid-next-tick",
		message: `La regla 'vue/valid-next-tick' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-deprecated-destroyed-lifecycle",
		ruleId: "vite-plus-config-vue-no-deprecated-lifecycle-missing",
		description: "Falta no-deprecated-lifecycle",
		message: `La regla 'vue/no-deprecated-destroyed-lifecycle' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/component-definition-name-casing",
		ruleId: "vite-plus-config-vue-component-casing-missing",
		description: "Falta component-definition-casing",
		message: `La regla 'vue/component-definition-name-casing' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/define-emits-declaration",
		ruleId: "vite-plus-config-vue-define-emits-missing",
		description: "Falta define-emits-declaration",
		message: `La regla 'vue/define-emits-declaration' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/define-props-declaration",
		ruleId: "vite-plus-config-vue-define-props-missing",
		description: "Falta define-props-declaration",
		message: `La regla 'vue/define-props-declaration' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/next-tick-style",
		ruleId: "vite-plus-config-vue-next-tick-style-missing",
		description: "Falta vue/next-tick-style",
		message: `La regla 'vue/next-tick-style' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/prop-name-casing",
		ruleId: "vite-plus-config-vue-prop-name-casing-missing",
		description: "Falta vue/prop-name-casing",
		message: `La regla 'vue/prop-name-casing' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/require-direct-export",
		ruleId: "vite-plus-config-vue-require-direct-export-missing",
		description: "Falta require-direct-export",
		message: `La regla 'vue/require-direct-export' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/require-typed-ref",
		ruleId: "vite-plus-config-vue-require-typed-ref-missing",
		description: "Falta vue/require-typed-ref",
		message: `La regla 'vue/require-typed-ref' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/explicit-member-accessibility",
		ruleId: "vite-plus-config-explicit-member-accessibility-missing",
		description: "Falta accesibilidad explícita",
		message: `La regla '@typescript-eslint/explicit-member-accessibility' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/explicit-function-return-type",
		ruleId: "vite-plus-config-explicit-function-return-type-missing",
		description: "Falta tipo de retorno explícito",
		message: `La regla '@typescript-eslint/explicit-function-return-type' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unused-vars",
		ruleId: "vite-plus-config-no-unused-vars-missing",
		description: "Falta no-unused-vars calibrado",
		message: `La regla '@typescript-eslint/no-unused-vars' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-required-prop-with-default",
		ruleId: "vite-plus-config-vue-no-required-prop-with-default-missing",
		description: "Falta no-required-prop-with-default",
		message: `La regla 'vue/no-required-prop-with-default' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-deprecated-model-definition",
		ruleId: "vite-plus-config-vue-no-deprecated-model-def-missing",
		description: "Falta no-deprecated-model-definition",
		message: `La regla 'vue/no-deprecated-model-definition' debe estar configurada en 'error' en vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-assignment",
		ruleId: "vite-plus-config-no-useless-assignment-missing",
		description: "Falta no-useless-assignment",
		message: `La regla 'no-useless-assignment' debe estar configurada en 'error' en vite.config.ts.`
	}
];
function validateSpecialAntiCastrationRules(summary, fileName) {
	const findings = [];
	if (!isRuleValueCompliant("@typescript-eslint/consistent-type-assertions", summary.lintRules.get("@typescript-eslint/consistent-type-assertions"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@typescript-eslint/consistent-type-assertions",
		message: `Falta configurar '@typescript-eslint/consistent-type-assertions' en 'error' con estilo 'as' y objectLiteralTypeAssertions: 'never'.`
	});
	if (!isRuleValueCompliant("no-empty", summary.lintRules.get("no-empty"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "no-empty",
		message: `La regla 'no-empty' debe estar configurada en 'error' con allowEmptyCatch: false en vite.config.ts.`
	});
	if (!isRuleValueCompliant("eqeqeq", summary.lintRules.get("eqeqeq"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "eqeqeq",
		message: `La regla 'eqeqeq' debe estar configurada en ['error', 'always'] en vite.config.ts.`
	});
	return findings;
}
function validateAntiCastrationRules(summary, fileName) {
	const findings = validateSpecialAntiCastrationRules(summary, fileName);
	for (const spec of ANTI_CASTRATION_SPECS) if (!isRuleValueCompliant(spec.oxlintRule, summary.lintRules.get(spec.oxlintRule))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: spec.oxlintRule,
		message: spec.message
	});
	return findings;
}
function validateRequiredSections(summary, fileName, auditConfig) {
	const findings = [];
	if (!summary.hasSection("fmt")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-fmt",
		ruleDescription: "Vite+: Estándares de formato con Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt",
		message: `Falta la sección 'fmt' en vite.config.ts para gobernar el formateo nativo con Oxfmt.`
	});
	else if (summary.fmtConfig.sortImports !== true || summary.fmtConfig.sortPackageJson !== true) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-fmt",
		ruleDescription: "Vite+: Estándares de formato con Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt",
		message: `La sección 'fmt' en vite.config.ts debe incluir sortImports: true y sortPackageJson: true para formateo canónico.`
	});
	if (!summary.hasSection("staged")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-core",
		ruleDescription: "Vite+: Estructura raíz y secciones base de Vite+",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "staged",
		message: `Falta la sección 'staged' en vite.config.ts para habilitar git hooks pre-commit nativos.`
	});
	if (!summary.hasSection("test")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-core",
		ruleDescription: "Vite+: Estructura raíz y secciones base de Vite+",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "test",
		message: `Falta la sección 'test' en vite.config.ts para ejecutar pruebas con Vitest integrado.`
	});
	if (auditConfig?.packageDistribution?.enabled === true) {
		if (!summary.hasSection("pack")) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-pack",
			ruleDescription: "Vite+: Estándares de empaquetado y distribución",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "pack",
			message: `Falta la sección 'pack' en vite.config.ts para gobernar el empaquetado y validaciones nativas de Vite+.`
		});
		else if (summary.packConfig.publint !== true || !summary.hasPackAttw) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-pack",
			ruleDescription: "Vite+: Estándares de empaquetado y distribución",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "pack",
			message: `La sección 'pack' en vite.config.ts debe incluir publint: true y attw: { profile: 'esm-only' } para validación oficial de distribución y tipos.`
		});
	}
	return findings;
}
function validateLintOptionsAndPlugins(summary, fileName) {
	const findings = [];
	if (!summary.lintJsPlugins.includes("@francogp/auditor/domain-type-plugin")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "domain-type-plugin",
		message: `Falta registrar el plugin jsPlugins: ['@francogp/auditor/domain-type-plugin'] en la sección 'lint' de vite.config.ts.`
	});
	if (summary.hasSection("lint") && summary.lintOptions.typeAware === void 0) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Estándares estrictos de linter y Oxlint",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "lint.options",
		message: `Falta configurar la sección 'options' con 'typeAware' y 'typeCheck' en 'lint' de vite.config.ts.`
	});
	return findings;
}
function validateSynchronizedConfig(summary, fileName, auditConfig, projectRoot) {
	const findings = [];
	const lintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "lint", projectRoot);
	const missingLint = summary.hasSection("lint") ? lintIgnores.filter((g) => !summary.lintIgnorePatterns.includes(g)) : lintIgnores;
	const fmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "fmt", projectRoot);
	const missingFmt = summary.hasSection("fmt") ? fmtIgnores.filter((g) => !summary.fmtIgnorePatterns.includes(g)) : fmtIgnores;
	if (missingFmt.length > 0) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-fmt",
		ruleDescription: "Vite+: Estándares de formato con Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt.ignorePatterns",
		message: `Faltan patrones de exclusión en fmt de vite.config.ts: [${missingFmt.join(", ")}]. Ejecuta 'auditor fix' para sincronizarlos automáticamente.`
	});
	if (missingLint.length > 0) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-ts",
		ruleDescription: "Vite+: Sincronización de TypeScript y pruebas",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "lint.ignorePatterns",
		message: `Faltan patrones de exclusión requeridos por audit.config.ts en lint de vite.config.ts: [${missingLint.join(", ")}]. Ejecuta 'auditor fix' para sincronizarlos automáticamente.`
	});
	const testRoots = auditConfig.paths?.testRoots;
	if (testRoots && testRoots.length > 0 && summary.hasSection("test")) {
		const missingRoots = testRoots.filter((r) => !summary.testInclude.some((inc) => inc.startsWith(`${r}/`)));
		if (missingRoots.length > 0) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-ts",
			ruleDescription: "Vite+: Sincronización de TypeScript y pruebas",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "test.include",
			message: `Las raíces de pruebas declaradas en audit.config.ts (${missingRoots.join(", ")}) no están sincronizadas en 'test.include' de vite.config.ts. Ejecuta 'auditor fix' para sincronizarlas automáticamente.`
		});
	}
	return findings;
}
/**
* Validates that a vite.config.ts file enforces strict /domain-type-first rules and sections
* using the TypeScript Compiler AST.
*/
function auditVitePlusConfigContent(content, fileName, auditConfig, projectRoot) {
	const summary = extractParsedConfigSummary(content);
	const findings = [
		...validateAntiCastrationRules(summary, fileName),
		...validateRequiredSections(summary, fileName, auditConfig),
		...validateLintOptionsAndPlugins(summary, fileName)
	];
	if (auditConfig) findings.push(...validateSynchronizedConfig(summary, fileName, auditConfig, projectRoot));
	return findings;
}
const VITE_PLUS_CONFIG_REQUIREMENT = {
	id: "vite-plus-config",
	file: "vite.config.ts",
	candidateFiles: ["vite.config.ts"],
	description: "Configuración unificada de Vite+ (vite.config.ts)",
	ruleId: "vite-plus-config-core",
	generateDefaultContent: (ctx) => buildCanonicalVitePlusConfig(getAuditConfig(ctx.projectRoot))
};
const RULE_DESCRIPTIONS = {
	"vite-plus-config-core": "Estructura raíz y secciones base de Vite+",
	"vite-plus-config-lint": "Estándares estrictos de linter y Oxlint",
	"vite-plus-config-fmt": "Estándares de formato con Oxfmt",
	"vite-plus-config-pack": "Estándares de empaquetado y distribución",
	"vite-plus-config-ts": "Sincronización de TypeScript y pruebas"
};
const RULE_REMEDIATIONS = {
	"vite-plus-config-core": "Guía de diagnóstico y remediación para vite-plus-config-core. Asegura que vite.config.ts exista, no contenga archivos legacy obsoletos (.eslintrc, vitest.config) e incluya las secciones test y staged mediante `auditor fix`.",
	"vite-plus-config-lint": "Guía de diagnóstico y remediación para vite-plus-config-lint. Configura la sección lint con todas las reglas anti-castración en \"error\", options.typeAware y jsPlugins de dominio mediante `auditor fix`.",
	"vite-plus-config-fmt": "Guía de diagnóstico y remediación para vite-plus-config-fmt. Configura la sección fmt con sortImports: true y sortPackageJson: true en vite.config.ts mediante `auditor fix`.",
	"vite-plus-config-pack": "Guía de diagnóstico y remediación para vite-plus-config-pack. Para paquetes de tipo librería, configura la sección pack con publint: true y attw: { profile: \"esm-only\" } mediante `auditor fix`.",
	"vite-plus-config-ts": "Guía de diagnóstico y remediación para vite-plus-config-ts. Sincroniza paths.ignoreGlobs y paths.testRoots desde audit.config.ts hacia ignorePatterns y test.include mediante `auditor fix`."
};
var ValidateVitePlusConfigAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		const configRequirement = options.configFile ? {
			...VITE_PLUS_CONFIG_REQUIREMENT,
			file: options.configFile,
			candidateFiles: [options.configFile],
			generateDefaultContent: () => buildCanonicalVitePlusConfig(getAuditConfig(effectiveRoot))
		} : VITE_PLUS_CONFIG_REQUIREMENT;
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(VITE_PLUS_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...VITE_PLUS_CONFIG_RULES]),
			fixableRuleIds: [...VITE_PLUS_CONFIG_RULES],
			configFiles: [configRequirement],
			fix: options.fix,
			id: "validate_vite_plus_config",
			name: "Vite+ Unified Configuration Validator",
			description: "Valida configuración de Vite+ y reglas de dominio",
			family: "architecture",
			packageName: "Vite+",
			configKey: "vitePlusConfig.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "⚡",
			ruleIds: VITE_PLUS_CONFIG_RULES,
			ruleDescriptions: RULE_DESCRIPTIONS,
			ruleRemediations: RULE_REMEDIATIONS,
			coverage: { include: ["vite.config.ts"] },
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		if (this.isFixActive()) repairVitePlusProject(this.projectRoot);
		const resolvedPath = path.resolve(this.projectRoot, "vite.config.ts");
		const exists = fs.existsSync(resolvedPath);
		const relFileName = toPosixRelative(this.projectRoot, resolvedPath);
		let content = "";
		let findings = [];
		if (this.isFixActive() && exists) syncViteConfigWithAuditConfig(this.projectRoot);
		if (exists) {
			this.recordScanned(relFileName);
			content = fs.readFileSync(resolvedPath, "utf-8");
			const config = getAuditConfig(this.projectRoot);
			findings = auditVitePlusConfigContent(content, relFileName, config, this.projectRoot);
		}
		this.runSubAuditorSync("vite-plus-config-core", () => {
			for (const legacy of LEGACY_CONFIG_FILES) {
				const fullPath = path.resolve(this.projectRoot, legacy);
				if (fs.existsSync(fullPath)) {
					if (this.isFixActive()) {
						cleanLegacyConfigFiles(this.projectRoot);
						break;
					} else this.addViolation({
						ruleId: "vite-plus-config-core",
						severity: "error",
						file: legacy,
						line: 1,
						context: legacy,
						message: `El archivo '${legacy}' es un archivo de configuración obsoleto. Toda la configuración debe vivir en vite.config.ts y sincronizarse desde .auditor/audit.config.ts.`,
						fixable: true
					});
				}
			}
			if (!exists) {
				this.addViolation({
					ruleId: "vite-plus-config-core",
					severity: "error",
					file: "vite.config.ts",
					line: 1,
					context: "vite.config.ts",
					message: `Falta el archivo de configuración unificada 'vite.config.ts'. Ejecuta 'auditor fix' para generarlo automáticamente.`,
					fixable: true
				});
				return;
			}
			for (const f of findings.filter((x) => x.ruleId === "vite-plus-config-core")) this.addViolation({
				ruleId: "vite-plus-config-core",
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? "vite-plus-config-core",
				message: f.message,
				fixable: true
			});
		});
		if (!exists) {
			for (const ruleId of [
				"vite-plus-config-lint",
				"vite-plus-config-fmt",
				"vite-plus-config-pack",
				"vite-plus-config-ts"
			]) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "Archivo vite.config.ts no encontrado");
			});
			return;
		}
		this.runSubAuditorSync("vite-plus-config-lint", () => {
			for (const f of findings.filter((x) => x.ruleId === "vite-plus-config-lint")) this.addViolation({
				ruleId: "vite-plus-config-lint",
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? "vite-plus-config-lint",
				message: f.message,
				fixable: true
			});
		});
		this.runSubAuditorSync("vite-plus-config-fmt", () => {
			for (const f of findings.filter((x) => x.ruleId === "vite-plus-config-fmt")) this.addViolation({
				ruleId: "vite-plus-config-fmt",
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? "vite-plus-config-fmt",
				message: f.message,
				fixable: true
			});
		});
		this.runSubAuditorSync("vite-plus-config-pack", () => {
			for (const f of findings.filter((x) => x.ruleId === "vite-plus-config-pack")) this.addViolation({
				ruleId: "vite-plus-config-pack",
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? "vite-plus-config-pack",
				message: f.message,
				fixable: true
			});
		});
		this.runSubAuditorSync("vite-plus-config-ts", () => {
			for (const f of findings.filter((x) => x.ruleId === "vite-plus-config-ts")) this.addViolation({
				ruleId: "vite-plus-config-ts",
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? "vite-plus-config-ts",
				message: f.message,
				fixable: true
			});
		});
		this.context.setMetric("Vite+ Config Checked", relFileName);
		const totalViolations = Array.from(this.countsByRule.values()).reduce((a, b) => a + b, 0);
		this.context.setMetric("Vite+ Config Violations", totalViolations);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVitePlusConfigAuditor());
//#endregion
export { VITE_PLUS_CONFIG_REQUIREMENT, VITE_PLUS_CONFIG_RULES, ValidateVitePlusConfigAuditor, auditVitePlusConfigContent };
