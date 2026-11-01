import { normalizePosixPath } from "./reportUtils.js";
import { stripGlobSuffix } from "./safePath.js";
import { getEffectiveIgnoreGlobs } from "./canonicalIgnoreRegistry.js";
import { isPatternContainedInGlobs } from "./globContainment.js";
import { enableCompileCache } from "node:module";
// src/core/satelliteGlobMatcher.ts
/**
* src/core/satelliteGlobMatcher.ts
*
* Satellite configuration sovereignty validation and allowed excludes resolution.
* Verifies that path exclusions in satellite config files (.fallowrc.json, .stylelintrc.json, etc.)
* are legitimately declared in the central SSoT audit configuration.
*/
enableCompileCache();
function addNormalizedPaths(globs, target) {
	if (!globs) return;
	for (let i = 0; i < globs.length; i++) target.add(normalizePosixPath(globs[i]));
}
/**
* Resolves the canonical set of allowed path exemptions and ignore globs from SSoT config.
* Encapsulates all canonical root categories, data directories, test roots, demo directories,
* and global ignore globs for satellite configuration sovereignty validators.
*/
function getAllowedSatellitePathExcludes(auditConfig, projectRoot) {
	const result = /* @__PURE__ */ new Set();
	addNormalizedPaths(getEffectiveIgnoreGlobs(projectRoot), result);
	const p = auditConfig.paths;
	if (p) {
		addNormalizedPaths(p.ignoreGlobs, result);
		addNormalizedPaths(p.dataRoots, result);
		addNormalizedPaths(p.demoRoots, result);
		addNormalizedPaths(p.testRoots, result);
		addNormalizedPaths(p.cliRoots, result);
		addNormalizedPaths(p.integrationRoots, result);
		addNormalizedPaths(p.e2eRoots, result);
	}
	return result;
}
function resolveMatcherContext(contextOrAllowed, effectiveGlobsOrHandler) {
	if ("allowedGlobs" in contextOrAllowed) return contextOrAllowed;
	return {
		allowedGlobs: contextOrAllowed,
		effectiveGlobs: Array.isArray(effectiveGlobsOrHandler) ? effectiveGlobsOrHandler : []
	};
}
function isCandidateEntryAllowed(entry, context) {
	if (isPatternContainedInGlobs(entry, context)) return true;
	if (entry.startsWith("!")) {
		const clean = entry.slice(1);
		return isPatternContainedInGlobs(clean, context);
	}
	return false;
}
/**
* Validates a list of candidate path/glob entries from a satellite configuration file against
* allowed exemptions and effective ignore globs. Invokes onUndeclared for each entry not covered.
*/
function validateSatelliteUndeclaredEntries(entries, contextOrAllowed, effectiveGlobsOrHandler, maybeHandler) {
	const context = resolveMatcherContext(contextOrAllowed, effectiveGlobsOrHandler);
	const onUndeclared = typeof effectiveGlobsOrHandler === "function" ? effectiveGlobsOrHandler : maybeHandler;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (typeof entry !== "string" || entry.length === 0) continue;
		if (!isCandidateEntryAllowed(entry, context)) onUndeclared(entry, i);
	}
}
export { getAllowedSatellitePathExcludes, isPatternContainedInGlobs, stripGlobSuffix, validateSatelliteUndeclaredEntries };
