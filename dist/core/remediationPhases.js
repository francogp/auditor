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
		title: "PHASE 1 · INFRASTRUCTURE & SETUP",
		icon: "⚙️",
		description: "Base configuration, scripts, tsconfig, engines, and minimum dependencies.",
		rationale: "Resolves compilation and infrastructure blockers first to eradicate cascading false positives."
	},
	prune: {
		id: "prune",
		order: 2,
		title: "PHASE 2 · DEAD CODE PRUNING",
		icon: "🧹",
		description: "Dead files, unconsumed exports, and unused dependencies.",
		rationale: "Removes dead files and exports before refactoring: eliminates hundreds of errors at the root with zero effort."
	},
	dedup: {
		id: "dedup",
		order: 3,
		title: "PHASE 3 · DEDUPLICATION & CLONES",
		icon: "🧩",
		description: "Triplicated blocks, Fallow duplicate code, semantic clones, and redundant constants.",
		rationale: "Unifies clones into a single canonical function before polishing details, avoiding multiplying work by 5x."
	},
	contracts: {
		id: "contracts",
		order: 4,
		title: "PHASE 4 · CONTRACTS & TYPING",
		icon: "🔒",
		description: "TypeScript errors, as any/unknown, naked strings in domain, and Valibot parity.",
		rationale: "Establishes solid data model foundations and contracts before altering component or UI logic."
	},
	behavior: {
		id: "behavior",
		order: 5,
		title: "PHASE 5 · FRAMEWORK & UI",
		icon: "🎨",
		description: "GSAP, semantic HTML5, Vue/SFC reactivity, unmanaged lifecycle timers, and style collisions.",
		rationale: "Guarantees functional correctness, performance, and UI lifecycle integrity."
	},
	hygiene: {
		id: "hygiene",
		order: 6,
		title: "PHASE 6 · HYGIENE & LINTER",
		icon: "🔍",
		description: "Oxlint rules, Fallow refactoring targets, and magic numbers (MagicNumbers).",
		rationale: "Extracts constants and simplifies complex functions on code that is already deduplicated, typed, and sanitized."
	},
	polish: {
		id: "polish",
		order: 7,
		title: "PHASE 7 · FORMATTING & COVERAGE",
		icon: "✨",
		description: "Oxfmt formatting, DOX indices (AGENTS.md), Markdown/Mermaid syntax, and test coverage thresholds.",
		rationale: "Final pass: automated formatting, documentation sync, and confirmation that test suites pass cleanly."
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
