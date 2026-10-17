import { BaseAuditor, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
//#region src/suites/architecture/validate_tsconfig.ts
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
	include: ["src/**/*", "tests/**/*"],
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
	description: "Configuración estricta de compilador TypeScript",
	ruleId: "tsconfig-missing",
	generateDefaultContent: () => JSON.stringify(CANONICAL_TSCONFIG, null, 2) + "\n"
};
var ValidateTsconfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...TSCONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createUniformRuleCapabilities(TSCONFIG_RULES, {
				speed: "light",
				phase: "normal",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: [
				"tsconfig-missing",
				"tsconfig-missing-strict-compiler-option",
				"tsconfig-banned-option",
				"tsconfig-missing-source-include"
			],
			configFiles: [configRequirement],
			id: "validate_tsconfig",
			name: "TypeScript Configuration Validator",
			description: "Valida baseline estricto de tsconfig.json",
			icon: "📘",
			family: "architecture",
			ruleIds: TSCONFIG_RULES,
			packageName: "TSConfig",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"tsconfig-missing": "Archivo tsconfig.json ausente",
				"tsconfig-syntax": "Error sintaxis tsconfig.json",
				"tsconfig-missing-strict-compiler-option": "Falta opción estricta compiler",
				"tsconfig-banned-option": "Opción prohibida en tsconfig",
				"tsconfig-missing-source-include": "Include no cubre fuentes src"
			},
			ruleRemediations: {
				"tsconfig-missing": "Diagnóstico: El archivo tsconfig.json no existe en la raíz del proyecto.\nRemediación: Ejecuta `auditor fix` o `npm run auditor:fix` para auto-scaffoldear la configuración canónica estricta de TypeScript.",
				"tsconfig-syntax": "Diagnóstico: El archivo tsconfig.json contiene errores de sintaxis JSON o caracteres inválidos.\nRemediación: Inspecciona tsconfig.json, corrige comas sobrantes o comillas mal cerradas.",
				"tsconfig-missing-strict-compiler-option": "Diagnóstico: Se omitieron o degradaron opciones estrictas obligatorias (strict, noImplicitAny, noUncheckedIndexedAccess, target >= ES2025).\nRemediación: Ejecuta `auditor fix` para reinyectar el baseline estricto o configúralas manualmente en compilerOptions.",
				"tsconfig-banned-option": "Diagnóstico: Se detectó una opción permisiva o prohibida (ej. suppressImplicitAnyIndexErrors, noImplicitThis: false).\nRemediación: Ejecuta `auditor fix` para remover las opciones prohibidas y resolver los errores de tipado legítimamente.",
				"tsconfig-missing-source-include": "Diagnóstico: El arreglo include no abarca el directorio de código fuente principal (`src/**/*`).\nRemediación: Agrega `\"src/**/*\"` al arreglo `include` en tsconfig.json o ejecuta `auditor fix`."
			},
			coverage: { include: ["tsconfig*.json"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
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
				this.markRuleNotApplicable("tsconfig-syntax", "Archivo tsconfig.json ausente");
				this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "Archivo tsconfig.json ausente");
				this.markRuleNotApplicable("tsconfig-banned-option", "Archivo tsconfig.json ausente");
				this.markRuleNotApplicable("tsconfig-missing-source-include", "Archivo tsconfig.json ausente");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || TSCONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		const extraTsconfigs = [];
		try {
			for (const entry of fs.readdirSync(this.projectRoot)) if (/^tsconfig\..+\.json$/.test(entry)) {
				this.recordScanned(entry);
				extraTsconfigs.push(entry);
			}
		} catch {}
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.markRuleNotApplicable("tsconfig-syntax", "No se pudo leer el archivo");
			this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "No se pudo leer el archivo");
			this.markRuleNotApplicable("tsconfig-banned-option", "No se pudo leer el archivo");
			this.markRuleNotApplicable("tsconfig-missing-source-include", "No se pudo leer el archivo");
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
				message: `Error de sintaxis JSON en ${relPath}.`
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
						message: `Error de sintaxis JSON en ${extraFile}.`
					});
					else extraParsed.set(extraFile, extraRes.config);
				} catch {
					this.addViolation({
						ruleId: "tsconfig-syntax",
						severity: "error",
						file: extraFile,
						line: 1,
						message: `Error de sintaxis JSON en ${extraFile}.`
					});
				}
			}
		});
		if (!parsed) {
			this.markRuleNotApplicable("tsconfig-missing-strict-compiler-option", "Sintaxis JSON inválida");
			this.markRuleNotApplicable("tsconfig-banned-option", "Sintaxis JSON inválida");
			this.markRuleNotApplicable("tsconfig-missing-source-include", "Sintaxis JSON inválida");
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
					message: `compilerOptions.${opt} debe ser true según el baseline estricto.`
				});
			}
			const modRes = compilerOptions.moduleResolution ? String(compilerOptions.moduleResolution).toLowerCase() : "";
			if (!VALID_MODULE_RESOLUTIONS.some((v) => v === modRes)) {
				if (isFix) {
					compilerOptions.moduleResolution = "bundler";
					modified = true;
				} else this.addViolation({
					ruleId: "tsconfig-missing-strict-compiler-option",
					severity: "error",
					file: relPath,
					line: 1,
					message: `compilerOptions.moduleResolution debe ser "bundler", "node16" o "nodenext".`
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
					message: `compilerOptions.target debe ser "ES2025" o "ESNext" según el baseline estricto de Node 26+.`
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
					message: `compilerOptions.${banned} está prohibida por el estándar de calidad.`
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
					message: "compilerOptions.noImplicitThis: false está prohibido. Debe ser true o eliminarse."
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
						message: `compilerOptions.${banned} está prohibida por el estándar de calidad.`
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
						message: "El arreglo include en tsconfig.json debe abarcar el directorio src/."
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
					message: "La propiedad include debe ser un arreglo de patrones."
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
//#endregion
export { BANNED_COMPILER_OPTIONS, CANONICAL_TSCONFIG, MANDATORY_STRICT_OPTIONS, TSCONFIG_REQUIREMENT, TSCONFIG_RULES, VALID_MODULE_RESOLUTIONS, VALID_TARGETS, ValidateTsconfigAuditor };
