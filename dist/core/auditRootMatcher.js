import { ALWAYS_IGNORE_DIRS } from "./canonicalIgnoreRegistry.js";
// src/core/auditRootMatcher.ts
/**
* packages/auditor/src/core/auditRootMatcher.ts
*
* Path root matching primitives.
*/
/**
* Helper to check if a normalized path matches any of the given root directories.
*/
function matchesAnyRoot(normalizedPath, roots) {
	if (!normalizedPath || !roots || roots.length === 0) return false;
	const firstSegment = normalizedPath.split("/")[0] ?? "";
	if (ALWAYS_IGNORE_DIRS.has(firstSegment)) return roots.some((root) => {
		const rootFirstSegment = root.replace(/^\/+|\/+$/g, "").toLowerCase().split("/")[0] ?? "";
		return ALWAYS_IGNORE_DIRS.has(rootFirstSegment);
	});
	return roots.some((root) => {
		const cleanRoot = root.replace(/^\/+|\/+$/g, "").toLowerCase();
		return cleanRoot !== "" && (normalizedPath === cleanRoot || normalizedPath.startsWith(cleanRoot + "/") || normalizedPath.includes("/" + cleanRoot + "/"));
	});
}
export { matchesAnyRoot };
