import { BaseAuditor, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_lint_config.ts
/**
* src/suites/documentation/validate_markdown_lint_config.ts
*
* MARKDOWNLINT CONFIGURATION & MANDATORY BASELINE AUDITOR (Node.js 26+ Native)
*
* Enforces standardized documentation hygiene rules across .markdownlint.json:
*   1. Guarantees .markdownlint.json exists on disk; auto-scaffolds in --fix mode.
*   2. Guarantees valid JSON syntax without corruption.
*   3. Enforces standard documentation baseline:
*      - default: true
*      - MD033 allowed_elements: ["br"]
*      - MD024 siblings_only: true
*      - MD007 indent: 2
*      - MD013: false (no hard line length wrapping)
*/
enableCompileCache();
const MARKDOWNLINT_CONFIG_RULES = [
	"markdownlint-config-missing",
	"markdownlint-config-syntax",
	"markdownlint-config-missing-strict-rule"
];
const CANONICAL_MARKDOWNLINT_CONFIG = {
	default: true,
	MD013: false,
	MD060: false,
	MD033: { allowed_elements: ["br"] },
	MD024: { siblings_only: true },
	MD007: { indent: 2 }
};
const MARKDOWNLINT_CONFIG_REQUIREMENT = {
	id: "markdownlint-config",
	file: ".markdownlint.json",
	candidateFiles: [".markdownlint.json", ".markdownlint-cli2.jsonc"],
	description: "Configuración estándar de markdownlint para documentación",
	ruleId: "markdownlint-config-missing",
	generateDefaultContent: () => JSON.stringify(CANONICAL_MARKDOWNLINT_CONFIG, null, 2) + "\n"
};
var ValidateMarkdownLintConfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...MARKDOWNLINT_CONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createUniformRuleCapabilities(MARKDOWNLINT_CONFIG_RULES, {
				speed: "light",
				phase: "normal",
				fix: "priority",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: ["markdownlint-config-missing", "markdownlint-config-missing-strict-rule"],
			configFiles: [configRequirement],
			id: "validate_markdown_lint_config",
			name: "Markdownlint Configuration Validator",
			description: "Valida baseline de configuración markdownlint",
			icon: "📝",
			family: "documentation",
			ruleIds: MARKDOWNLINT_CONFIG_RULES,
			packageName: "Markdown",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"markdownlint-config-missing": "Archivo .markdownlint.json ausente",
				"markdownlint-config-syntax": "Error de sintaxis en configuración",
				"markdownlint-config-missing-strict-rule": "Falta regla estricta obligatoria"
			},
			ruleRemediations: {
				"markdownlint-config-missing": "Diagnóstico: El archivo .markdownlint.json no existe en el proyecto.\nRemediación: Ejecuta `auditor fix` para auto-scaffoldear la configuración canónica.",
				"markdownlint-config-syntax": "Diagnóstico: El archivo de configuración de markdownlint contiene errores de sintaxis JSON.\nRemediación: Revisa comas sobrantes o caracteres de escape inválidos en .markdownlint.json.",
				"markdownlint-config-missing-strict-rule": "Diagnóstico: Faltan reglas obligatorias del baseline (MD033 con allowed_elements: [\"br\"], MD024 con siblings_only: true, etc.).\nRemediación: Ejecuta `auditor fix` para reinyectar el baseline estricto de documentación."
			},
			coverage: { include: [".markdownlint*"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
		});
	}
	async runAudit() {
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("markdownlint-config-missing", () => {
			configFile = this.resolveConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("markdownlint-config-missing", () => this.ensureConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("markdownlint-config-syntax", "Archivo .markdownlint.json ausente");
				this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "Archivo .markdownlint.json ausente");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || MARKDOWNLINT_CONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.markRuleNotApplicable("markdownlint-config-syntax", "No se pudo leer el archivo");
			this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "No se pudo leer el archivo");
			return;
		}
		let parsed;
		this.runSubAuditorSync("markdownlint-config-syntax", () => {
			try {
				parsed = JSON.parse(rawContent);
			} catch {
				this.addViolation({
					ruleId: "markdownlint-config-syntax",
					severity: "error",
					file: relPath,
					line: 1,
					message: `Error de sintaxis JSON en ${relPath}.`
				});
			}
		});
		if (!parsed || typeof parsed !== "object") {
			this.markRuleNotApplicable("markdownlint-config-missing-strict-rule", "Sintaxis JSON inválida");
			return;
		}
		let modified = false;
		const parsedConfig = parsed;
		this.runSubAuditorSync("markdownlint-config-missing-strict-rule", () => {
			if (parsedConfig.default !== true) {
				if (isFix) {
					parsedConfig.default = true;
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "La configuración debe definir \"default\": true."
				});
			}
			const md033 = parsedConfig.MD033;
			if (!(typeof md033 === "object" && md033 !== null && Array.isArray(md033.allowed_elements) && md033.allowed_elements.includes("br")) && md033 !== false) {
				if (isFix) {
					parsedConfig.MD033 = { allowed_elements: ["br"] };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD033 debe permitir <br> vía allowed_elements: [\"br\"]."
				});
			}
			const md024 = parsedConfig.MD024;
			if (!(typeof md024 === "object" && md024 !== null && md024.siblings_only === true) && md024 !== false) {
				if (isFix) {
					parsedConfig.MD024 = { siblings_only: true };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD024 debe tener siblings_only: true para permitir subtítulos iguales en secciones distintas."
				});
			}
			const md007 = parsedConfig.MD007;
			if (!(typeof md007 === "object" && md007 !== null && md007.indent === 2) && md007 !== false) {
				if (isFix) {
					parsedConfig.MD007 = { indent: 2 };
					modified = true;
				} else this.addViolation({
					ruleId: "markdownlint-config-missing-strict-rule",
					severity: "error",
					file: relPath,
					line: 1,
					message: "MD007 debe tener indent: 2 según la guía de Markdown."
				});
			}
		});
		if (isFix && modified) fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + "\n", "utf8");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMarkdownLintConfigAuditor());
//#endregion
export { CANONICAL_MARKDOWNLINT_CONFIG, MARKDOWNLINT_CONFIG_REQUIREMENT, MARKDOWNLINT_CONFIG_RULES, ValidateMarkdownLintConfigAuditor };
