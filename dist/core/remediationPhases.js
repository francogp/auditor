//#region src/core/remediationPhases.ts
/**
* src/core/remediationPhases.ts
*
* CANONICAL REMEDIATION PHASES & STRATEGIC RESOLUTION ORDER
* Defines the immutable 7-tier strategic resolution sequence for static analysis findings.
* Governs the developer and AI agent workflow to eradicate wasted effort:
* Pruning -> Deduplication -> Contracts -> Framework/UI -> Hygiene -> Polish.
*/
const REMEDIATION_PHASE_IDS = [
	"setup",
	"prune",
	"dedup",
	"contracts",
	"behavior",
	"hygiene",
	"polish"
];
const REMEDIATION_PHASES = Object.freeze({
	setup: {
		id: "setup",
		order: 1,
		title: "FASE 1 · INFRAESTRUCTURA Y SETUP",
		icon: "⚙️",
		description: "Configuración base, scripts, tsconfig, engines y dependencias mínimas.",
		rationale: "Resuelve primero bloqueos de compilación e infraestructura para erradicar falsos positivos en cascada."
	},
	prune: {
		id: "prune",
		order: 2,
		title: "FASE 2 · PODA DE CÓDIGO MUERTO",
		icon: "🧹",
		description: "Archivos muertos, exports no consumidos y dependencias no utilizadas.",
		rationale: "Elimina archivos y exports muertos antes de refactorizar: extirpa cientos de errores de raíz con cero esfuerzo."
	},
	dedup: {
		id: "dedup",
		order: 3,
		title: "FASE 3 · DESDUPLICACIÓN Y CLONES",
		icon: "🧩",
		description: "Bloques triplicados, código duplicado Fallow, clones semánticos y constantes redundantes.",
		rationale: "Unifica clones en una única función canónica antes de pulir detalles, evitando multiplicar el trabajo por 5x."
	},
	contracts: {
		id: "contracts",
		order: 4,
		title: "FASE 4 · CONTRATOS Y TIPADO",
		icon: "🔒",
		description: "Errores TypeScript, as any/unknown, strings crudos en dominio y paridad Valibot.",
		rationale: "Establece cimientos sólidos en el modelo de datos y contratos antes de alterar la lógica de componentes o UI."
	},
	behavior: {
		id: "behavior",
		order: 5,
		title: "FASE 5 · FRAMEWORK Y UI",
		icon: "🎨",
		description: "GSAP, HTML5 semántico, reactividad Vue/SFC, timers fuera de ciclo y colisiones de estilos.",
		rationale: "Garantiza la corrección funcional, rendimiento y ciclo de vida de la interfaz de usuario."
	},
	hygiene: {
		id: "hygiene",
		order: 6,
		title: "FASE 6 · HIGIENE Y LINTER",
		icon: "🔍",
		description: "Reglas de Oxlint, objetivos de refactor Fallow y números mágicos (MagicNumbers).",
		rationale: "Extrae constantes y simplifica funciones largas sobre código que ya fue desduplicado, tipado y saneado."
	},
	polish: {
		id: "polish",
		order: 7,
		title: "FASE 7 · FORMATO Y COBERTURA",
		icon: "✨",
		description: "Formateo Oxfmt, índices DOX (AGENTS.md), sintaxis Markdown/Mermaid y umbrales de tests.",
		rationale: "Paso final: formateo automático, sincronización documental y confirmación de que la suite de tests pasa limpia."
	}
});
const REMEDIATION_PHASE_SET = new Set(REMEDIATION_PHASE_IDS);
function isRemediationPhaseId(val) {
	return typeof val === "string" && REMEDIATION_PHASE_SET.has(val);
}
function getRemediationPhaseMetadata(phaseId) {
	return REMEDIATION_PHASES[phaseId];
}
//#endregion
export { REMEDIATION_PHASES, REMEDIATION_PHASE_IDS, getRemediationPhaseMetadata, isRemediationPhaseId };
