import path from "node:path";
//#region src/core/auditConfigAntiAbuse.ts
/**
* packages/auditor/src/core/auditConfigAntiAbuse.ts
*
* Anti-abuse assertions, glob constraints, and root exemptions
* for the audit configuration engine.
*/
const FORBIDDEN_PRODUCTION_ROOTS = [
	"src/logic",
	"src/domain",
	"src/stores",
	"src/components",
	"src/views",
	"src/composables",
	"src/services",
	"src/models",
	"src/controllers",
	"src/api",
	"src/server"
];
const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
const MIN_COVERAGE_REASON_LENGTH = 15;
const BLOCKED_WILDCARD_LITERALS = [
	"",
	"*",
	"**",
	"*.*",
	".*"
];
const BLOCKED_WILDCARD_PATTERNS = [
	/^src(?:\/\*+|\/)?$/i,
	/^scripts(?:\/\*+|\/)?$/i,
	/^\*+\/\*+$/
];
const UNIVERSAL_COVERAGE_REGEX = /^(?:\*\*?\/?)+(?:\*(?:\.\*)?)?$/;
const NARROW_EXTENSION_REGEX = /^\*\*\/\*\.\w+$/;
function normalizeRootPath(p) {
	return p.replaceAll(path.win32.sep, path.posix.sep).split("/").filter((seg) => Boolean(seg) && seg !== ".").join("/");
}
function getExemptRootsForPolicy(policy, paths) {
	switch (policy) {
		case "scripts": return paths.scriptsRoots ?? ["scripts"];
		case "cli": return paths.cliRoots ?? ["scripts"];
		case "demo": return paths.demoRoots ?? [];
		case "data": return paths.dataRoots ?? [];
		default: return [];
	}
}
function filterOutExemptRoots(roots, exemptRoots) {
	const exemptSet = new Set(exemptRoots.map(normalizeRootPath));
	return roots.filter((r) => !exemptSet.has(normalizeRootPath(r)));
}
function isBlanketCoverageGlob(glob) {
	if (!glob || glob.includes("\\") || path.posix.isAbsolute(glob) || glob === "*.*") return true;
	return UNIVERSAL_COVERAGE_REGEX.test(glob) || NARROW_EXTENSION_REGEX.test(glob);
}
/**
* Rejects globs that would blanket-exempt the repository, a whole extension, or a whole code/test root.
*/
function assertNarrowCoverageGlob(field, rawGlob, protectedRoots) {
	const glob = (rawGlob ?? "").trim();
	if (isBlanketCoverageGlob(glob)) throw new Error(`[AuditConfig Anti-Abuse] '${field}' contiene un glob global o inválido: '${rawGlob}'. Usa globs POSIX relativos y acotados (ej: 'dist/**', 'LICENSE').`);
	for (const root of protectedRoots) {
		const cleanRoot = normalizeRootPath(root);
		if (!cleanRoot) continue;
		if (glob === cleanRoot || new RegExp(`^${RegExp.escape(cleanRoot)}/(?:\\*\\*/?)*\\*?(?:\\.\\*|\\.\\w+)?$`).test(glob)) throw new Error(`[AuditConfig Anti-Abuse] '${field}' no puede eximir una raíz de código completa ('${rawGlob}' cubre '${cleanRoot}').`);
	}
}
function assertCoverageReason(field, glob, reason) {
	if (typeof reason !== "string" || reason.trim().length < 15) throw new Error(`[AuditConfig Anti-Abuse] '${field}' para '${glob}' requiere un 'reason' de al menos 15 caracteres.`);
}
function isUniversalWildcard(glob) {
	return BLOCKED_WILDCARD_LITERALS.some((literal) => literal === glob) || BLOCKED_WILDCARD_PATTERNS.some((re) => re.test(glob));
}
function isProtectedProductionRoot(normalizedLower, prodRoot) {
	return normalizedLower === prodRoot || normalizedLower.startsWith(`${prodRoot}/`) || normalizedLower.includes(`/${prodRoot}/`) || normalizedLower.startsWith(`**/${prodRoot}`);
}
function assertNoUniversalWildcard(rawGlob, glob) {
	if (isUniversalWildcard(glob)) throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene un comodín global no permitido: '${rawGlob}'.\nEstá ESTRICTAMENTE PROHIBIDO usar comodines globales ('*', '**', 'src/**', 'scripts/**') para evadir el mandato de números mágicos.`);
}
function assertNoProtectedProductionRoots(rawGlob, normalizedLower) {
	for (const prodRoot of FORBIDDEN_PRODUCTION_ROOTS) if (isProtectedProductionRoot(normalizedLower, prodRoot)) throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene una ruta de lógica de producción protegida: '${rawGlob}'.\nEstá ESTRICTAMENTE PROHIBIDO eximir directorios de producción (como '${prodRoot}').\nLas excepciones de números mágicos solo están permitidas para scripts de semillas, fixtures o demostraciones aisladas (ej: 'scripts/database/seeds/**', 'ui-demo/**').`);
}
function validateConstantsExemptGlobs(globs) {
	if (globs.length > 15) throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' excede el límite máximo de 15 patrones (${globs.length} configurados).\nNo abuses de las excepciones. Si tienes tantas incidencias, extrae constantes nominadas descriptivas o usa fábricas de prueba.`);
	for (const rawGlob of globs) {
		const glob = rawGlob.trim().replaceAll(path.win32.sep, path.posix.sep);
		assertNoUniversalWildcard(rawGlob, glob);
		assertNoProtectedProductionRoots(rawGlob, glob.toLowerCase().replace(/^\/+/, ""));
	}
}
//#endregion
export { FORBIDDEN_PRODUCTION_ROOTS, MAX_CONSTANTS_EXEMPT_GLOBS, MIN_COVERAGE_REASON_LENGTH, assertCoverageReason, assertNarrowCoverageGlob, filterOutExemptRoots, getExemptRootsForPolicy, normalizeRootPath, validateConstantsExemptGlobs };
