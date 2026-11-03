import "./auditConfigTypes.js";
import { AUDITOR_VERSION } from "./version.js";
// src/core/auditConfigDefaults.ts
/**
* packages/auditor/src/core/auditConfigDefaults.ts
*
* Canonical default configuration schema and subsystem key collectors.
*/
const DEFAULT_SIMILAR_CODE_THRESHOLD = .95;
const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
const DEFAULT_PRECOMPRESS_THRESHOLD_BYTES = 512;
const CANONICAL_CORE_DOMAIN_RULES = {
	"@francogp/domain-type/no-double-cast-unknown": "error",
	"@francogp/domain-type/no-boolean-literal-annotation": "error",
	"@francogp/domain-type/no-broad-string-array": "error",
	"@francogp/domain-type/watch-reactive-property-getter": "error",
	"@francogp/domain-type/no-destructured-reactive": "error",
	"@francogp/domain-type/no-store-destructuring-without-storetorefs": "error",
	"@francogp/domain-type/no-direct-state-mutation-outside-actions": "error",
	"@francogp/domain-type/no-deprecated-router-next": "error"
};
const CANONICAL_REACTIVE_SECURITY_RULES = {
	"@francogp/domain-type/no-define-async-component-in-router": "error",
	"@francogp/domain-type/no-window-location-navigation": "error",
	"@francogp/domain-type/no-silent-promise-catch": "error",
	"@francogp/domain-type/no-silent-mock-fallbacks": "error",
	"@francogp/domain-type/strict-catch-narrowing": "error",
	"@francogp/domain-type/dom-event-leak": "error",
	"@francogp/domain-type/interval-leak": "error",
	"@francogp/domain-type/no-legacy-date": "error"
};
const CANONICAL_SIMPLIFICATION_SFC_RULES = {
	"@francogp/domain-type/no-boolean-trap-parameters": "error",
	"@francogp/domain-type/no-massive-switch": "error",
	"@francogp/domain-type/no-tautological-integration-mocks": "error",
	"@francogp/domain-type/playwright-id-locators-only": "error",
	"@francogp/domain-type/no-playwright-force-click": "error",
	"@francogp/domain-type/no-test-timeout-inflation": "error",
	"@francogp/domain-type/no-playwright-polling-waits": "error"
};
const CANONICAL_VUE_SECURITY_RULES = {
	"@francogp/domain-type/script-setup-required": "error",
	"@francogp/domain-type/vue-template-quote-escaping": "error",
	"@francogp/domain-type/no-data-provider-in-template": "error",
	"@francogp/domain-type/no-raw-html-injection": "error",
	"@francogp/domain-type/no-insecure-random": "error",
	"@francogp/domain-type/no-permissive-cors": "error",
	"@francogp/domain-type/no-unvalidated-redirect": "error"
};
const CANONICAL_DOMAIN_SCHEMA_RULES = {
	"@francogp/domain-type/no-record-string-key": "error",
	"@francogp/domain-type/no-unbranded-id": "error",
	"@francogp/domain-type/no-untyped-string-set-map": "error",
	"@francogp/domain-type/no-naked-string-union": "error",
	"@francogp/domain-type/valibot-schema-type-parity": "error",
	"@francogp/domain-type/no-redundant-constant-alias": "error",
	"@francogp/domain-type/no-literal-suffix-constant": "error"
};
const CANONICAL_PATH_SECRET_RULES = {
	"@francogp/domain-type/unsafe-path-concat": "error",
	"@francogp/domain-type/unsanitized-env-argv-path": "error",
	"@francogp/domain-type/untrusted-url-fetch": "error",
	"@francogp/domain-type/hardcoded-slash-path": "error",
	"@francogp/domain-type/no-hardcoded-secrets": "error",
	"@francogp/domain-type/ephemeral-no-source-temp-references": "error"
};
const CANONICAL_STORAGE_CLI_RULES = {
	"@francogp/domain-type/no-raw-local-storage": "error",
	"@francogp/domain-type/no-raw-session-storage": "error",
	"@francogp/domain-type/no-direct-process-argv": "error",
	"@francogp/domain-type/no-banned-cli-parsers": "error",
	"@francogp/domain-type/no-homebrew-flag-parsing": "error",
	"@francogp/domain-type/no-cli-eval-bypass": "error"
};
const CANONICAL_QUERY_PERSISTENCE_RULES = {
	"@francogp/domain-type/no-await-in-loops-query": "error",
	"@francogp/domain-type/no-select-star-in-queries": "error",
	"@francogp/domain-type/require-paginated-queries": "error",
	"@francogp/domain-type/no-direct-database-instantiation": "error",
	"@francogp/domain-type/require-storage-try-catch": "error"
};
const CANONICAL_GSAP_RULES = {
	"@francogp/domain-type/no-gsap-layout-properties": "error",
	"@francogp/domain-type/gsap-named-timer-constants": "error",
	"@francogp/domain-type/no-gsap-banned-ui-timers": "error",
	"@francogp/domain-type/require-gsap-cleanup-on-unmount": "error",
	"@francogp/domain-type/no-unscoped-component-selectors": "error",
	"@francogp/domain-type/no-nested-scrolltrigger": "error",
	"@francogp/domain-type/no-scrolltrigger-markers-production": "error"
};
const CANONICAL_AUDITOR_METADATA_RULES = {
	"@francogp/domain-type/no-file-level-suppressions": "error",
	"@francogp/domain-type/auditor-class-inheritance": "error",
	"@francogp/domain-type/no-homebrew-file-walker": "error",
	"@francogp/domain-type/auditor-rule-description-limit": "error"
};
const DEFAULT_CANONICAL_LINT_RULES = {
	"@typescript-eslint/no-explicit-any": "error",
	"@typescript-eslint/ban-ts-comment": "error",
	"@typescript-eslint/consistent-type-assertions": ["error", {
		assertionStyle: "as",
		objectLiteralTypeAssertions: "never"
	}],
	"@typescript-eslint/no-floating-promises": "error",
	...CANONICAL_CORE_DOMAIN_RULES,
	...CANONICAL_REACTIVE_SECURITY_RULES,
	...CANONICAL_SIMPLIFICATION_SFC_RULES,
	...CANONICAL_VUE_SECURITY_RULES,
	...CANONICAL_DOMAIN_SCHEMA_RULES,
	...CANONICAL_PATH_SECRET_RULES,
	...CANONICAL_STORAGE_CLI_RULES,
	...CANONICAL_QUERY_PERSISTENCE_RULES,
	...CANONICAL_GSAP_RULES,
	...CANONICAL_AUDITOR_METADATA_RULES,
	"unicorn/prefer-node-protocol": "error",
	"no-debugger": "error",
	"no-console": ["error", { allow: ["warn", "error"] }],
	"no-else-return": "error",
	"no-empty": ["error", { allowEmptyCatch: false }],
	"max-depth": ["error", 4],
	eqeqeq: ["error", "always"],
	"prefer-const": "error",
	"no-var": "error",
	"no-self-compare": "error",
	"no-eval": "error",
	"unicode-bom": "error",
	"typescript/prefer-as-const": "error",
	"typescript/no-for-in-array": "error",
	"typescript/no-duplicate-enum-values": "error",
	"typescript/no-duplicate-type-constituents": "error",
	"typescript/no-extra-non-null-assertion": "error",
	"typescript/no-useless-empty-export": "error",
	"typescript/no-wrapper-object-types": "error",
	"typescript/no-unnecessary-type-assertion": "error",
	"@typescript-eslint/no-unnecessary-type-assertion": "error",
	"@typescript-eslint/consistent-indexed-object-style": "error",
	"@typescript-eslint/no-empty-object-type": "error",
	"@typescript-eslint/no-unnecessary-template-expression": "error",
	"@typescript-eslint/no-unnecessary-type-arguments": "error",
	"@typescript-eslint/no-unnecessary-type-constraint": "error",
	"@typescript-eslint/prefer-function-type": "error",
	"@typescript-eslint/prefer-return-this-type": "error",
	"@typescript-eslint/ban-tslint-comment": "error",
	"oxc/const-comparisons": "error",
	"oxc/missing-throw": "error",
	"oxc/uninvoked-array-callback": "error",
	"unicorn/no-new-array": "error",
	"unicorn/prefer-set-size": "error",
	"unicorn/no-instanceof-array": "error",
	"unicorn/no-useless-fallback-in-spread": "error",
	"unicorn/no-useless-promise-resolve-reject": "error",
	"unicorn/prefer-string-starts-ends-with": "error",
	"unicorn/throw-new-error": "error",
	"unicorn/no-useless-spread": "error",
	"unicorn/no-new-buffer": "error",
	"promise/no-new-statics": "error",
	"promise/valid-params": "error",
	"promise/no-return-in-finally": "error",
	"promise/catch-or-return": "error",
	"node/no-exports-assign": "error",
	"node/no-new-require": "error",
	"node/no-path-concat": "error",
	"import/no-duplicates": "error",
	"import/no-self-import": "error",
	"import/no-empty-named-blocks": "error",
	"import/no-mutable-exports": "error",
	"import/no-webpack-loader-syntax": "error",
	"import/no-dynamic-require": "error",
	"import/no-amd": "error",
	"import/no-named-default": "error",
	"jsx-a11y/aria-props": "error",
	"jsx-a11y/aria-unsupported-elements": "error",
	"jsx-a11y/no-aria-hidden-on-focusable": "error",
	"jsx-a11y/no-redundant-roles": "error",
	"vitest/no-identical-title": "error",
	"vitest/no-focused-tests": "error",
	"vitest/no-disabled-tests": "error",
	"vitest/expect-expect": "error",
	"vitest/prefer-to-have-length": "error",
	"vitest/no-import-node-test": "error",
	"vitest/valid-title": "error",
	"vue/prefer-import-from-vue": "error",
	"vue/no-deprecated-destroyed-lifecycle": "error",
	"vue/valid-next-tick": "error",
	"vue/next-tick-style": "error",
	"vue/no-async-in-computed-properties": "error",
	"vue/no-side-effects-in-computed-properties": "error",
	"vue/no-export-in-script-setup": "error",
	"vue/no-lifecycle-after-await": "error",
	"vue/no-watch-after-await": "error",
	"no-useless-catch": "error",
	"no-useless-rename": "error",
	"no-sparse-arrays": "error",
	"no-shadow-restricted-names": "error",
	"no-extend-native": "error",
	"no-proto": "error",
	"no-iterator": "error",
	"prefer-object-has-own": "error",
	"no-useless-computed-key": "error",
	"no-new-wrappers": "error",
	"no-array-constructor": "error",
	"no-caller": "error",
	"no-implied-eval": "error",
	"no-new-func": "error",
	"no-script-url": "error",
	"default-case-last": "error",
	radix: "error",
	"no-return-assign": "error",
	"no-multi-assign": "error",
	"no-sequences": "error",
	"no-labels": "error",
	"no-useless-call": "error",
	yoda: "error",
	"no-unneeded-ternary": "error",
	"unicorn/no-unnecessary-array-flat-depth": "error",
	"unicorn/no-unnecessary-array-splice-count": "error",
	"unicorn/no-unreadable-iife": "error",
	"unicorn/no-useless-switch-case": "error",
	"unicorn/prefer-array-some": "error",
	"unicorn/no-unnecessary-slice-end": "error",
	"unicorn/explicit-timer-delay": "error",
	"unicorn/prefer-date-now": "error",
	"unicorn/prefer-math-min-max": "error",
	"unicorn/prefer-math-trunc": "error",
	"unicorn/prefer-prototype-methods": "error",
	"unicorn/prefer-regexp-test": "error",
	"unicorn/prefer-default-parameters": "error",
	"unicorn/prefer-global-this": "error",
	"unicorn/prefer-optional-catch-binding": "error",
	"unicorn/prefer-string-trim-start-end": "error",
	"prefer-exponentiation-operator": "error",
	"prefer-numeric-literals": "error",
	"prefer-rest-params": "error",
	"vitest/no-duplicate-hooks": "error",
	"vitest/no-test-prefixes": "error",
	"vitest/no-test-return-statement": "error",
	"vitest/prefer-to-contain": "error",
	"vitest/prefer-to-be": "error",
	"vitest/prefer-comparison-matcher": "error",
	"vitest/no-interpolation-in-snapshots": "error",
	"vitest/prefer-expect-resolves": "error",
	"vitest/prefer-mock-promise-shorthand": "error",
	"vitest/prefer-mock-return-shorthand": "error",
	"vitest/prefer-strict-equal": "error",
	"vitest/prefer-to-be-truthy": "error",
	"vitest/prefer-to-be-falsy": "error",
	"vitest/prefer-to-be-object": "error",
	"vitest/prefer-todo": "error",
	"vue/no-expose-after-await": "error",
	"vue/return-in-computed-property": "error",
	"vue/no-import-compiler-macros": "error",
	"vue/component-definition-name-casing": "error",
	"vue/define-emits-declaration": "error",
	"vue/define-props-declaration": "error",
	"vue/prop-name-casing": "error",
	"vue/require-direct-export": "error",
	"vue/require-typed-ref": "error",
	"@typescript-eslint/explicit-member-accessibility": ["error", { accessibility: "explicit" }],
	"@typescript-eslint/explicit-function-return-type": ["error", {
		allowExpressions: true,
		allowTypedFunctionExpressions: true,
		allowHigherOrderFunctions: true,
		allowDirectConstAssertionInArrowFunctions: true
	}],
	"@typescript-eslint/no-unused-vars": "error",
	"vue/no-required-prop-with-default": "error",
	"vue/no-deprecated-model-definition": "error",
	"no-useless-assignment": "error"
};
const CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES = Object.fromEntries([
	"typescript/explicit-function-return-type",
	"@typescript-eslint/explicit-function-return-type",
	"vitest/prefer-to-be-truthy",
	"vitest/prefer-to-be-falsy",
	"vitest/prefer-strict-equal",
	"vitest/no-conditional-expect",
	"vitest/require-mock-type-parameters",
	"vitest/prefer-mock-return-shorthand",
	"vitest/expect-expect",
	"typescript/no-floating-promises",
	"@typescript-eslint/no-floating-promises",
	"no-console",
	"unicorn/prefer-global-this",
	"vue/require-typed-ref",
	"@francogp/domain-type/no-double-cast-unknown",
	"@francogp/domain-type/no-broad-string-array",
	"@francogp/domain-type/no-legacy-date",
	"@francogp/domain-type/no-raw-local-storage",
	"@francogp/domain-type/no-insecure-random",
	"@francogp/domain-type/no-select-star-in-queries",
	"@francogp/domain-type/require-paginated-queries",
	"@francogp/domain-type/no-untyped-string-set-map",
	"@francogp/domain-type/no-hardcoded-secrets",
	"typescript/consistent-type-assertions",
	"typescript/no-explicit-any",
	"typescript/explicit-member-accessibility",
	"typescript/await-thenable",
	"typescript/unbound-method",
	"typescript/require-array-sort-compare",
	"unicorn/no-new-array",
	"max-depth",
	"no-script-url",
	"typescript/no-implied-eval",
	"no-new-func",
	"no-unused-expressions",
	"@francogp/domain-type/unsafe-path-concat",
	"@francogp/domain-type/hardcoded-slash-path",
	"@francogp/domain-type/no-record-string-key",
	"@francogp/domain-type/ephemeral-no-source-temp-references",
	"@francogp/domain-type/no-direct-process-argv",
	"@francogp/domain-type/no-homebrew-flag-parsing",
	"@francogp/domain-type/no-file-level-suppressions",
	"@francogp/domain-type/auditor-class-inheritance",
	"@francogp/domain-type/no-homebrew-file-walker",
	"@francogp/domain-type/auditor-rule-description-limit",
	"@francogp/domain-type/require-storage-try-catch",
	"@francogp/domain-type/no-raw-session-storage",
	"@francogp/domain-type/no-silent-promise-catch",
	"@francogp/domain-type/no-await-in-loops-query",
	"@francogp/domain-type/no-literal-suffix-constant",
	"@francogp/domain-type/no-raw-html-injection",
	"@francogp/domain-type/no-redundant-constant-alias"
].map((rule) => [rule, "off"]));
const CANONICAL_DYNAMIC_SCRIPT_OVERRIDE_RULES = Object.fromEntries([
	"no-console",
	"unicorn/prefer-global-this",
	"typescript/no-floating-promises",
	"@typescript-eslint/no-floating-promises",
	"typescript/explicit-function-return-type",
	"@typescript-eslint/explicit-function-return-type",
	"@francogp/domain-type/no-insecure-random",
	"@francogp/domain-type/no-broad-string-array",
	"@francogp/domain-type/no-raw-local-storage",
	"@francogp/domain-type/no-select-star-in-queries",
	"@francogp/domain-type/require-paginated-queries",
	"@francogp/domain-type/no-untyped-string-set-map",
	"@francogp/domain-type/no-direct-database-instantiation",
	"@francogp/domain-type/require-storage-try-catch",
	"max-depth",
	"@francogp/domain-type/unsafe-path-concat",
	"@francogp/domain-type/hardcoded-slash-path",
	"@francogp/domain-type/no-record-string-key",
	"@francogp/domain-type/no-direct-process-argv",
	"@francogp/domain-type/no-homebrew-flag-parsing",
	"@francogp/domain-type/no-homebrew-file-walker",
	"@francogp/domain-type/auditor-rule-description-limit",
	"@francogp/domain-type/no-raw-session-storage",
	"@francogp/domain-type/no-hardcoded-secrets",
	"@francogp/domain-type/no-playwright-polling-waits",
	"no-unused-expressions"
].map((rule) => [rule, "off"]));
const CANONICAL_DYNAMIC_DEMO_OVERRIDE_RULES = Object.fromEntries([
	"no-console",
	"unicorn/prefer-global-this",
	"typescript/explicit-function-return-type",
	"@typescript-eslint/explicit-function-return-type",
	"@francogp/domain-type/no-insecure-random",
	"@francogp/domain-type/no-broad-string-array",
	"@francogp/domain-type/no-gsap-layout-properties",
	"@francogp/domain-type/no-record-string-key"
].map((rule) => [rule, "off"]));
const DEFAULT_VITE_PLUS_AUDIT_CONFIG = {
	enabled: true,
	run: { cache: true },
	precompress: {
		enabled: true,
		server: "nginx",
		spa: true,
		report: "summary",
		threshold: 512
	},
	fmt: {
		enabled: true,
		singleQuote: true,
		semi: true,
		trailingComma: "none",
		sortPackageJson: true,
		ignorePatterns: [],
		overrides: []
	},
	lint: {
		enabled: true,
		typeAware: true,
		typeCheck: true,
		plugins: [
			"vitest",
			"node",
			"promise",
			"unicorn",
			"typescript",
			"vue",
			"import",
			"jsx-a11y"
		]
	},
	test: {
		enabled: true,
		projects: {}
	},
	staged: {
		enabled: true,
		rules: { "*": "vp check --fix" }
	},
	hooks: { enabled: true },
	vscode: {
		enabled: true,
		formatOnSave: true,
		defaultFormatter: "oxc.oxc-vscode"
	}
};
const DEFAULT_AUDIT_CONFIG = {
	name: "Generic Project",
	auditorVersion: AUDITOR_VERSION,
	paths: {
		enabled: true,
		srcRoots: ["src"],
		testRoots: ["tests"],
		e2eRoots: ["tests/e2e"],
		integrationRoots: ["tests/integration"],
		migrationsDir: "supabase/migrations",
		scriptsRoots: ["scripts"],
		codeRoots: ["src", "scripts"],
		cliRoots: ["src/cli"],
		dataRoots: ["src/data"],
		demoRoots: [],
		componentsRoots: ["src/components"],
		viewsRoots: ["src/views"],
		storesRoots: ["src/stores"],
		composablesRoots: ["src/composables"],
		typesRoots: ["src/types"],
		stylesRoots: ["src/styles"],
		logicRoots: ["src/logic"],
		exemptFiles: [],
		includeTestsInCodeAudit: false,
		ignoreGlobs: [],
		ignoredDirs: [],
		unignoreDirs: [],
		ignoredPatterns: []
	},
	persistence: {
		enabled: true,
		engine: "supabase",
		schemaQualified: true,
		authorizedSaveFiles: [],
		saveKeyPrefixes: [],
		supabaseDir: "supabase",
		dockerContainer: "supabase-db",
		allowedDatabaseDirs: [
			"backups",
			"migrations",
			"schemas"
		],
		allowedDatabaseFiles: ["AGENTS.md", ".gitkeep"],
		exemptRlsTables: [
			"_migrations",
			"schema_migrations",
			"supabase_migrations"
		]
	},
	valibot: {
		enabled: true,
		targets: []
	},
	domain: {
		enabled: true,
		timezoneVariable: "APP_TIMEZONE",
		finiteDomainTypes: [],
		infraIdWhitelist: [],
		fallbackIdPatterns: [],
		o1CatalogPatterns: [],
		exemptSignatures: [],
		exemptCollections: [],
		allowedNumericConstantPrefixes: [
			"GEN_",
			"ISO_",
			"UTF_8",
			"BASE_64",
			"RGB_",
			"RGBA_",
			"WASM_",
			"HTML_5",
			"CSS_3",
			"HTTP_",
			"D3_"
		],
		caseNormalizationExemptTokens: [],
		allowedStoreSetterPrefixes: [
			"set",
			"update",
			"clear"
		]
	},
	gitIgnore: {
		enabled: true,
		extraRequiredEntries: []
	},
	templates: {
		enabled: true,
		requireInputIds: true
	},
	styles: {
		enabled: true,
		globalUtilityClasses: [],
		canonicalButtonVariants: [],
		heavyEffectPaths: [],
		zLayersEnabled: true,
		lineHeightOverlapCheck: true,
		stylelint: {
			enabled: true,
			ignoreGlobs: [],
			order: {
				enabled: true,
				enforceHasBlockPartitioning: true
			}
		},
		enforceScss: true,
		exemptCssFiles: []
	},
	stylelint: {
		enabled: true,
		ignoreGlobs: [],
		order: {
			enabled: true,
			enforceHasBlockPartitioning: true
		}
	},
	oxlint: { enabled: true },
	oxfmt: { enabled: true },
	htmlValidate: { enabled: true },
	vitePlusConfig: DEFAULT_VITE_PLUS_AUDIT_CONFIG,
	bundle: {
		enabled: true,
		statsFile: "scratch/bundle_stats.html",
		distDir: "dist/assets",
		exemptChunkPrefixes: [],
		maxClientChunkWarnBytes: 1228800,
		maxClientChunkErrorBytes: 2048e3,
		budgets: [],
		duplicateModuleThresholdBytes: 512e3,
		topModulesLimit: 15
	},
	agentPlugin: {
		enabled: true,
		gitSafetyHook: true
	},
	gitSafety: {
		enabled: true,
		preventDestructiveCommands: true
	},
	security: { enabled: true },
	documentation: {
		enabled: true,
		knownValidAbstractPaths: [],
		skillsRoots: [".agents/skills"],
		allowedNpxBinaries: [],
		language: "en",
		chatLanguage: "es",
		languageExemptions: []
	},
	dox: {
		enabled: true,
		ignoreGlobs: [".agents/**"]
	},
	fallow: {
		enabled: true,
		health: {
			maxCognitive: 20,
			maxCyclomatic: 25,
			cyclomaticPolicy: "standard"
		},
		security: { enabled: true },
		enforceTargets: true,
		maxTargetPriority: "high",
		similarCode: {
			enabled: true,
			threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
			ignoreSameFile: true,
			minLines: 3
		},
		flags: {
			enabled: true,
			trackRetirement: true
		},
		coverage: { enabled: true },
		typeAware: false,
		showCascade: true,
		duplicates: {
			enabled: true,
			nearMiss: true,
			mode: "strict"
		},
		viz: {
			enabled: true,
			outputPath: "scratch/fallow_map.html"
		}
	},
	constants: {
		enabled: true,
		ignoredNames: [],
		exemptMagicNumbers: [],
		allowedNumericPrefixes: [],
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	animation: {
		enabled: true,
		customTimerFunctions: [],
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	types: {
		enabled: true,
		exemptPaths: [],
		exemptFiles: [],
		ignoreGlobs: []
	},
	encoding: {
		enabled: true,
		defaultEncoding: "utf-8",
		prohibitBom: true,
		detectMojibake: true,
		exemptGlobs: [],
		exemptPaths: [],
		exemptFiles: []
	},
	packageHygiene: {
		enabled: true,
		ignoreDependencies: [],
		ignoreBinaries: []
	},
	packageDistribution: {
		enabled: false,
		level: "warning"
	},
	packageScripts: {
		enabled: true,
		enforceBuildAudit: true,
		recommendedScripts: true,
		extraRequiredScripts: []
	},
	scriptCommands: {
		enabled: true,
		exemptGlobs: [],
		allowedNpxBinaries: []
	},
	environment: { enabled: true },
	auditorHygiene: {
		enabled: true,
		roots: ["scripts/auditors"],
		exemptFiles: [],
		disabledDetectors: []
	},
	scriptExtensions: {
		enabled: true,
		enforceTypeScript: true,
		allowMjs: false,
		allowCjs: false,
		allowJsScripts: false,
		exemptFiles: []
	},
	accessibility: { enabled: true },
	typeCoverage: {
		enabled: true,
		atLeast: 95,
		strict: true,
		ignoreFiles: []
	},
	version: {
		enabled: true,
		autoSyncPublicVersionJson: true,
		syncTargets: []
	},
	secretLeaks: {
		enabled: true,
		maskSecrets: true,
		allowedPatterns: [],
		exemptGlobs: []
	},
	dependencyVulnerabilities: {
		enabled: true,
		failOn: "critical",
		allowList: [],
		includeDev: false
	},
	coverage: {
		enabled: true,
		exemptGlobs: [],
		acknowledgedDegradations: []
	},
	webPerformance: {
		enabled: true,
		maxDomDepth: 16,
		maxInlineSvgSize: 2048,
		exemptSvgPaths: [],
		exemptImgClasses: [],
		exemptPaths: []
	},
	queryPerformance: {
		enabled: true,
		excludeMigrationsDir: true,
		exemptSelectStarPaths: [],
		exemptPaths: []
	},
	securityHardening: {
		enabled: true,
		exemptPaths: []
	},
	codeSimplification: {
		enabled: true,
		maxNestingDepth: 4,
		allowMatrixLoops: false,
		exemptPaths: []
	},
	scssArchitecture: {
		enabled: true,
		maxNestingDepth: 3,
		scopedMaxNestingDepth: 4,
		allowPixelArtSpacing: false,
		allowedSpacingUnits: [],
		allowScopedColors: false,
		exemptPaths: []
	},
	ratchet: {
		enabled: true,
		productionRef: "origin/main",
		baselineFile: ".auditor/audit-baseline.json"
	},
	testCoverage: {
		enabled: true,
		threshold: 80,
		path: "scratch/coverage/coverage-final.json",
		runCommand: "vp test --coverage",
		roots: ["src"],
		extensions: [
			".ts",
			".vue",
			".js",
			".jsx",
			".tsx",
			".mjs",
			".cjs"
		],
		exemptGlobs: [],
		enforceInAudit: true
	},
	customFamilies: [],
	extensions: [],
	runner: {
		enabled: true,
		timeoutMs: 0,
		maxStalenessMinutes: 5
	}
};
function collectDeclaredSubsystems(config) {
	const declared = new Set(config._declaredSubsystems ?? []);
	for (const k of [
		"persistence",
		"domain",
		"environment",
		"auditorHygiene",
		"scriptExtensions",
		"styles",
		"stylelint",
		"oxlint",
		"oxfmt",
		"vitePlusConfig",
		"valibot",
		"pinia",
		"htmlValidate",
		"templates",
		"bundle",
		"agentPlugin",
		"gitSafety",
		"security",
		"fallow",
		"packageDistribution",
		"packageHygiene",
		"packageScripts",
		"scriptCommands",
		"accessibility",
		"typeCoverage",
		"testCoverage",
		"version",
		"secretLeaks",
		"dependencyVulnerabilities",
		"ratchet",
		"constants",
		"documentation",
		"gitIgnore",
		"coverage",
		"animation",
		"types",
		"webPerformance",
		"queryPerformance",
		"securityHardening",
		"codeSimplification",
		"scssArchitecture",
		"vitePlusConfig"
	]) if (config[k] !== void 0) declared.add(k);
	for (const k of Object.keys(config)) if (k !== "_declaredSubsystems" && k !== "_rawPaths" && k !== "_rawConfig" && k !== "name" && Reflect.get(config, k) !== void 0) declared.add(k);
	return declared;
}
export { CANONICAL_DYNAMIC_DEMO_OVERRIDE_RULES, CANONICAL_DYNAMIC_SCRIPT_OVERRIDE_RULES, CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES, DEFAULT_AUDIT_CONFIG, DEFAULT_CANONICAL_LINT_RULES, DEFAULT_PRECOMPRESS_THRESHOLD_BYTES, DEFAULT_SIMILAR_CODE_THRESHOLD, DEFAULT_TEST_COVERAGE_PERCENTAGE, DEFAULT_TYPE_COVERAGE_AT_LEAST, DEFAULT_VITE_PLUS_AUDIT_CONFIG, collectDeclaredSubsystems };
