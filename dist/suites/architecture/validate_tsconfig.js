import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { safeReadFileSync, tryOrNull } from "../../core/safeUtils.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/suites/architecture/validate_tsconfig.ts
/**
* src/suites/architecture/validate_tsconfig.ts
*
* TSCONFIG CONFIGURATION & MANDATORY STRICT BASELINE AUDITOR (Node.js 26+ Native)
*
* Enforces strict, uncompromised TypeScript compiler configuration:
*   1. Guarantees tsconfig.json exists on disk; auto-scaffolds in --fix mode.
*   2. Guarantees valid JSON syntax without corruption.
*   3. Enforces the Anti-Castration Mandate: strict: true, noImplicitAny: true,
*      noUncheckedIndexedAccess: true, and moduleResolution: "bundler" | "node16" | "nodenext".
*   4. Barred permissive or deprecated options (suppressImplicitAnyIndexErrors, noImplicitThis: false).
*   5. Guarantees that include covers the primary source directory (src).
*/
enableCompileCache();
const TSCONFIG_RULES = [
	"tsconfig-missing",
	"tsconfig-syntax",
	"tsconfig-missing-strict-compiler-option",
	"tsconfig-banned-option",
	"tsconfig-missing-source-include"
];
const CANONICAL_TSCONFIG = {
	compilerOptions: {
		target: "ESNext",
		module: "ESNext",
		moduleResolution: "bundler",
		strict: true,
		noImplicitAny: true,
		noUncheckedIndexedAccess: true,
		verbatimModuleSyntax: true,
		useUnknownInCatchVariables: true,
		isolatedModules: true,
		skipLibCheck: true,
		esModuleInterop: true,
		resolveJsonModule: true
	},
	include: [...DEFAULT_AUDIT_CONFIG.paths.srcRoots.map((r) => `${r}/**/*`), ...DEFAULT_AUDIT_CONFIG.paths.testRoots.map((r) => `${r}/**/*`)],
	exclude: [
		"node_modules",
		"dist",
		"scratch"
	]
};
const MANDATORY_STRICT_OPTIONS = [
	"strict",
	"noImplicitAny",
	"noUncheckedIndexedAccess",
	"verbatimModuleSyntax",
	"useUnknownInCatchVariables"
];
const VALID_MODULE_RESOLUTIONS = [
	"bundler",
	"node16",
	"nodenext"
];
const VALID_TARGETS = ["es2025", "esnext"];
const BANNED_COMPILER_OPTIONS = ["suppressImplicitAnyIndexErrors"];
const TSCONFIG_REQUIREMENT = {
	id: "tsconfig-config",
	file: "tsconfig.json",
	candidateFiles: ["tsconfig.json"],
	description: "Strict TypeScript compiler configuration",
	ruleId: "tsconfig-missing",
	generateDefaultContent: () => JSON.stringify(CANONICAL_TSCONFIG, null, 2) + "\n"
};
var ValidateTsconfigAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const configRequirement = {
			...TSCONFIG_REQUIREMENT,
			...options.configFile ? {
				file: options.configFile,
				candidateFiles: [options.configFile]
			} : {}
		};
		super({
			ruleFixers: {},
			fixableRuleIds: [
				"tsconfig-missing-strict-compiler-option",
				"tsconfig-banned-option",
				"tsconfig-missing-source-include"
			],
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(TSCONFIG_RULES, {
				speed: "light",
				phase: "setup",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			configFiles: [configRequirement],
			id: "validate_tsconfig",
			name: "TypeScript Configuration Validator",
			description: "Validates tsconfig.json strict baseline",
			icon: "📘",
			family: "architecture",
			ruleIds: TSCONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TSCONFIG_RULES, "setup"),
			packageName: "TSConfig",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"tsconfig-missing": "Missing tsconfig.json file",
				"tsconfig-syntax": "Syntax error in tsconfig.json",
				"tsconfig-missing-strict-compiler-option": "Missing strict compiler option",
				"tsconfig-banned-option": "Banned option in tsconfig",
				"tsconfig-missing-source-include": "Include does not cover src sources"
			},
			ruleRemediations: {
				"tsconfig-missing": "📖 REMEDIATION GUIDE: tsconfig-missing\n1. Root Cause: The `tsconfig.json` file is missing from the root of the project.\n2. Diagnosis: Check project root for `tsconfig.json`.\n3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to auto-scaffold the strict canonical TypeScript configuration.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"tsconfig-syntax": "📖 REMEDIATION GUIDE: tsconfig-syntax\n1. Root Cause: `tsconfig.json` contains JSON syntax errors or invalid characters.\n2. Diagnosis: Inspect `tsconfig.json`, checking for trailing commas or mismatched quotes.\n3. Canonical Solution: Fix JSON syntax errors in `tsconfig.json` or run `npm run fmt`.\n4. Example / Auto-fix command:\n   Validate syntax with JSON parser or `npm run fmt`.",
				"tsconfig-missing-strict-compiler-option": "📖 REMEDIATION GUIDE: tsconfig-missing-strict-compiler-option\n1. Root Cause: Mandatory strict options are omitted or downgraded (`strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `target >= ES2025`).\n2. Diagnosis: Check `compilerOptions` in `tsconfig.json` against required strict settings.\n3. Canonical Solution: Run `npm run auditor:fix` to re-inject strict compiler defaults, or configure them manually.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"tsconfig-banned-option": "📖 REMEDIATION GUIDE: tsconfig-banned-option\n1. Root Cause: A banned permissive option was detected (e.g., `suppressImplicitAnyIndexErrors`, `noImplicitThis: false`).\n2. Diagnosis: Look for permissive overrides in `compilerOptions`.\n3. Canonical Solution: Run `npm run auditor:fix` to remove banned options and resolve underlying type errors properly.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"tsconfig-missing-source-include": "📖 REMEDIATION GUIDE: tsconfig-missing-source-include\n1. Root Cause: The `include` array in `tsconfig.json` does not cover primary source directories (`src/**/*`).\n2. Diagnosis: Check the `include` glob patterns in `tsconfig.json`.\n3. Canonical Solution: Add `\"src/**/*\"` to `include` in `tsconfig.json` or run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`"
			},
			coverage: { include: ["tsconfig*.json"] },
			cachePaths: [".tsbuildinfo"],
			projectRoot,
			...options
		});
	}
	async runAudit() {
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("tsconfig-missing", () => {
			configFile = this.resolveConfigFile(TSCONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("tsconfig-missing", () => this.ensureConfigFile(TSCONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("tsconfig-syntax", "Missing tsconfig.json file");
				this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "Missing tsconfig.json file");
				this.markRuleNotApplicable("tsconfig-banned-option", "Missing tsconfig.json file");
				this.markRuleNotApplicable("tsconfig-missing-source-include", "Missing tsconfig.json file");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || TSCONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		const extraTsconfigs = [];
		const entries = tryOrNull(() => fs.readdirSync(this.projectRoot)) ?? [];
		for (const entry of entries) if (/^tsconfig\..+\.json$/.test(entry)) {
			this.recordScanned(entry);
			extraTsconfigs.push(entry);
		}
		const rawContent = safeReadFileSync(resolvedPath);
		if (!rawContent) {
			this.markRuleNotApplicable("tsconfig-syntax", "Could not read file");
			this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "Could not read file");
			this.markRuleNotApplicable("tsconfig-banned-option", "Could not read file");
			this.markRuleNotApplicable("tsconfig-missing-source-include", "Could not read file");
			return;
		}
		let parsed;
		const extraParsed = /* @__PURE__ */ new Map();
		this.runSubAuditorSync("tsconfig-syntax", () => {
			const parseRes = ts.parseConfigFileTextToJson(relPath, rawContent);
			if (parseRes.error || !parseRes.config || typeof parseRes.config !== "object") this.addViolation({
				ruleId: "tsconfig-syntax",
				severity: "error",
				file: relPath,
				line: 1,
				message: `JSON syntax error in ${relPath}.`
			});
			else parsed = parseRes.config;
			for (const extraFile of extraTsconfigs) {
				const extraFullPath = path.resolve(this.projectRoot, extraFile);
				try {
					const extraRaw = fs.readFileSync(extraFullPath, "utf8");
					const extraRes = ts.parseConfigFileTextToJson(extraFile, extraRaw);
					if (extraRes.error || !extraRes.config || typeof extraRes.config !== "object") this.addViolation({
						ruleId: "tsconfig-syntax",
						severity: "error",
						file: extraFile,
						line: 1,
						message: `JSON syntax error in ${extraFile}.`
					});
					else extraParsed.set(extraFile, extraRes.config);
				} catch {
					this.addViolation({
						ruleId: "tsconfig-syntax",
						severity: "error",
						file: extraFile,
						line: 1,
						message: `JSON syntax error in ${extraFile}.`
					});
				}
			}
		});
		if (!parsed) {
			this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "Invalid JSON syntax");
			this.markRuleNotApplicable("tsconfig-banned-option", "Invalid JSON syntax");
			this.markRuleNotApplicable("tsconfig-missing-source-include", "Invalid JSON syntax");
			return;
		}
		let modified = false;
		const parsedConfig = parsed;
		const compilerOptions = parsedConfig.compilerOptions ?? {};
		this.runSubAuditorSync("tsconfig-missing-strict-compiler-option", () => {
			for (const opt of MANDATORY_STRICT_OPTIONS) if (compilerOptions[opt] !== true) {
				if (isFix) {
					compilerOptions[opt] = true;
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-strict-compiler-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.${opt} must be true according to the strict baseline.`
				});
			}
			const modRes = compilerOptions.moduleResolution ? String(compilerOptions.moduleResolution).toLowerCase() : "";
			if ((fs.existsSync(path.resolve(this.projectRoot, "vite.config.ts")) || fs.existsSync(path.resolve(this.projectRoot, ".auditor/audit.config.ts"))) && modRes !== "bundler") {
				if (isFix) {
					compilerOptions.moduleResolution = "bundler";
					compilerOptions.allowImportingTsExtensions = true;
					compilerOptions.noEmit = true;
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-strict-compiler-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.moduleResolution must be "bundler" in Vite+ projects to allow direct TypeScript imports (.ts).`
				});
			} else if (!VALID_MODULE_RESOLUTIONS.some((v) => v === modRes)) {
				if (isFix) {
					compilerOptions.moduleResolution = "bundler";
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-strict-compiler-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.moduleResolution must be "bundler", "node16", or "nodenext".`
				});
			}
			const targetOpt = compilerOptions.target ? String(compilerOptions.target).toLowerCase() : "";
			if (!VALID_TARGETS.some((v) => v === targetOpt)) {
				if (isFix) {
					compilerOptions.target = "ES2025";
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-strict-compiler-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.target must be "ES2025" or "ESNext" according to the Node 26+ strict baseline.`
				});
			}
		});
		this.runSubAuditorSync("tsconfig-banned-option", () => {
			for (const banned of BANNED_COMPILER_OPTIONS) if (compilerOptions[banned] !== void 0) {
				if (isFix) {
					delete compilerOptions[banned];
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-banned-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.${banned} is prohibited by repository quality standards.`
				});
			}
			if (compilerOptions.noImplicitThis === false) {
				if (isFix) {
					delete compilerOptions.noImplicitThis;
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-banned-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: "compilerOptions.noImplicitThis: false is prohibited. Must be true or removed."
				});
			}
			for (const [extraFile, extraCfg] of extraParsed.entries()) {
				const extraOpts = extraCfg.compilerOptions ?? {};
				let extraModified = false;
				for (const banned of BANNED_COMPILER_OPTIONS) if (extraOpts[banned] !== void 0) {
					if (isFix) {
						delete extraOpts[banned];
						extraModified = true;
					} else this.addViolation({
						ruleId: "tsconfig-banned-option",
						severity: "error",
						file: extraFile,
						line: 1,
						message: `compilerOptions.${banned} is prohibited by repository quality standards.`
					});
				}
				if (isFix && extraModified) {
					extraCfg.compilerOptions = extraOpts;
					fs.writeFileSync(path.resolve(this.projectRoot, extraFile), JSON.stringify(extraCfg, null, 2) + "\n", "utf8");
				}
			}
		});
		this.runSubAuditorSync("tsconfig-missing-source-include", () => {
			if (parsedConfig.include && Array.isArray(parsedConfig.include)) {
				if (!parsedConfig.include.some((p) => p === "src" || p.startsWith("src/") || p === "./src" || p.startsWith("./src/"))) {
					if (isFix) {
						parsedConfig.include.unshift("src/**/*");
						modified = true;
					} else this.addViolation({
						ruleId: "tsconfig-missing-source-include",
						severity: "error",
						file: relPath,
						line: 1,
						message: "The include array in tsconfig.json must cover the src/ directory."
					});
				}
				if (isFix) {
					const deadLegacyConfigs = [
						"vitest.config.ts",
						"vitest.config.js",
						"vitest.config.mjs"
					];
					const filtered = parsedConfig.include.filter((p) => !deadLegacyConfigs.some((f) => f === p) || fs.existsSync(path.resolve(this.projectRoot, p)));
					if (filtered.length !== parsedConfig.include.length) {
						parsedConfig.include = filtered;
						modified = true;
					}
				}
			} else if (parsedConfig.include !== void 0) {
				if (isFix) {
					parsedConfig.include = ["src/**/*", "tests/**/*"];
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-source-include",
					severity: "error",
					file: relPath,
					line: 1,
					message: "The include property must be an array of glob patterns."
				});
			}
		});
		if (isFix && modified) {
			parsedConfig.compilerOptions = compilerOptions;
			fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + "\n", "utf8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTsconfigAuditor());
export { BANNED_COMPILER_OPTIONS, CANONICAL_TSCONFIG, MANDATORY_STRICT_OPTIONS, TSCONFIG_REQUIREMENT, TSCONFIG_RULES, VALID_MODULE_RESOLUTIONS, VALID_TARGETS, ValidateTsconfigAuditor };
