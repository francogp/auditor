import "./auditConfigTypes.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import { REMEDIATION_PHASES, REMEDIATION_PHASE_IDS, getRemediationPhaseMetadata, isRemediationPhaseId } from "./remediationPhases.js";
import path from "node:path";
//#region src/core/auditContract.ts
/**
* packages/auditor/src/core/auditContract.ts
*
* STANDARD AUDIT CONTRACT (Node.js 26+)
* Defines the immutable data structures, family types, and standard outputs
* required for all sub-auditors and the general audit orchestrator.
*/
const BUILTIN_AUDIT_FAMILIES = [
	"architecture",
	"domain_data",
	"persistence",
	"performance",
	"security",
	"documentation"
];
const FAMILY_METADATA = {
	architecture: {
		key: "architecture",
		title: "STATIC STANDARDS, AST & ARCHITECTURE",
		order: 1,
		icon: "📁",
		description: "Code quality rules, AST, Fallow intelligence, and dependencies."
	},
	domain_data: {
		key: "domain_data",
		title: "DOMAIN TYPES & CANONICAL DATABASES",
		order: 2,
		icon: "🔒",
		description: "Strict domain type validation (/domain-type-first), catalogs, and formulas."
	},
	persistence: {
		key: "persistence",
		title: "PERSISTENCE, SQL & MIGRATIONS",
		order: 3,
		icon: "💾",
		description: "Syntactic integrity of PostgreSQL/Supabase/SQLite migrations and RLS policies."
	},
	performance: {
		key: "performance",
		title: "WEB PERFORMANCE, LATENCY & DATABASE",
		order: 4,
		icon: "⚡",
		description: "Core Web Vitals, SQL query optimization, and rendering efficiency."
	},
	security: {
		key: "security",
		title: "SECURITY, HARDENING & ACCESS CONTROL",
		order: 5,
		icon: "🛡️",
		description: "OWASP Top 10 vulnerabilities, SSRF prevention, injections, and ReDoS."
	},
	documentation: {
		key: "documentation",
		title: "DOCUMENTATION & DOX STRUCTURE",
		order: 6,
		icon: "📚",
		description: "Relative link integrity in markdown and DOX indices (AGENTS.md)."
	}
};
const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
const FALLBACK_FAMILY_ORDER = 99;
function resolveFamilyMetadata(familyKey, customFamilies) {
	if (FAMILY_METADATA[familyKey]) return FAMILY_METADATA[familyKey];
	const custom = customFamilies?.find((f) => f.key === familyKey);
	if (custom) return {
		key: custom.key,
		title: custom.title,
		order: custom.order ?? 90,
		icon: custom.icon ?? "⚙️",
		description: custom.description ?? `Specific checks for family ${custom.key}.`
	};
	return {
		key: familyKey,
		title: familyKey.toUpperCase(),
		order: 99,
		icon: "⚙️",
		description: `Audit family ${familyKey}.`
	};
}
function getActiveFamilies(customFamilies) {
	const customKeys = (customFamilies ?? []).map((f) => f.key);
	return Array.from(/* @__PURE__ */ new Set([...BUILTIN_AUDIT_FAMILIES, ...customKeys]));
}
const FINDING_SEVERITIES = [
	"error",
	"warning",
	"info"
];
const AUDIT_STATUSES = [
	"passed",
	"failed",
	"skipped"
];
const AUDIT_EXECUTION_SPEEDS = [
	"light",
	"heavy",
	"full"
];
const SPEED_RANK = Object.freeze({
	light: 1,
	heavy: 2,
	full: 3
});
const AUDIT_EXECUTION_PHASES = [
	"setup",
	"normal",
	"post-run",
	"post-build"
];
const AUDIT_FIX_CAPABILITIES = [
	"none",
	"normal",
	"priority"
];
function normalizeSpeeds(speed) {
	if (!speed) return [];
	return Array.isArray(speed) ? speed : [speed];
}
/**
* Resolves the effective speed to run for a given capability under:
* - Ceiling mode (`maxSpeed`): picks the highest/slowest available speed <= maxSpeed. Returns null if none <= maxSpeed.
* - Exact mode (`onlySpeed`): returns onlySpeed if explicitly declared in `declaredSpeed`, else null.
*/
function resolveEffectiveSpeed(declaredSpeed, options = {}) {
	const speeds = normalizeSpeeds(declaredSpeed);
	if (speeds.length === 0) return null;
	if (options.onlySpeed) return speeds.includes(options.onlySpeed) ? options.onlySpeed : null;
	const ceiling = options.maxSpeed ?? "heavy";
	const maxRank = SPEED_RANK[ceiling];
	let best = null;
	for (const s of speeds) {
		const rank = SPEED_RANK[s];
		if (rank !== void 0 && rank <= maxRank) {
			if (!best || rank > SPEED_RANK[best]) best = s;
		}
	}
	return best;
}
const SUB_AUDITOR_STATUSES = [
	"passed",
	"warning",
	"failed"
];
const COVERAGE_SOURCES = ["runtime", "declared-only"];
/**
* Derives the canonical package.json script requirement for any auditor by convention.
*/
function deriveCanonicalAuditorScript(id, description, overrides) {
	const shortId = id.replace(/\.(ts|js)$/, "").replace(/^(validate_|audit_)/, "").replace(/_/g, "-");
	return {
		name: overrides?.name ?? `auditor:${shortId}`,
		command: overrides?.command ?? `auditor task=${id}`,
		description: overrides?.description ?? description,
		category: overrides?.category ?? "suite",
		permissions: overrides?.permissions ?? [],
		...overrides?.isApplicable ? { isApplicable: overrides.isApplicable } : {}
	};
}
const RATCHET_STATUSES = [
	"passed",
	"failed",
	"initialized"
];
/**
* Normalizes a file path from an AuditFinding into a clean relative POSIX path.
*/
function normalizeFindingPath(filePath, cwd = process.cwd()) {
	if (!filePath) return "General";
	const posix = (path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath).replaceAll(path.win32.sep, path.posix.sep);
	return (posix.startsWith("./") ? posix.slice(2) : posix) || "General";
}
/**
* Stably sorts an array of AuditFinding instances by:
* 1. Normalized relative file path (case-insensitive ASC)
* 2. Line number (ASC, missing/undefined at top = 0)
* 3. Column number (ASC)
* 4. Severity ('error' first, then 'warning')
* 5. Rule ID (ASC)
*/
function sortFindingsByFileAndLine(findings, cwd = process.cwd()) {
	return [...findings].sort((a, b) => {
		const fileA = normalizeFindingPath(a.file, cwd).toLowerCase();
		const fileB = normalizeFindingPath(b.file, cwd).toLowerCase();
		if (fileA !== fileB) return fileA.localeCompare(fileB);
		const lineA = a.line ?? 0;
		const lineB = b.line ?? 0;
		if (lineA !== lineB) return lineA - lineB;
		const colA = a.col ?? 0;
		const colB = b.col ?? 0;
		if (colA !== colB) return colA - colB;
		const sevScoreA = a.severity === "error" ? 0 : 1;
		const sevScoreB = b.severity === "error" ? 0 : 1;
		if (sevScoreA !== sevScoreB) return sevScoreA - sevScoreB;
		return (a.ruleId ?? "").localeCompare(b.ruleId ?? "");
	});
}
/**
* Groups an array of AuditFindings into a map indexed by normalized relative file path,
* where findings within each file are guaranteed sorted by line number ascending.
*/
function groupFindingsByFileMap(findings, cwd = process.cwd()) {
	const sorted = sortFindingsByFileAndLine(findings, cwd);
	const map = {};
	for (const f of sorted) {
		const norm = normalizeFindingPath(f.file, cwd);
		if (!map[norm]) map[norm] = {
			file: norm,
			errors: 0,
			warnings: 0,
			findings: []
		};
		if (f.severity === "error") map[norm].errors++;
		else map[norm].warnings++;
		map[norm].findings.push(f);
	}
	return map;
}
const ONE_MINUTE_MS = 6e4;
const MAX_AUDIT_STALENESS_MS = 5 * ONE_MINUTE_MS;
function assertAuditFreshness(meta, consumerName, options) {
	if (options.allowStale) return;
	const configuredMinutes = getAuditConfig(options.projectRoot).runner?.maxStalenessMinutes ?? 5;
	const maxAge = options.maxAgeMs ?? configuredMinutes * 6e4;
	try {
		const auditInstant = Temporal.Instant.from(meta.timestamp);
		const now = Temporal.Now.instant();
		if (now.since(auditInstant).total({ unit: "millisecond" }) > maxAge) {
			const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: "minute" })));
			const limitMins = Math.round(maxAge / ONE_MINUTE_MS);
			throw new Error(`[${consumerName}] scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min). El código fuente puede haber cambiado desde la última auditoría. 👉 DEBES ejecutar 'npm run auditor' para refrescar el reporte.`);
		}
	} catch (err) {
		if (err.message.includes("OBSOLETO")) throw err;
		throw new Error(`[${consumerName}] scratch/audits/latest_audit.json contiene un timestamp inválido ('${meta.timestamp}'). Ejecuta 'npm run auditor' para regenerarlo.`, { cause: err });
	}
}
function assertAuditSuiteExecuted(meta, requiredSuiteId, consumerName) {
	const wasExecuted = Array.isArray(meta.executedSuites) && meta.executedSuites.includes(requiredSuiteId);
	const wasOmitted = Array.isArray(meta.omittedSuites) && meta.omittedSuites.includes(requiredSuiteId);
	if (!wasExecuted || wasOmitted) {
		const modeDesc = meta.runMode === "preset" ? `preset=${meta.preset}` : meta.runMode === "family" ? `family=${meta.targetFamily}` : meta.runMode;
		throw new Error(`[${consumerName}] La suite requerida '${requiredSuiteId}' NO fue ejecutada en la última auditoría. latest_audit.json fue generado por una corrida PARCIAL (${modeDesc}, ${meta.executedSuiteCount}/${meta.totalDiscoveredSuites} suites ejecutadas). 👉 DEBES ejecutar 'npm run auditor' (completo) o 'npm run auditor task=${requiredSuiteId}' para obtener datos válidos.`);
	}
}
/**
* Asserts that a required auditor was executed in the consolidated audit report
* and that the report is fresh (generated within the last 5 minutes).
* Throws a fatal descriptive error if the audit is partial, the suite was omitted,
* or the report is stale.
*/
function assertAuditorExecuted(report, requiredSuiteId, consumerName, options = {}) {
	if (!report || !report.meta) throw new Error(`[${consumerName}] scratch/audits/latest_audit.json no contiene la cabecera de metadatos 'meta'. Es posible que provenga de una versión obsoleta o esté corrupto. Ejecuta 'npm run auditor' para regenerarlo.`);
	assertAuditFreshness(report.meta, consumerName, options);
	assertAuditSuiteExecuted(report.meta, requiredSuiteId, consumerName);
}
function groupResultsByFamily(results, initialFamilies) {
	const byFamily = /* @__PURE__ */ new Map();
	if (initialFamilies) for (const f of initialFamilies) byFamily.set(f, []);
	for (const r of results) {
		if (!byFamily.has(r.family)) byFamily.set(r.family, []);
		byFamily.get(r.family).push(r);
	}
	return byFamily;
}
/**
* Single Source of Truth for counting fixable findings.
* Conforms to the Zero False-Fix Mandate: only findings explicitly marked `fixable === true`
* are counted as mechanically fixable.
*/
function countFixableFindings(findings) {
	let fixableErrors = 0;
	let fixableWarnings = 0;
	for (const f of findings) if (f.fixable === true) {
		if (f.severity === "error") fixableErrors++;
		else if (f.severity === "warning") fixableWarnings++;
	}
	return {
		fixableErrors,
		fixableWarnings,
		totalFixable: fixableErrors + fixableWarnings
	};
}
/**
* Universal coordinator helper to evaluate fixable violations across all suite results.
* Respects the Post-Fix Invariant: when isFixMode is true, fixableErrors is strictly 0.
*/
function computeResultsFixableViolations(results, isFixMode = false) {
	if (isFixMode) return {
		fixableErrors: 0,
		fixableWarnings: 0,
		autoFixRecommended: false
	};
	let fixableErrors = 0;
	let fixableWarnings = 0;
	for (const res of results) if (res.summary.fixableErrors !== void 0 && res.summary.fixableWarnings !== void 0) {
		fixableErrors += res.summary.fixableErrors;
		fixableWarnings += res.summary.fixableWarnings;
	} else {
		const counts = countFixableFindings(res.findings);
		fixableErrors += counts.fixableErrors;
		fixableWarnings += counts.fixableWarnings;
	}
	return {
		fixableErrors,
		fixableWarnings,
		autoFixRecommended: fixableErrors > 0 || fixableWarnings > 0
	};
}
//#endregion
export { AUDIT_EXECUTION_PHASES, AUDIT_EXECUTION_SPEEDS, AUDIT_FIX_CAPABILITIES, AUDIT_STATUSES, BUILTIN_AUDIT_FAMILIES, COVERAGE_SOURCES, DEFAULT_CUSTOM_FAMILY_ORDER, FALLBACK_FAMILY_ORDER, FAMILY_METADATA, FINDING_SEVERITIES, MAX_AUDIT_STALENESS_MS, ONE_MINUTE_MS, RATCHET_STATUSES, REMEDIATION_PHASES, REMEDIATION_PHASE_IDS, SPEED_RANK, SUB_AUDITOR_STATUSES, assertAuditorExecuted, computeResultsFixableViolations, countFixableFindings, deriveCanonicalAuditorScript, getActiveFamilies, getRemediationPhaseMetadata, groupFindingsByFileMap, groupResultsByFamily, isRemediationPhaseId, normalizeFindingPath, normalizeSpeeds, resolveEffectiveSpeed, resolveFamilyMetadata, sortFindingsByFileAndLine };
