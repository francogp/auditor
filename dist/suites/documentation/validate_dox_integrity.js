import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveIgnoreDirs } from "../../core/auditorBase.js";
import { checkDoxIntegrity } from "../../analyzers/doxAnalyzer.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/documentation/validate_dox_integrity.ts
/**
* scripts/auditors/documentation/validate_dox_integrity.ts
*
* DOX & AGENTS.md HIERARCHY AND INTEGRITY AUDITOR (Node.js 26+ Native)
*
* Enforces documentation governance and link integrity across all AGENTS.md files:
*   1. Verifies that every code directory contains an AGENTS.md file.
*   2. Verifies that child AGENTS.md files are registered in their nearest parent index.
*   3. Enforces relative links (forbids absolute paths).
*   4. Verifies target files exist on disk (no broken links).
*   5. Forbids linking to git-ignored files (.gitignore).
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_dox_integrity.ts
*   npm run validate:dox-integrity
*/
enableCompileCache();
const DOX_RULES = [
	"dox-missing-agents-md",
	"dox-unregistered-child",
	"dox-unindexed-file",
	"dox-missing-section",
	"dox-section-order",
	"dox-empty-section"
];
var DoxIntegrityAuditor = class extends BaseAuditor {
	rootDir;
	constructor(rootDir) {
		const projectRoot = rootDir || process.cwd();
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(DOX_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_dox_integrity",
			name: "DOX & AGENTS.md Integrity Validator",
			description: "Valida jerarquía, estructura e integridad de AGENTS.md",
			family: "documentation",
			packageName: "DOX",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📚",
			ruleIds: DOX_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DOX_RULES, "polish"),
			ruleDescriptions: {
				"dox-missing-agents-md": "Falta AGENTS.md en directorio",
				"dox-unregistered-child": "AGENTS.md hijo no registrado",
				"dox-unindexed-file": "Archivo de código no indexado en DOX",
				"dox-missing-section": "Sección obligatoria ausente en AGENTS.md",
				"dox-section-order": "Orden incorrecto de secciones en AGENTS.md",
				"dox-empty-section": "Sección vacía o con contenido basura"
			},
			ruleRemediations: {
				"dox-missing-agents-md": "Guía de diagnóstico y remediación para dox-missing-agents-md. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"dox-unregistered-child": "Guía de diagnóstico y remediación para dox-unregistered-child. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"dox-unindexed-file": "Guía de diagnóstico y remediación para dox-unindexed-file. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"dox-missing-section": "Guía de diagnóstico y remediación para dox-missing-section. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"dox-section-order": "Guía de diagnóstico y remediación para dox-section-order. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"dox-empty-section": "Guía de diagnóstico y remediación para dox-empty-section. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			coverage: { include: ["**/AGENTS.md"] },
			projectRoot
		});
		this.rootDir = projectRoot;
	}
	async runAudit() {
		await loadAuditConfig(this.rootDir);
		const agentsFiles = this.context.collectFiles(["."], /* @__PURE__ */ new Set([".md"]));
		for (const f of agentsFiles) if (path.basename(f) === "AGENTS.md") this.recordScanned(f);
		if (this.filesScannedCount === 0) this.recordScanned("AGENTS.md");
		const rawViolations = await checkDoxIntegrity(this.rootDir, getEffectiveIgnoreDirs());
		for (const ruleId of DOX_RULES) this.runSubAuditorSync(ruleId, () => {
			const ruleViolations = rawViolations.filter((v) => (v.ruleId || "dox-missing-agents-md") === ruleId);
			for (const v of ruleViolations) this.addViolation({
				ruleId,
				severity: v.severity || "error",
				file: v.file,
				line: v.line || 1,
				message: v.message,
				context: v.context
			});
		});
		this.context.setMetric("Total Violations Found", rawViolations.length);
	}
};
if (process.argv[1] && (process.argv[1].endsWith("validate_dox_integrity.ts") || typeof import.meta.filename === "string" && process.argv[1] === import.meta.filename)) await BaseAuditor.runCli(new DoxIntegrityAuditor());
//#endregion
export { DOX_RULES, DoxIntegrityAuditor };
