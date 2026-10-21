import "../../core/auditConfigDefaults.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { extractParsedConfigSummary, isRuleValueCompliant, resolveVitestRoots } from "../../core/viteConfigAst.js";
import { LEGACY_CONFIG_FILES, buildCanonicalVitePlusConfig, cleanHomebrewCompressionFiles, cleanLegacyConfigFiles, detectHomebrewCompressionImports, findHomebrewCompressionFiles, migrateHomebrewCompressionInViteConfig, repairVitePlusProject, resolveAuditConfigIgnoreGlobs, syncViteConfigWithAuditConfig } from "../../core/vitePlusConfigSync.js";
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
		message: `The '@typescript-eslint/no-explicit-any' rule must be configured as 'error' in vite.config.ts to comply with /domain-type-first.`
	},
	{
		oxlintRule: "@typescript-eslint/ban-ts-comment",
		ruleId: "vite-plus-config-ts-ignore-allowed",
		description: "Rule ban-ts-comment is not error",
		message: `The '@typescript-eslint/ban-ts-comment' rule must be configured as 'error' in vite.config.ts to prohibit (@ts-ignore) suppressions in domain types.`
	},
	{
		oxlintRule: "@francogp/domain-type/no-double-cast-unknown",
		ruleId: "vite-plus-config-double-cast-allowed",
		description: "Missing double cast prohibition",
		message: `The '@francogp/domain-type/no-double-cast-unknown' rule must be configured as 'error' to prohibit casting to unknown.`
	},
	{
		oxlintRule: "@francogp/domain-type/no-legacy-date",
		ruleId: "vite-plus-config-legacy-date-allowed",
		description: "Missing legacy Date prohibition",
		message: `The '@francogp/domain-type/no-legacy-date' rule must be configured as 'error' to prohibit new Date() and Date.now().`
	},
	{
		oxlintRule: "no-debugger",
		ruleId: "vite-plus-config-debugger-allowed",
		description: "Rule no-debugger is not error",
		message: `The 'no-debugger' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-node-protocol",
		ruleId: "vite-plus-config-node-protocol-missing",
		description: "Missing unicorn/prefer-node-protocol",
		message: `The 'unicorn/prefer-node-protocol' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-floating-promises",
		ruleId: "vite-plus-config-floating-promises-allowed",
		description: "Missing no-floating-promises",
		message: `The '@typescript-eslint/no-floating-promises' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "max-depth",
		ruleId: "vite-plus-config-max-depth-missing",
		description: "Missing max-depth nesting limit",
		message: `The 'max-depth' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "prefer-const",
		ruleId: "vite-plus-config-prefer-const-missing",
		description: "Missing prefer-const rule",
		message: `The 'prefer-const' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-var",
		ruleId: "vite-plus-config-no-var-missing",
		description: "Missing strict no-var rule",
		message: `The 'no-var' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-self-compare",
		ruleId: "vite-plus-config-self-compare-allowed",
		description: "Missing no-self-compare rule",
		message: `The 'no-self-compare' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-eval",
		ruleId: "vite-plus-config-no-eval-allowed",
		description: "Missing dynamic eval prohibition",
		message: `The 'no-eval' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicode-bom",
		ruleId: "vite-plus-config-unicode-bom-missing",
		description: "Missing unicode-bom rule",
		message: `The 'unicode-bom' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-async-in-computed-properties",
		ruleId: "vite-plus-config-vue-async-computed-allowed",
		description: "Missing vue/no-async-in-computed",
		message: `The 'vue/no-async-in-computed-properties' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-side-effects-in-computed-properties",
		ruleId: "vite-plus-config-vue-side-effects-computed-allowed",
		description: "Missing vue/no-side-effects-in-comp",
		message: `The 'vue/no-side-effects-in-computed-properties' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-export-in-script-setup",
		ruleId: "vite-plus-config-vue-script-setup-exports-allowed",
		description: "Missing vue/no-export-in-script",
		message: `The 'vue/no-export-in-script-setup' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-lifecycle-after-await",
		ruleId: "vite-plus-config-vue-lifecycle-after-await-allowed",
		description: "Missing vue/no-lifecycle-await",
		message: `The 'vue/no-lifecycle-after-await' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-watch-after-await",
		ruleId: "vite-plus-config-vue-watch-after-await-allowed",
		description: "Missing vue/no-watch-after-await",
		message: `The 'vue/no-watch-after-await' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/prefer-import-from-vue",
		ruleId: "vite-plus-config-vue-prefer-import-missing",
		description: "Missing vue/prefer-import-from-vue",
		message: `The 'vue/prefer-import-from-vue' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-identical-title",
		ruleId: "vite-plus-config-vitest-identical-title-allowed",
		description: "Missing vitest/no-identical-title",
		message: `The 'vitest/no-identical-title' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-focused-tests",
		ruleId: "vite-plus-config-vitest-focused-tests-allowed",
		description: "Missing vitest/no-focused-tests",
		message: `The 'vitest/no-focused-tests' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-disabled-tests",
		ruleId: "vite-plus-config-vitest-disabled-tests-allowed",
		description: "Missing vitest/no-disabled-tests",
		message: `The 'vitest/no-disabled-tests' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-have-length",
		ruleId: "vite-plus-config-vitest-have-length-missing",
		description: "Missing vitest/prefer-have-length",
		message: `The 'vitest/prefer-to-have-length' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/valid-title",
		ruleId: "vite-plus-config-vitest-valid-title-missing",
		description: "Missing vitest/valid-title",
		message: `The 'vitest/valid-title' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-self-import",
		ruleId: "vite-plus-config-import-self-allowed",
		description: "Missing import/no-self-import",
		message: `The 'import/no-self-import' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-empty-named-blocks",
		ruleId: "vite-plus-config-import-empty-named-blocks-allowed",
		description: "Missing import/no-empty-named",
		message: `The 'import/no-empty-named-blocks' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-catch",
		ruleId: "vite-plus-config-no-useless-catch-missing",
		description: "Missing no-useless-catch rule",
		message: `The 'no-useless-catch' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-rename",
		ruleId: "vite-plus-config-no-useless-rename-missing",
		description: "Missing no-useless-rename rule",
		message: `The 'no-useless-rename' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-sparse-arrays",
		ruleId: "vite-plus-config-no-sparse-arrays-missing",
		description: "Missing no-sparse-arrays rule",
		message: `The 'no-sparse-arrays' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-shadow-restricted-names",
		ruleId: "vite-plus-config-no-shadow-restricted-names-missing",
		description: "Missing no-shadow-restricted",
		message: `The 'no-shadow-restricted-names' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-string-starts-ends-with",
		ruleId: "vite-plus-config-unicorn-string-starts-ends-missing",
		description: "Missing unicorn/string-starts",
		message: `The 'unicorn/prefer-string-starts-ends-with' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/throw-new-error",
		ruleId: "vite-plus-config-unicorn-throw-error-missing",
		description: "Missing unicorn/throw-new-error",
		message: `The 'unicorn/throw-new-error' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-spread",
		ruleId: "vite-plus-config-unicorn-useless-spread-missing",
		description: "Missing unicorn/no-useless-spread",
		message: `The 'unicorn/no-useless-spread' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-assertion",
		ruleId: "vite-plus-config-no-unnecessary-type-assertion-missing",
		description: "Missing no-unnecessary-type-assertion",
		message: `The '@typescript-eslint/no-unnecessary-type-assertion' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/consistent-indexed-object-style",
		ruleId: "vite-plus-config-consistent-indexed-object-style-missing",
		description: "Missing consistent-indexed-object-style",
		message: `The '@typescript-eslint/consistent-indexed-object-style' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-empty-object-type",
		ruleId: "vite-plus-config-no-empty-object-type-missing",
		description: "Missing no-empty-object-type",
		message: `The '@typescript-eslint/no-empty-object-type' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-template-expression",
		ruleId: "vite-plus-config-no-unnecessary-template-missing",
		description: "Missing no-unnecessary-template",
		message: `The '@typescript-eslint/no-unnecessary-template-expression' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-arguments",
		ruleId: "vite-plus-config-no-unnecessary-type-arguments-missing",
		description: "Missing no-unnecessary-type-arguments",
		message: `The '@typescript-eslint/no-unnecessary-type-arguments' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unnecessary-type-constraint",
		ruleId: "vite-plus-config-no-unnecessary-type-constraint-missing",
		description: "Missing no-unnecessary-type-constraint",
		message: `The '@typescript-eslint/no-unnecessary-type-constraint' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/prefer-function-type",
		ruleId: "vite-plus-config-prefer-function-type-missing",
		description: "Missing prefer-function-type",
		message: `The '@typescript-eslint/prefer-function-type' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/prefer-return-this-type",
		ruleId: "vite-plus-config-prefer-return-this-type-missing",
		description: "Missing prefer-return-this-type",
		message: `The '@typescript-eslint/prefer-return-this-type' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/ban-tslint-comment",
		ruleId: "vite-plus-config-ban-tslint-comment-missing",
		description: "Missing ban-tslint-comment",
		message: `The '@typescript-eslint/ban-tslint-comment' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-mutable-exports",
		ruleId: "vite-plus-config-import-no-mutable-exports-missing",
		description: "Missing import/no-mutable-exports",
		message: `The 'import/no-mutable-exports' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-extend-native",
		ruleId: "vite-plus-config-no-extend-native-missing",
		description: "Missing no-extend-native",
		message: `The 'no-extend-native' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-proto",
		ruleId: "vite-plus-config-no-proto-missing",
		description: "Missing no-proto rule",
		message: `The 'no-proto' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-iterator",
		ruleId: "vite-plus-config-no-iterator-missing",
		description: "Missing no-iterator rule",
		message: `The 'no-iterator' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "prefer-object-has-own",
		ruleId: "vite-plus-config-prefer-object-has-own-missing",
		description: "Missing prefer-object-has-own",
		message: `The 'prefer-object-has-own' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-computed-key",
		ruleId: "vite-plus-config-no-useless-computed-key-missing",
		description: "Missing no-useless-computed-key",
		message: `The 'no-useless-computed-key' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "node/no-exports-assign",
		ruleId: "vite-plus-config-node-no-exports-assign-missing",
		description: "Missing node/no-exports-assign",
		message: `The 'node/no-exports-assign' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-webpack-loader-syntax",
		ruleId: "vite-plus-config-import-no-webpack-loader-missing",
		description: "Missing import/no-webpack-loader rule",
		message: `The 'import/no-webpack-loader-syntax' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-dynamic-require",
		ruleId: "vite-plus-config-import-no-dynamic-require-missing",
		description: "Missing import/no-dynamic-require",
		message: `The 'import/no-dynamic-require' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-amd",
		ruleId: "vite-plus-config-import-no-amd-missing",
		description: "Missing import/no-amd",
		message: `The 'import/no-amd' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "import/no-named-default",
		ruleId: "vite-plus-config-import-no-named-default-missing",
		description: "Missing import/no-named-default",
		message: `The 'import/no-named-default' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-new-wrappers",
		ruleId: "vite-plus-config-no-new-wrappers-missing",
		description: "Missing no-new-wrappers rule",
		message: `The 'no-new-wrappers' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-array-constructor",
		ruleId: "vite-plus-config-no-array-constructor-missing",
		description: "Missing no-array-constructor",
		message: `The 'no-array-constructor' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-caller",
		ruleId: "vite-plus-config-no-caller-missing",
		description: "Missing no-caller rule",
		message: `The 'no-caller' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-new-buffer",
		ruleId: "vite-plus-config-unicorn-no-new-buffer-missing",
		description: "Missing unicorn/no-new-buffer",
		message: `The 'unicorn/no-new-buffer' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-implied-eval",
		ruleId: "vite-plus-config-no-implied-eval-missing",
		description: "Missing no-implied-eval rule",
		message: `The 'no-implied-eval' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-new-func",
		ruleId: "vite-plus-config-no-new-func-missing",
		description: "Missing no-new-func rule",
		message: `The 'no-new-func' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-script-url",
		ruleId: "vite-plus-config-no-script-url-missing",
		description: "Missing no-script-url rule",
		message: `The 'no-script-url' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "default-case-last",
		ruleId: "vite-plus-config-default-case-last-missing",
		description: "Missing default-case-last",
		message: `The 'default-case-last' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "radix",
		ruleId: "vite-plus-config-radix-missing",
		description: "Missing radix rule in parseInt",
		message: `The 'radix' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-return-assign",
		ruleId: "vite-plus-config-no-return-assign-missing",
		description: "Missing no-return-assign",
		message: `The 'no-return-assign' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-multi-assign",
		ruleId: "vite-plus-config-no-multi-assign-missing",
		description: "Missing no-multi-assign",
		message: `The 'no-multi-assign' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-sequences",
		ruleId: "vite-plus-config-no-sequences-missing",
		description: "Missing no-sequences rule",
		message: `The 'no-sequences' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-labels",
		ruleId: "vite-plus-config-no-labels-missing",
		description: "Missing no-labels rule",
		message: `The 'no-labels' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-call",
		ruleId: "vite-plus-config-no-useless-call-missing",
		description: "Missing no-useless-call",
		message: `The 'no-useless-call' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "yoda",
		ruleId: "vite-plus-config-yoda-missing",
		description: "Missing yoda rule",
		message: `The 'yoda' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-unneeded-ternary",
		ruleId: "vite-plus-config-no-unneeded-ternary-missing",
		description: "Missing no-unneeded-ternary",
		message: `The 'no-unneeded-ternary' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "promise/no-new-statics",
		ruleId: "vite-plus-config-promise-no-new-statics-missing",
		description: "Missing promise/no-new-statics",
		message: `The 'promise/no-new-statics' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "promise/valid-params",
		ruleId: "vite-plus-config-promise-valid-params-missing",
		description: "Missing promise/valid-params",
		message: `The 'promise/valid-params' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "promise/no-return-in-finally",
		ruleId: "vite-plus-config-promise-no-return-finally-missing",
		description: "Missing no-return-in-finally",
		message: `The 'promise/no-return-in-finally' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "node/no-new-require",
		ruleId: "vite-plus-config-node-no-new-require-missing",
		description: "Missing node/no-new-require",
		message: `The 'node/no-new-require' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "node/no-path-concat",
		ruleId: "vite-plus-config-node-no-path-concat-missing",
		description: "Missing node/no-path-concat",
		message: `The 'node/no-path-concat' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-array-flat-depth",
		ruleId: "vite-plus-config-unicorn-flat-depth-missing",
		description: "Missing no-array-flat-depth",
		message: `The 'unicorn/no-unnecessary-array-flat-depth' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-array-splice-count",
		ruleId: "vite-plus-config-unicorn-splice-count-missing",
		description: "Missing no-array-splice-count",
		message: `The 'unicorn/no-unnecessary-array-splice-count' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unreadable-iife",
		ruleId: "vite-plus-config-unicorn-unreadable-iife-missing",
		description: "Missing unicorn/no-unreadable-iife",
		message: `The 'unicorn/no-unreadable-iife' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-switch-case",
		ruleId: "vite-plus-config-unicorn-useless-switch-missing",
		description: "Missing no-useless-switch-case",
		message: `The 'unicorn/no-useless-switch-case' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-useless-promise-resolve-reject",
		ruleId: "vite-plus-config-unicorn-useless-promise-missing",
		description: "Missing no-useless-promise",
		message: `The 'unicorn/no-useless-promise-resolve-reject' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-array-some",
		ruleId: "vite-plus-config-unicorn-prefer-array-some-missing",
		description: "Missing unicorn/prefer-array-some",
		message: `The 'unicorn/prefer-array-some' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/no-unnecessary-slice-end",
		ruleId: "vite-plus-config-unicorn-unnecessary-slice-missing",
		description: "Missing no-unnecessary-slice-end",
		message: `The 'unicorn/no-unnecessary-slice-end' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/explicit-timer-delay",
		ruleId: "vite-plus-config-unicorn-explicit-timer-delay-missing",
		description: "Missing explicit-timer-delay",
		message: `The 'unicorn/explicit-timer-delay' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-date-now",
		ruleId: "vite-plus-config-unicorn-prefer-date-now-missing",
		description: "Missing unicorn/prefer-date-now",
		message: `The 'unicorn/prefer-date-now' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-math-min-max",
		ruleId: "vite-plus-config-unicorn-prefer-math-min-max-missing",
		description: "Missing prefer-math-min-max",
		message: `The 'unicorn/prefer-math-min-max' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-math-trunc",
		ruleId: "vite-plus-config-unicorn-prefer-math-trunc-missing",
		description: "Missing unicorn/prefer-math-trunc",
		message: `The 'unicorn/prefer-math-trunc' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-prototype-methods",
		ruleId: "vite-plus-config-unicorn-prefer-proto-methods-missing",
		description: "Missing prefer-prototype-methods",
		message: `The 'unicorn/prefer-prototype-methods' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-regexp-test",
		ruleId: "vite-plus-config-unicorn-prefer-regexp-test-missing",
		description: "Missing prefer-regexp-test",
		message: `The 'unicorn/prefer-regexp-test' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-default-parameters",
		ruleId: "vite-plus-config-unicorn-default-params-missing",
		description: "Missing prefer-default-parameters",
		message: `The 'unicorn/prefer-default-parameters' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-global-this",
		ruleId: "vite-plus-config-unicorn-prefer-global-this-missing",
		description: "Missing prefer-global-this",
		message: `The 'unicorn/prefer-global-this' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-optional-catch-binding",
		ruleId: "vite-plus-config-unicorn-opt-catch-binding-missing",
		description: "Missing opt-catch-binding",
		message: `The 'unicorn/prefer-optional-catch-binding' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "unicorn/prefer-string-trim-start-end",
		ruleId: "vite-plus-config-unicorn-string-trim-missing",
		description: "Missing string-trim-start-end",
		message: `The 'unicorn/prefer-string-trim-start-end' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "prefer-exponentiation-operator",
		ruleId: "vite-plus-config-prefer-exponentiation-missing",
		description: "Missing prefer-exponentiation",
		message: `The 'prefer-exponentiation-operator' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "prefer-numeric-literals",
		ruleId: "vite-plus-config-prefer-numeric-literals-missing",
		description: "Missing prefer-numeric-literals",
		message: `The 'prefer-numeric-literals' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "prefer-rest-params",
		ruleId: "vite-plus-config-prefer-rest-params-missing",
		description: "Missing prefer-rest-params",
		message: `The 'prefer-rest-params' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-duplicate-hooks",
		ruleId: "vite-plus-config-vitest-duplicate-hooks-allowed",
		description: "Missing vitest/no-duplicate-hooks",
		message: `The 'vitest/no-duplicate-hooks' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-test-prefixes",
		ruleId: "vite-plus-config-vitest-test-prefixes-allowed",
		description: "Missing vitest/no-test-prefixes",
		message: `The 'vitest/no-test-prefixes' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-test-return-statement",
		ruleId: "vite-plus-config-vitest-test-return-allowed",
		description: "Missing test-return-statement",
		message: `The 'vitest/no-test-return-statement' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-contain",
		ruleId: "vite-plus-config-vitest-to-contain-missing",
		description: "Missing vitest/prefer-to-contain",
		message: `The 'vitest/prefer-to-contain' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be",
		ruleId: "vite-plus-config-vitest-to-be-missing",
		description: "Missing vitest/prefer-to-be",
		message: `The 'vitest/prefer-to-be' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-comparison-matcher",
		ruleId: "vite-plus-config-vitest-comparison-matcher-missing",
		description: "Missing comparison-matcher",
		message: `The 'vitest/prefer-comparison-matcher' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-import-node-test",
		ruleId: "vite-plus-config-vitest-no-import-node-test-missing",
		description: "Missing no-import-node-test",
		message: `The 'vitest/no-import-node-test' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/no-interpolation-in-snapshots",
		ruleId: "vite-plus-config-vitest-interpolation-snap-missing",
		description: "Missing no-interpolation-snap",
		message: `The 'vitest/no-interpolation-in-snapshots' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-expect-resolves",
		ruleId: "vite-plus-config-vitest-expect-resolves-missing",
		description: "Missing prefer-expect-resolves",
		message: `The 'vitest/prefer-expect-resolves' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-mock-promise-shorthand",
		ruleId: "vite-plus-config-vitest-mock-promise-missing",
		description: "Missing mock-promise-shorthand",
		message: `The 'vitest/prefer-mock-promise-shorthand' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-mock-return-shorthand",
		ruleId: "vite-plus-config-vitest-mock-return-missing",
		description: "Missing mock-return-shorthand",
		message: `The 'vitest/prefer-mock-return-shorthand' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-strict-equal",
		ruleId: "vite-plus-config-vitest-strict-equal-missing",
		description: "Missing prefer-strict-equal",
		message: `The 'vitest/prefer-strict-equal' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-truthy",
		ruleId: "vite-plus-config-vitest-to-be-truthy-missing",
		description: "Missing prefer-to-be-truthy",
		message: `The 'vitest/prefer-to-be-truthy' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-falsy",
		ruleId: "vite-plus-config-vitest-to-be-falsy-missing",
		description: "Missing prefer-to-be-falsy",
		message: `The 'vitest/prefer-to-be-falsy' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-to-be-object",
		ruleId: "vite-plus-config-vitest-to-be-object-missing",
		description: "Missing prefer-to-be-object",
		message: `The 'vitest/prefer-to-be-object' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vitest/prefer-todo",
		ruleId: "vite-plus-config-vitest-todo-missing",
		description: "Missing vitest/prefer-todo rule",
		message: `The 'vitest/prefer-todo' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-expose-after-await",
		ruleId: "vite-plus-config-vue-expose-after-await-allowed",
		description: "Missing no-expose-after-await",
		message: `The 'vue/no-expose-after-await' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/return-in-computed-property",
		ruleId: "vite-plus-config-vue-return-in-computed-missing",
		description: "Missing return-in-computed",
		message: `The 'vue/return-in-computed-property' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-import-compiler-macros",
		ruleId: "vite-plus-config-vue-no-import-macros-missing",
		description: "Missing no-import-compiler-macros",
		message: `The 'vue/no-import-compiler-macros' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/valid-next-tick",
		ruleId: "vite-plus-config-vue-valid-next-tick-missing",
		description: "Missing vue/valid-next-tick",
		message: `The 'vue/valid-next-tick' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-deprecated-destroyed-lifecycle",
		ruleId: "vite-plus-config-vue-no-deprecated-lifecycle-missing",
		description: "Missing no-deprecated-lifecycle",
		message: `The 'vue/no-deprecated-destroyed-lifecycle' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/component-definition-name-casing",
		ruleId: "vite-plus-config-vue-component-casing-missing",
		description: "Missing component-definition-casing",
		message: `The 'vue/component-definition-name-casing' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/define-emits-declaration",
		ruleId: "vite-plus-config-vue-define-emits-missing",
		description: "Missing define-emits-declaration",
		message: `The 'vue/define-emits-declaration' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/define-props-declaration",
		ruleId: "vite-plus-config-vue-define-props-missing",
		description: "Missing define-props-declaration",
		message: `The 'vue/define-props-declaration' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/next-tick-style",
		ruleId: "vite-plus-config-vue-next-tick-style-missing",
		description: "Missing vue/next-tick-style",
		message: `The 'vue/next-tick-style' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/prop-name-casing",
		ruleId: "vite-plus-config-vue-prop-name-casing-missing",
		description: "Missing vue/prop-name-casing",
		message: `The 'vue/prop-name-casing' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/require-direct-export",
		ruleId: "vite-plus-config-vue-require-direct-export-missing",
		description: "Missing require-direct-export",
		message: `The 'vue/require-direct-export' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/require-typed-ref",
		ruleId: "vite-plus-config-vue-require-typed-ref-missing",
		description: "Missing vue/require-typed-ref",
		message: `The 'vue/require-typed-ref' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/explicit-member-accessibility",
		ruleId: "vite-plus-config-explicit-member-accessibility-missing",
		description: "Missing explicit accessibility",
		message: `The '@typescript-eslint/explicit-member-accessibility' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/explicit-function-return-type",
		ruleId: "vite-plus-config-explicit-function-return-type-missing",
		description: "Missing explicit return type",
		message: `The '@typescript-eslint/explicit-function-return-type' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "@typescript-eslint/no-unused-vars",
		ruleId: "vite-plus-config-no-unused-vars-missing",
		description: "Missing calibrated no-unused-vars",
		message: `The '@typescript-eslint/no-unused-vars' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-required-prop-with-default",
		ruleId: "vite-plus-config-vue-no-required-prop-with-default-missing",
		description: "Missing no-required-prop-with-default",
		message: `The 'vue/no-required-prop-with-default' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "vue/no-deprecated-model-definition",
		ruleId: "vite-plus-config-vue-no-deprecated-model-def-missing",
		description: "Missing no-deprecated-model-definition",
		message: `The 'vue/no-deprecated-model-definition' rule must be configured as 'error' in vite.config.ts.`
	},
	{
		oxlintRule: "no-useless-assignment",
		ruleId: "vite-plus-config-no-useless-assignment-missing",
		description: "Missing no-useless-assignment",
		message: `The 'no-useless-assignment' rule must be configured as 'error' in vite.config.ts.`
	}
];
function validateSpecialAntiCastrationRules(summary, fileName) {
	const findings = [];
	if (!isRuleValueCompliant("@typescript-eslint/consistent-type-assertions", summary.lintRules.get("@typescript-eslint/consistent-type-assertions"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Strict linter and Oxlint standards",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@typescript-eslint/consistent-type-assertions",
		message: `Configuring '@typescript-eslint/consistent-type-assertions' as 'error' with 'as' style and objectLiteralTypeAssertions: 'never' is required.`
	});
	if (!isRuleValueCompliant("no-empty", summary.lintRules.get("no-empty"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Strict linter and Oxlint standards",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "no-empty",
		message: `The 'no-empty' rule must be configured as 'error' with allowEmptyCatch: false in vite.config.ts.`
	});
	if (!isRuleValueCompliant("eqeqeq", summary.lintRules.get("eqeqeq"))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Strict linter and Oxlint standards",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "eqeqeq",
		message: `The 'eqeqeq' rule must be configured as ['error', 'always'] in vite.config.ts.`
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
		ruleDescription: "Vite+: Formatting standards with Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt",
		message: `Missing 'fmt' section in vite.config.ts to govern native formatting with Oxfmt.`
	});
	else if (summary.fmtConfig.sortImports !== true || summary.fmtConfig.sortPackageJson !== true) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-fmt",
		ruleDescription: "Vite+: Formatting standards with Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt",
		message: `The 'fmt' section in vite.config.ts must include sortImports: true and sortPackageJson: true for canonical formatting.`
	});
	if (!summary.hasSection("staged")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-core",
		ruleDescription: "Vite+: Root structure and base Vite+ sections",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "staged",
		message: `Missing 'staged' section in vite.config.ts to enable native pre-commit git hooks.`
	});
	if (!summary.hasSection("test")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-core",
		ruleDescription: "Vite+: Root structure and base Vite+ sections",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "test",
		message: `Missing 'test' section in vite.config.ts to run tests with integrated Vitest.`
	});
	if (auditConfig?.packageDistribution?.enabled === true) {
		if (!summary.hasSection("pack")) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-pack",
			ruleDescription: "Vite+: Packaging and distribution standards",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "pack",
			message: `Missing 'pack' section in vite.config.ts to govern native Vite+ packaging and validations.`
		});
		else if (summary.packConfig.publint !== true || !summary.hasPackAttw) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-pack",
			ruleDescription: "Vite+: Packaging and distribution standards",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "pack",
			message: `The 'pack' section in vite.config.ts must include publint: true and attw: { profile: 'esm-only' } for official distribution and type validation.`
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
		ruleDescription: "Vite+: Strict linter and Oxlint standards",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "domain-type-plugin",
		message: `Missing jsPlugins: ['@francogp/auditor/domain-type-plugin'] registration in the 'lint' section of vite.config.ts.`
	});
	if (summary.hasSection("lint") && summary.lintOptions.typeAware === void 0) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-lint",
		ruleDescription: "Vite+: Strict linter and Oxlint standards",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "lint.options",
		message: `Missing 'options' section configured with 'typeAware' and 'typeCheck' under 'lint' in vite.config.ts.`
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
		ruleDescription: "Vite+: Formatting standards with Oxfmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt.ignorePatterns",
		message: `Missing exclusion patterns in fmt of vite.config.ts: [${missingFmt.join(", ")}]. Run 'npm run auditor:fix' or 'auditor fix' to synchronize automatically.`
	});
	if (missingLint.length > 0) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-ts",
		ruleDescription: "Vite+: TypeScript and test synchronization",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "lint.ignorePatterns",
		message: `Missing exclusion patterns required by audit.config.ts in lint of vite.config.ts: [${missingLint.join(", ")}]. Run 'npm run auditor:fix' or 'auditor fix' to synchronize automatically.`
	});
	const rawTestRoots = auditConfig.paths?.testRoots;
	if (rawTestRoots && rawTestRoots.length > 0 && summary.hasSection("test")) {
		const missingRoots = resolveVitestRoots(auditConfig).filter((r) => !summary.testInclude.some((inc) => inc.startsWith(`${r}/`)));
		if (missingRoots.length > 0) findings.push({
			suiteId: "validate_vite_plus_config",
			suiteName: "Vite+ Unified Configuration Validator",
			ruleId: "vite-plus-config-ts",
			ruleDescription: "Vite+: TypeScript and test synchronization",
			severity: "error",
			file: fileName,
			line: 1,
			col: 1,
			context: "test.include",
			message: `Test roots declared in audit.config.ts (${missingRoots.join(", ")}) are not synchronized in 'test.include' of vite.config.ts. Run 'npm run auditor:fix' or 'auditor fix' to synchronize automatically.`
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
	description: "Unified Vite+ configuration (vite.config.ts)",
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
	"vite-plus-config-core": "Causa Raíz:\nEl archivo vite.config.ts no existe en la raíz del proyecto, le faltan bloques fundamentales de la plataforma Vite+ (como test o staged), conviven archivos de configuración legados obsoletos (.eslintrc.*, vitest.config.*, .prettierrc.*) que rompen la unificación del toolchain, o se detectaron plugins de compresión estática caseros (scripts/maintenance/vite-plugin-precompress*.ts) o librerías de terceros obsoletas (vite-plugin-compression).\n\nDiagnóstico:\nComprueba si existen archivos de configuración redundantes de herramientas aisladas, plugins de compresión caseros en scripts/, o si la sección \"test\" / \"staged\" está ausente en vite.config.ts.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor generará la configuración unificada canónica, purgará los archivos legados redundantes y migrará la compresión hacia \"vitePrecompressPlugin\" oficial de @francogp/auditor.\n2. Asegura que los comandos de compilación y pruebas invoquen el binario \"vp\" (\"vp test\", \"vp build\", \"vp dev\").",
	"vite-plus-config-lint": "Causa Raíz:\nLa sección \"lint\" en vite.config.ts no cumple con el baseline obligatorio anti-castración (Anti-Castration Mandate), tiene reglas desactivadas (en \"off\" o null), o carece de plugins de dominio requeridos.\nPor mandato de arquitectura estricta, las reglas de TypeScript estricto, pureza de immutabilidad y control de flujo no pueden degradarse para ocultar defectos de código.\n\nDiagnóstico:\nEl mensaje de error indica qué regla de Oxlint o @typescript-eslint falta o tiene un valor inferior a \"error\".\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor inyectará y re-sincronizará el catálogo completo de reglas canónicas en vite.config.ts.\n2. Corrige los defectos reales en el código fuente señalados por el linter.",
	"vite-plus-config-fmt": "Causa Raíz:\nLa sección \"fmt\" está ausente en vite.config.ts o no declara las opciones mandatorias \"sortImports: true\" y \"sortPackageJson: true\".\nOxfmt exige ordenamiento determinista de importaciones y claves de package.json para evitar conflictos en git diffs.\n\nDiagnóstico:\nRevisa el objeto \"fmt\" en vite.config.ts.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" para reparar la configuración automáticamente.\n2. O bien añade en vite.config.ts:\n   fmt: { sortImports: true, sortPackageJson: true }",
	"vite-plus-config-pack": "Causa Raíz:\nEl paquete está configurado como biblioteca pública o paquete compartible, pero carece de la sección \"pack\" en vite.config.ts con los validadores publint y Are The Types Wrong (attw).\nSin esta verificación, pueden publicarse paquetes con exports rotos o tipos .d.ts incompatibles con ESM/CJS.\n\nDiagnóstico:\nRevisa si el paquete define exports o binarios y carece del bloque pack en vite.config.ts.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" para inyectar la sección pack canónica.\n2. Configura: pack: { publint: true, attw: { profile: \"esm-only\" } }.",
	"vite-plus-config-ts": "Causa Raíz:\nExiste una discrepancia entre las rutas gobernadas en .auditor/audit.config.ts (paths.testRoots, paths.ignoreGlobs) y la configuración de \"test.include\" e \"ignorePatterns\" en vite.config.ts.\naudit.config.ts actúa como la Fuente Única de Verdad (SSoT) del proyecto y debe reflejarse fielmente en el runner de pruebas y el linter.\n\nDiagnóstico:\nComprueba si agregaste nuevos directorios de pruebas en audit.config.ts sin sincronizarlos en vite.config.ts.\n\nSolución Canónica:\nEjecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor sincronizará automáticamente los patrones de test y exclusión."
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
			requiredPermissions: [],
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
			description: "Validates Vite+ configuration and domain rules",
			family: "architecture",
			packageName: "Vite+",
			configKey: "vitePlusConfig.enabled",
			defaultConfig: {
				enabled: true,
				precompress: {
					enabled: true,
					server: "nginx",
					spa: true,
					report: "summary",
					threshold: 512
				}
			},
			criticalConfig: {},
			icon: "⚡",
			ruleIds: VITE_PLUS_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(VITE_PLUS_CONFIG_RULES, "setup"),
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
						message: `File '${legacy}' is an obsolete configuration file. All configuration must live in vite.config.ts and synchronize from .auditor/audit.config.ts.`,
						fixable: true
					});
				}
			}
			const homebrewFiles = findHomebrewCompressionFiles(this.projectRoot);
			for (const homebrewFile of homebrewFiles) if (this.isFixActive()) {
				cleanHomebrewCompressionFiles(this.projectRoot);
				break;
			} else this.addViolation({
				ruleId: "vite-plus-config-core",
				severity: "error",
				file: homebrewFile,
				line: 1,
				context: "homebrew-compression",
				message: `File '${homebrewFile}' is a non-standard homebrew compression plugin. All compression must be resolved via official 'vitePrecompressPlugin' from '@francogp/auditor'. Run 'npm run auditor:fix' or 'auditor fix' to migrate automatically.`,
				fixable: true
			});
			if (exists) {
				const homebrewImports = detectHomebrewCompressionImports(content);
				for (const imp of homebrewImports) if (this.isFixActive()) {
					const { content: migratedContent, modified } = migrateHomebrewCompressionInViteConfig(content);
					if (modified) {
						fs.writeFileSync(resolvedPath, migratedContent, "utf-8");
						content = migratedContent;
					}
					cleanHomebrewCompressionFiles(this.projectRoot);
					break;
				} else this.addViolation({
					ruleId: "vite-plus-config-core",
					severity: "error",
					file: relFileName,
					line: 1,
					context: "homebrew-compression",
					message: `Non-standard compression plugin import '${imp}' detected in vite.config.ts. Use official 'vitePrecompressPlugin' from '@francogp/auditor'. Run 'npm run auditor:fix' or 'auditor fix' to migrate automatically.`,
					fixable: true
				});
			}
			if (!exists) {
				this.addViolation({
					ruleId: "vite-plus-config-core",
					severity: "error",
					file: "vite.config.ts",
					line: 1,
					context: "vite.config.ts",
					message: `Missing unified configuration file 'vite.config.ts'. Run 'npm run auditor:fix' or 'auditor fix' to generate it automatically.`,
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
