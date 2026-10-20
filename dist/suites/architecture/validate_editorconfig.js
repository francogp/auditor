import { BaseAuditor, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_editorconfig.ts
/**
* src/suites/architecture/validate_editorconfig.ts
*
* EDITORCONFIG BASELINE & HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces standardized editor conventions across all developer environments (.editorconfig):
*   1. Guarantees .editorconfig exists on disk; auto-scaffolds in --fix mode.
*   2. Guarantees mandatory baseline settings:
*      - root = true
*      - end_of_line = lf
*      - charset = utf-8
*      - indent_style = space
*      - indent_size = 2
*      - insert_final_newline = true
*      - trim_trailing_whitespace = true (with markdown exception trim_trailing_whitespace = false)
*/
enableCompileCache();
const EDITORCONFIG_RULES = ["editorconfig-missing", "editorconfig-missing-setting"];
const CANONICAL_EDITORCONFIG_LINES = [
	"# EditorConfig helps maintain consistent coding styles for multiple developers",
	"# https://editorconfig.org",
	"",
	"root = true",
	"",
	"[*]",
	"charset = utf-8",
	"end_of_line = lf",
	"indent_style = space",
	"indent_size = 2",
	"insert_final_newline = true",
	"trim_trailing_whitespace = true",
	"",
	"[*.md]",
	"trim_trailing_whitespace = false",
	""
];
const CANONICAL_EDITORCONFIG_CONTENT = CANONICAL_EDITORCONFIG_LINES.join("\n");
const EDITORCONFIG_REQUIREMENT = {
	id: "editorconfig-config",
	file: ".editorconfig",
	candidateFiles: [".editorconfig"],
	description: "Configuración estándar de estilo de editor (.editorconfig)",
	ruleId: "editorconfig-missing",
	generateDefaultContent: () => CANONICAL_EDITORCONFIG_CONTENT
};
var ValidateEditorconfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...EDITORCONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createUniformRuleCapabilities(EDITORCONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: ["editorconfig-missing", "editorconfig-missing-setting"],
			configFiles: [configRequirement],
			id: "validate_editorconfig",
			name: "EditorConfig Validator",
			description: "Valida consistencia y formato en .editorconfig",
			icon: "📐",
			family: "architecture",
			ruleIds: EDITORCONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(EDITORCONFIG_RULES, "setup"),
			packageName: "EditorConfig",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"editorconfig-missing": "Archivo .editorconfig ausente",
				"editorconfig-missing-setting": "Falta directiva obligatoria"
			},
			ruleRemediations: {
				"editorconfig-missing": "Diagnóstico: El archivo .editorconfig no existe en la raíz del proyecto.\nRemediación: Ejecuta `auditor fix` para auto-scaffoldear la configuración canónica de editores.",
				"editorconfig-missing-setting": "Diagnóstico: Faltan directivas obligatorias en .editorconfig (root=true, end_of_line=lf, charset=utf-8, etc.).\nRemediación: Ejecuta `auditor fix` para armonizar las directivas de formato de editores."
			},
			coverage: { include: [".editorconfig"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
		});
	}
	async runAudit() {
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("editorconfig-missing", () => {
			configFile = this.resolveConfigFile(EDITORCONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("editorconfig-missing", () => this.ensureConfigFile(EDITORCONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("editorconfig-missing-setting", "Archivo .editorconfig ausente");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || EDITORCONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.runSubAuditorSync("editorconfig-missing", () => {
				this.addViolation({
					ruleId: "editorconfig-missing",
					severity: "error",
					file: relPath,
					line: 1,
					message: `No se pudo leer ${relPath}.`
				});
			});
			return;
		}
		let modified = false;
		let updatedContent = rawContent;
		this.runSubAuditorSync("editorconfig-missing-setting", () => {
			if (!/^\s*root\s*=\s*true\b/im.test(updatedContent)) {
				if (isFix) {
					updatedContent = "root = true\n\n" + updatedContent.replace(/^\s*root\s*=\s*[^\n]*\n?/im, "");
					modified = true;
				} else this.addViolation({
					ruleId: "editorconfig-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere \"root = true\" al inicio de .editorconfig."
				});
			}
			if (!/^\s*end_of_line\s*=\s*lf\b/im.test(updatedContent)) {
				if (isFix) {
					if (/^\s*end_of_line\s*=/im.test(updatedContent)) updatedContent = updatedContent.replace(/^\s*end_of_line\s*=[^\n]*/im, "end_of_line = lf");
					else updatedContent = updatedContent.replace(/(\[\*\][^\n]*\n)/i, "$1end_of_line = lf\n");
					modified = true;
				} else this.addViolation({
					ruleId: "editorconfig-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere \"end_of_line = lf\" en la sección [*] de .editorconfig."
				});
			}
			if (!/^\s*charset\s*=\s*utf-8\b/im.test(updatedContent)) {
				if (isFix) {
					if (/^\s*charset\s*=/im.test(updatedContent)) updatedContent = updatedContent.replace(/^\s*charset\s*=[^\n]*/im, "charset = utf-8");
					else updatedContent = updatedContent.replace(/(\[\*\][^\n]*\n)/i, "$1charset = utf-8\n");
					modified = true;
				} else this.addViolation({
					ruleId: "editorconfig-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere \"charset = utf-8\" en la sección [*] de .editorconfig."
				});
			}
			if (!/^\s*indent_size\s*=\s*2\b/im.test(updatedContent)) {
				if (isFix) {
					if (/^\s*indent_size\s*=/im.test(updatedContent)) updatedContent = updatedContent.replace(/^\s*indent_size\s*=[^\n]*/im, "indent_size = 2");
					else updatedContent = updatedContent.replace(/(\[\*\][^\n]*\n)/i, "$1indent_size = 2\n");
					modified = true;
				} else this.addViolation({
					ruleId: "editorconfig-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere \"indent_size = 2\" en la sección [*] de .editorconfig."
				});
			}
		});
		if (isFix && modified) fs.writeFileSync(resolvedPath, updatedContent.trimEnd() + "\n", "utf8");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEditorconfigAuditor());
//#endregion
export { CANONICAL_EDITORCONFIG_CONTENT, CANONICAL_EDITORCONFIG_LINES, EDITORCONFIG_REQUIREMENT, EDITORCONFIG_RULES, ValidateEditorconfigAuditor };
