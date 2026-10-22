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
const FORBIDDEN_ROOT_PATTERNS = FORBIDDEN_PRODUCTION_ROOTS.map((root) => new RegExp(`(^|/|\\*\\*/)${root.replaceAll("/", "\\/")}(/|$)`, "i"));
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
	const converted = p.replaceAll(path.win32.sep, path.posix.sep);
	const resolved = path.posix.resolve("/", converted);
	return resolved === "/" ? "" : resolved.slice(1);
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
	if (isBlanketCoverageGlob(glob)) throw new Error(`[AuditConfig Anti-Abuse] '${field}' contains a global or invalid blanket glob: '${rawGlob}'. Use scoped, relative POSIX globs (e.g. 'dist/**', 'LICENSE').`);
	for (const root of protectedRoots) {
		const cleanRoot = normalizeRootPath(root);
		if (!cleanRoot) continue;
		if (glob === cleanRoot || new RegExp(`^${RegExp.escape(cleanRoot)}/(?:\\*\\*/?)*\\*?(?:\\.\\*|\\.\\w+)?$`).test(glob)) throw new Error(`[AuditConfig Anti-Abuse] '${field}' cannot exempt an entire code root ('${rawGlob}' covers '${cleanRoot}').`);
	}
}
function assertCoverageReason(field, glob, reason) {
	if (typeof reason !== "string" || reason.trim().length < 15) throw new Error(`[AuditConfig Anti-Abuse] '${field}' for '${glob}' requires a 'reason' of at least 15 characters.`);
}
function isUniversalWildcard(glob) {
	return BLOCKED_WILDCARD_LITERALS.some((literal) => literal === glob) || BLOCKED_WILDCARD_PATTERNS.some((re) => re.test(glob));
}
function assertNoUniversalWildcard(rawGlob, glob) {
	if (isUniversalWildcard(glob)) throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contains a prohibited global wildcard: '${rawGlob}'.\nUsing global wildcards ('*', '**', 'src/**', 'scripts/**') to evade the magic numbers mandate is STRICTLY PROHIBITED.`);
}
function assertNoProtectedProductionRoots(rawGlob, targetPattern) {
	for (let i = 0; i < FORBIDDEN_PRODUCTION_ROOTS.length; i++) if (FORBIDDEN_ROOT_PATTERNS[i].test(targetPattern)) {
		const prodRoot = FORBIDDEN_PRODUCTION_ROOTS[i];
		throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contains a protected production logic path: '${rawGlob}'.\nExempting production directories (such as '${prodRoot}') is STRICTLY PROHIBITED.\nMagic number exceptions are only permitted for seed scripts, fixtures, or isolated demos (e.g. 'scripts/database/seeds/**', 'ui-demo/**').`);
	}
}
function validateConstantsExemptGlobs(globs) {
	if (globs.length > 15) throw new Error(`[AuditConfig Anti-Abuse] 'constants.exemptGlobs' exceeds the maximum limit of 15 patterns (${globs.length} configured).\nDo not abuse exemptions. If you have this many violations, extract descriptive named constants or use test factories.`);
	for (const rawGlob of globs) {
		const glob = rawGlob.trim().replaceAll(path.win32.sep, path.posix.sep);
		assertNoUniversalWildcard(rawGlob, glob);
		assertNoProtectedProductionRoots(rawGlob, glob.toLowerCase());
	}
}
//#endregion
export { FORBIDDEN_PRODUCTION_ROOTS, MAX_CONSTANTS_EXEMPT_GLOBS, MIN_COVERAGE_REASON_LENGTH, assertCoverageReason, assertNarrowCoverageGlob, filterOutExemptRoots, getExemptRootsForPolicy, normalizeRootPath, validateConstantsExemptGlobs };
