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
				"dox-missing-agents-md": "📖 GUÍA DE REMEDIACIÓN: dox-missing-agents-md\n1. Causa Raíz: Un directorio auditable de la jerarquía DOX carece de su archivo descriptivo `AGENTS.md`. La arquitectura DOX exige documentación local en cada paquete o módulo clave.\n2. Diagnóstico: Comprueba el directorio indicado en la violación.\n3. Solución Canónica: Crea `AGENTS.md` en dicho directorio con las secciones estándar: `# Purpose`, `## Ownership`, `## Local Contracts` y `## File Manifest`.\n4. Ejemplo:\n   - Crear `src/services/auth/AGENTS.md` con su descripción y lista de responsabilidades.",
				"dox-unregistered-child": "📖 GUÍA DE REMEDIACIÓN: dox-unregistered-child\n1. Causa Raíz: Un archivo `AGENTS.md` hijo existe en un subdirectorio pero no está referenciado/enlazado en la sección correspondiente del `AGENTS.md` padre.\n2. Diagnóstico: Revisa el `AGENTS.md` del directorio superior.\n3. Solución Canónica: Añade el enlace relativo al `AGENTS.md` hijo en el índice o lista de submódulos del archivo padre.\n4. Ejemplo:\n   - En `src/AGENTS.md`: `- [auth](file:///services/auth/AGENTS.md)`",
				"dox-unindexed-file": "📖 GUÍA DE REMEDIACIÓN: dox-unindexed-file\n1. Causa Raíz: Un archivo de código o componente no está indexado en el `AGENTS.md` correspondiente a su directorio.\n2. Diagnóstico: Ubica el archivo señalado en el mensaje de error y abre el `AGENTS.md` de su carpeta.\n3. Solución Canónica: Agrega una entrada en la tabla o lista de archivos de `AGENTS.md` describiendo brevemente su propósito y responsabilidades.\n4. Ejemplo:\n   - `- [`AuthService.ts`](file:///src/services/AuthService.ts): Servicio de autenticación y renovación de tokens JWT.`",
				"dox-missing-section": "📖 GUÍA DE REMEDIACIÓN: dox-missing-section\n1. Causa Raíz: El archivo `AGENTS.md` carece de una de las secciones estructurales obligatorias (ej: `Purpose`, `Ownership`, `Local Contracts`).\n2. Diagnóstico: Revisa los encabezados H1/H2 en el `AGENTS.md` reportado.\n3. Solución Canónica: Agrega el encabezado faltante respetando la especificación canónica de DOX.\n4. Ejemplo:\n   - Añadir: `## Ownership\\n\\nCore Team / Architecture.`",
				"dox-section-order": "📖 GUÍA DE REMEDIACIÓN: dox-section-order\n1. Causa Raíz: Los encabezados de sección en `AGENTS.md` no siguen la secuencia canónica estipulada por la especificación DOX.\n2. Diagnóstico: Verifica el orden de las secciones en el archivo reportado.\n3. Solución Canónica: Reordena las secciones respetando el flujo estándar: 1. Purpose -> 2. Ownership -> 3. Local Contracts -> 4. Manifest / Index.\n4. Ejemplo:\n   - Mover `## Ownership` inmediatamente después de `# Purpose`.",
				"dox-empty-section": "📖 GUÍA DE REMEDIACIÓN: dox-empty-section\n1. Causa Raíz: Una sección en `AGENTS.md` está completamente vacía o contiene texto placeholder genérico (e.g. \"TBD\", \"TODO\", \"Lorem ipsum\").\n2. Diagnóstico: Revisa la sección indicada en la línea del hallazgo.\n3. Solución Canónica: Redacta una descripción técnica concisa y real de la responsabilidad o contrato del módulo.\n4. Ejemplo:\n   ❌ Incorrecto: `## Local Contracts\\nTODO`\n   ✅ Correcto:   `## Local Contracts\\n- Todos los métodos retornan Result<T, DomainError>.`"
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
