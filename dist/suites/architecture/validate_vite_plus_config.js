import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { LEGACY_CONFIG_FILES, buildCanonicalVitePlusConfig, cleanLegacyConfigFiles, repairVitePlusProject, syncViteConfigWithAuditConfig } from "../../core/vitePlusConfigSync.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_vite_plus_config.ts
enableCompileCache();
const VITE_PLUS_CONFIG_RULES = [
	"vite-plus-config-missing",
	"vite-plus-config-any-allowed",
	"vite-plus-config-ts-ignore-allowed",
	"vite-plus-config-type-assertions-allowed",
	"vite-plus-config-double-cast-allowed",
	"vite-plus-config-legacy-date-allowed",
	"vite-plus-config-fmt-missing",
	"vite-plus-config-staged-missing",
	"vite-plus-config-test-missing",
	"vite-plus-legacy-config-forbidden"
];
function checkRuleLevel(content, ruleName) {
	const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const hasError = new RegExp(`['"]${escaped}['"]\\s*:\\s*['"]error['"]`, "i").test(content) || new RegExp(`['"]${escaped}['"]\\s*:\\s*\\[\\s*['"]error['"]`, "i").test(content);
	const hasOffOrWarn = new RegExp(`['"]${escaped}['"]\\s*:\\s*['"](?:off|warn|0|1)['"]`, "i").test(content) || new RegExp(`['"]${escaped}['"]\\s*:\\s*\\[\\s*['"](?:off|warn|0|1)['"]`, "i").test(content);
	return hasError && !hasOffOrWarn;
}
/**
* Validates that a vite.config.ts file enforces strict /domain-type-first rules and sections.
*/
function auditVitePlusConfigContent(content, fileName) {
	const findings = [];
	if (!checkRuleLevel(content, "@typescript-eslint/no-explicit-any")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-any-allowed",
		ruleDescription: "Vite+: Regla no-explicit-any no es error",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@typescript-eslint/no-explicit-any",
		message: `La regla '@typescript-eslint/no-explicit-any' debe estar configurada en 'error' en vite.config.ts para cumplir con /domain-type-first.`
	});
	if (!checkRuleLevel(content, "@typescript-eslint/ban-ts-comment")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-ts-ignore-allowed",
		ruleDescription: "Vite+: Regla ban-ts-comment no es error",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@typescript-eslint/ban-ts-comment",
		message: `La regla '@typescript-eslint/ban-ts-comment' debe estar configurada en 'error' en vite.config.ts para prohibir supresiones (@ts-ignore) en tipos de dominio.`
	});
	if (!(/['"]@typescript-eslint\/consistent-type-assertions['"]\s*:\s*\[\s*['"]error['"]/i.test(content) && !/['"]@typescript-eslint\/consistent-type-assertions['"]\s*:\s*['"](?:off|warn|0|1)['"]/i.test(content))) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-type-assertions-allowed",
		ruleDescription: "Vite+: Regla consistent-type-assertions no configurada en error",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@typescript-eslint/consistent-type-assertions",
		message: `Falta configurar '@typescript-eslint/consistent-type-assertions' en 'error' con estilo 'as' y objectLiteralTypeAssertions: 'never'.`
	});
	if (!checkRuleLevel(content, "@francogp/domain-type/no-double-cast-unknown")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-double-cast-allowed",
		ruleDescription: "Vite+: Falta prohibición de doble casteo a unknown",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@francogp/domain-type/no-double-cast-unknown",
		message: `Falta la regla '@francogp/domain-type/no-double-cast-unknown' configurada en 'error' para prohibir el casteo hacia unknown.`
	});
	if (!checkRuleLevel(content, "@francogp/domain-type/no-legacy-date")) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-legacy-date-allowed",
		ruleDescription: "Vite+: Falta prohibición de constructores legados de Date",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "@francogp/domain-type/no-legacy-date",
		message: `Falta la regla '@francogp/domain-type/no-legacy-date' configurada en 'error' para prohibir new Date() y Date.now().`
	});
	if (!/(^|\s)fmt\s*:\s*\{/m.test(content)) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-fmt-missing",
		ruleDescription: "Vite+: Falta bloque de formato fmt",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "fmt",
		message: `Falta la sección 'fmt' en vite.config.ts para gobernar el formateo nativo con Oxfmt.`
	});
	if (!/(^|\s)staged\s*:\s*\{/m.test(content)) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-staged-missing",
		ruleDescription: "Vite+: Falta bloque de git hooks staged",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "staged",
		message: `Falta la sección 'staged' en vite.config.ts para habilitar git hooks pre-commit nativos.`
	});
	if (!/(^|\s)test\s*:\s*\{/m.test(content)) findings.push({
		suiteId: "validate_vite_plus_config",
		suiteName: "Vite+ Unified Configuration Validator",
		ruleId: "vite-plus-config-test-missing",
		ruleDescription: "Vite+: Falta bloque de pruebas test",
		severity: "error",
		file: fileName,
		line: 1,
		col: 1,
		context: "test",
		message: `Falta la sección 'test' en vite.config.ts para ejecutar pruebas con Vitest integrado.`
	});
	return findings;
}
const VITE_PLUS_CONFIG_REQUIREMENT = {
	id: "vite-plus-config",
	file: "vite.config.ts",
	candidateFiles: ["vite.config.ts"],
	description: "Configuración unificada de Vite+ (vite.config.ts)",
	ruleId: "vite-plus-config-missing",
	generateDefaultContent: (ctx) => buildCanonicalVitePlusConfig(getAuditConfig(ctx.projectRoot))
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
				phase: "normal",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["vite-plus-config-missing", "vite-plus-legacy-config-forbidden"]),
			fixableRuleIds: ["vite-plus-config-missing", "vite-plus-legacy-config-forbidden"],
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
			ruleDescriptions: {
				"vite-plus-config-missing": "Archivo vite.config.ts ausente",
				"vite-plus-config-any-allowed": "Regla no-explicit-any no es error",
				"vite-plus-config-ts-ignore-allowed": "Regla ban-ts-comment no es error",
				"vite-plus-config-type-assertions-allowed": "Regla consistent-type-assertions",
				"vite-plus-config-double-cast-allowed": "Falta prohibición de doble casteo a unknown",
				"vite-plus-config-legacy-date-allowed": "Falta prohibición de Date legado",
				"vite-plus-config-fmt-missing": "Falta bloque de formateo fmt",
				"vite-plus-config-staged-missing": "Falta bloque de git hooks staged",
				"vite-plus-config-test-missing": "Falta bloque de pruebas test",
				"vite-plus-legacy-config-forbidden": "Configuraciones legacy prohibidas"
			},
			ruleRemediations: {
				"vite-plus-config-missing": "Guía de diagnóstico y remediación para vite-plus-config-missing. Ejecuta `auditor fix` para generar vite.config.ts desde .auditor/audit.config.ts.",
				"vite-plus-config-any-allowed": "Guía de diagnóstico y remediación para vite-plus-config-any-allowed. Configura @typescript-eslint/no-explicit-any en \"error\" en vite.config.ts.",
				"vite-plus-config-ts-ignore-allowed": "Guía de diagnóstico y remediación para vite-plus-config-ts-ignore-allowed. Configura @typescript-eslint/ban-ts-comment en \"error\" en vite.config.ts.",
				"vite-plus-config-type-assertions-allowed": "Guía de diagnóstico y remediación para vite-plus-config-type-assertions-allowed. Configura consistent-type-assertions en \"error\" en vite.config.ts.",
				"vite-plus-config-double-cast-allowed": "Guía de diagnóstico y remediación para vite-plus-config-double-cast-allowed. Configura @francogp/domain-type/no-double-cast-unknown en \"error\" en vite.config.ts.",
				"vite-plus-config-legacy-date-allowed": "Guía de diagnóstico y remediación para vite-plus-config-legacy-date-allowed. Configura @francogp/domain-type/no-legacy-date en \"error\" en vite.config.ts.",
				"vite-plus-config-fmt-missing": "Guía de diagnóstico y remediación para vite-plus-config-fmt-missing. Configura la sección fmt en vite.config.ts o ejecuta `auditor fix`.",
				"vite-plus-config-staged-missing": "Guía de diagnóstico y remediación para vite-plus-config-staged-missing. Configura la sección staged en vite.config.ts o ejecuta `auditor fix`.",
				"vite-plus-config-test-missing": "Guía de diagnóstico y remediación para vite-plus-config-test-missing. Configura la sección test en vite.config.ts o ejecuta `auditor fix`.",
				"vite-plus-legacy-config-forbidden": "Guía de diagnóstico y remediación para vite-plus-legacy-config-forbidden. Elimina archivos de configuración obsoletos (eslint, vitest, tsdown) migrándolos a vite.config.ts."
			},
			coverage: { include: ["vite.config.ts"] },
			projectRoot: effectiveRoot
		});
	}
	async runAudit() {
		if (this.isFixActive()) repairVitePlusProject(this.projectRoot);
		this.runSubAuditorSync("vite-plus-legacy-config-forbidden", () => {
			for (const legacy of LEGACY_CONFIG_FILES) {
				const fullPath = path.resolve(this.projectRoot, legacy);
				if (fs.existsSync(fullPath)) {
					if (this.isFixActive()) {
						cleanLegacyConfigFiles(this.projectRoot);
						break;
					} else this.addViolation({
						ruleId: "vite-plus-legacy-config-forbidden",
						severity: "error",
						file: legacy,
						line: 1,
						context: legacy,
						message: `El archivo '${legacy}' es un archivo de configuración obsoleto. Toda la configuración debe vivir en vite.config.ts y sincronizarse desde .auditor/audit.config.ts.`,
						fixable: true
					});
				}
			}
		});
		const requirement = this.configFiles[0] ?? VITE_PLUS_CONFIG_REQUIREMENT;
		const ensured = await this.runSubAuditor("vite-plus-config-missing", async () => {
			return await this.ensureConfigFile(requirement);
		});
		if (this.isFixActive() && fs.existsSync(path.resolve(this.projectRoot, "vite.config.ts"))) syncViteConfigWithAuditConfig(this.projectRoot);
		if (!ensured) {
			this.markRuleNotApplicable("vite-plus-config-any-allowed", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-ts-ignore-allowed", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-type-assertions-allowed", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-double-cast-allowed", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-legacy-date-allowed", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-fmt-missing", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-staged-missing", "Archivo de configuración no encontrado");
			this.markRuleNotApplicable("vite-plus-config-test-missing", "Archivo de configuración no encontrado");
			return;
		}
		const resolvedPath = ensured.resolvedPath;
		const relFileName = toPosixRelative(this.projectRoot, resolvedPath);
		this.recordScanned(relFileName);
		const findings = auditVitePlusConfigContent(fs.readFileSync(resolvedPath, "utf-8"), relFileName);
		const findingMap = /* @__PURE__ */ new Map();
		for (const f of findings) findingMap.set(f.ruleId, f);
		for (const ruleId of [
			"vite-plus-config-any-allowed",
			"vite-plus-config-ts-ignore-allowed",
			"vite-plus-config-type-assertions-allowed",
			"vite-plus-config-double-cast-allowed",
			"vite-plus-config-legacy-date-allowed",
			"vite-plus-config-fmt-missing",
			"vite-plus-config-staged-missing",
			"vite-plus-config-test-missing"
		]) this.runSubAuditorSync(ruleId, () => {
			const f = findingMap.get(ruleId);
			if (f) this.addViolation({
				ruleId,
				severity: "error",
				file: relFileName,
				line: f.line ?? 1,
				context: f.context ?? ruleId,
				message: f.message
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
