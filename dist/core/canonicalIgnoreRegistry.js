import { normalizePosixPath } from "./reportUtils.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import { loadLockedSkills } from "./lockedSkills.js";
import path from "node:path";
// src/core/canonicalIgnoreRegistry.ts
/**
* packages/auditor/src/core/canonicalIgnoreRegistry.ts
*
* CANONICAL IGNORE & PATH EXEMPTION REGISTRY
* Single Source of Truth for immutable system directories, cache directories,
* scratch workspaces, and dynamic configuration-driven ignore/unignore resolutions.
*
* Rules:
* 1. Hardcoded folder exceptions are strictly restricted to:
*    - node_modules (Node package manager standard)
*    - scratch (ephemeral runtime and audit scratch directory)
*    - Caches, VCS, and build artifacts (.git, dist, coverage, tmp, etc.)
* 2. All other application code roots, documentation roots, and skills roots MUST resolve
*    dynamically from audit.config.ts (config.paths, config.documentation).
*/
/**
* Directories that must ALWAYS be ignored across all tools, runners, and static analyzers
* (compilation, VCS, scratch, test artifacts, runtime volume storage).
* Strictly conforms to the Zero Hardcoded Paths Mandate exception baseline:
* 1. node_modules
* 2. scratch
* 3. VCS and tool cache/build artifacts (.git, dist, coverage, tmp, etc.)
* 4. Locked skills dynamically loaded from skills-lock.json
* 5. Dynamic tool cache paths registered via sub-auditor constructor contracts (cachePaths).
*
* ALL OTHER DIRECTORIES MUST BE CONFIGURED IN audit.config.ts (paths.ignoredDirs, paths.ignoreGlobs).
* HARDCODING APPLICATION, ASSET, OR DOCUMENTATION DIRECTORIES IS CATEGORICALLY PROHIBITED.
*/
const ALWAYS_IGNORE_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	"scratch",
	".git",
	".vscode",
	".github",
	".gemini",
	".auditor",
	"tmp",
	"volumes"
]);
/**
* Canonical binary, media, font, database, and archive extensions that cannot
* be inspected by text, AST, or line-based static analysis suites.
*/
const CANONICAL_BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".ico",
	".bmp",
	".tiff",
	".avif",
	".svg",
	".mp3",
	".ogg",
	".wav",
	".flac",
	".mp4",
	".webm",
	".avi",
	".mov",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".otf",
	".db",
	".sqlite",
	".sqlite3",
	".wasm",
	".zip",
	".tar",
	".gz",
	".tgz"
]);
/**
* Canonical tool cache paths declared by built-in sub-auditors and extensions.
* Initialized with canonical tool caches so standalone functions (isPathIgnored)
* correctly recognize them even before suite instantiation.
*/
const BUILTIN_TOOL_CACHE_PATHS = [
	"dist",
	"dev-dist",
	"build",
	"coverage",
	"test-results",
	".vitest-cache",
	".fallow",
	".oxlintcache",
	".stylelintcache",
	".tsbuildinfo"
];
/**
* Dynamic cache and temporary paths registered by sub-auditors and extensions at runtime.
*/
const dynamicCachePaths = new Set(BUILTIN_TOOL_CACHE_PATHS);
/**
* Registers a dynamic tool cache directory or file declared by a sub-auditor or extension
* (e.g. `.fallow`, `.oxlintcache`).
*/
function registerDynamicCachePath(cachePath) {
	const norm = normalizePosixPath(cachePath);
	const clean = norm.endsWith("/") ? norm.slice(0, -1) : norm;
	if (clean) dynamicCachePaths.add(clean);
}
/**
* Returns all currently registered dynamic tool cache paths.
*/
function getDynamicCachePaths() {
	return dynamicCachePaths;
}
/**
* Clears registered dynamic cache paths (useful in test teardown).
*/
function clearDynamicCachePaths() {
	dynamicCachePaths.clear();
	for (const p of BUILTIN_TOOL_CACHE_PATHS) dynamicCachePaths.add(p);
}
/**
* Canonical ignore directories for application scanners (ALWAYS_IGNORE_DIRS + BUILTIN_TOOL_CACHE_PATHS).
* All additional application-specific ignore directories must be configured via audit.config.ts.
*/
const CANONICAL_IGNORE_DIRS = /* @__PURE__ */ new Set([...ALWAYS_IGNORE_DIRS, ...BUILTIN_TOOL_CACHE_PATHS]);
/**
* Returns the effective set of ignore directories combining canonical defaults,
* dynamically registered tool caches, and audit.config.ts `paths.ignoredDirs`.
*/
function getEffectiveIgnoreDirs(projectRoot = process.cwd()) {
	const custom = getAuditConfig(projectRoot).paths?.ignoredDirs ?? [];
	return /* @__PURE__ */ new Set([
		...ALWAYS_IGNORE_DIRS,
		...dynamicCachePaths,
		...custom
	]);
}
/**
* Returns the effective unignore directories combining:
* 1. `config.paths.unignoreDirs`
* 2. `config.documentation.unignoreDirs`
* 3. Top-level segments derived from `config.documentation.skillsRoots`
* 4. Physical existence of `.agents` or `skills` in projectRoot
*/
function getEffectiveUnignoreDirs(projectRoot = process.cwd()) {
	const config = getAuditConfig(projectRoot);
	const customPaths = config.paths?.unignoreDirs;
	if (customPaths && customPaths.length > 0) return customPaths;
	const customDocs = config.documentation?.unignoreDirs;
	if (customDocs && customDocs.length > 0) return customDocs;
	const derived = /* @__PURE__ */ new Set();
	if (config.documentation?.skillsRoots && config.documentation.skillsRoots.length > 0) for (const r of config.documentation.skillsRoots) {
		const topSegment = normalizePosixPath(path.relative(projectRoot, path.resolve(projectRoot, r))).split("/")[0];
		if (topSegment && topSegment !== ".") derived.add(topSegment);
	}
	return Array.from(derived);
}
/**
* Registry where sub-auditors and host extensions declare their suggested ignore defaults
* to be dynamically collected and injected into newly created or scaffolded audit.config.ts files.
*/
var SuiteIgnoreRegistry = class {
	static requirements = /* @__PURE__ */ new Map();
	static register(req) {
		this.requirements.set(req.suiteId, req);
	}
	static getAll() {
		return Array.from(this.requirements.values());
	}
	static reset() {
		this.requirements.clear();
	}
};
/**
* Returns a deduplicated array of glob patterns representing all active ignore directories
* (each formatted as `${dir}/**`), merged with project-level `paths.ignoreGlobs`,
* `paths.ignoredPatterns`, and optional locked skills from `skills-lock.json`.
*/
function getEffectiveIgnoreGlobs(projectRoot = process.cwd(), options = {}) {
	const config = getAuditConfig(projectRoot);
	const baseDirs = options.baseDirs ?? getEffectiveIgnoreDirs(projectRoot);
	const globs = /* @__PURE__ */ new Set();
	for (const d of baseDirs) globs.add(`${d}/**`);
	if (config.paths?.ignoreGlobs) for (const g of config.paths.ignoreGlobs) globs.add(normalizePosixPath(g));
	if (config.paths?.ignoredPatterns) for (const p of config.paths.ignoredPatterns) globs.add(normalizePosixPath(p));
	if (options.includeLockedSkills) for (const lg of getLockedSkillsIgnoreGlobs(projectRoot)) globs.add(lg);
	if (options.extraGlobs) for (const eg of options.extraGlobs) globs.add(normalizePosixPath(eg));
	return Array.from(globs);
}
/**
* Dynamically resolves ignore globs for official locked skills declared in `skills-lock.json`,
* mapped to roots configured in `config.documentation.skillsRoots`.
*/
function getLockedSkillsIgnoreGlobs(projectRoot = process.cwd()) {
	const locked = loadLockedSkills(projectRoot);
	if (locked.size === 0) return [];
	const skillsRoots = getAuditConfig(projectRoot).documentation?.skillsRoots ?? [];
	const globs = [];
	for (const s of locked) if (skillsRoots.length > 0) for (const root of skillsRoots) {
		const normRoot = normalizePosixPath(root);
		const cleanRoot = normRoot.endsWith("/") ? normRoot.slice(0, -1) : normRoot;
		globs.push(`${cleanRoot}/${s}/**`);
	}
	else globs.push(`**/${s}/**`);
	return globs;
}
export { ALWAYS_IGNORE_DIRS, BUILTIN_TOOL_CACHE_PATHS, CANONICAL_BINARY_EXTENSIONS, CANONICAL_IGNORE_DIRS, SuiteIgnoreRegistry, clearDynamicCachePaths, getDynamicCachePaths, getEffectiveIgnoreDirs, getEffectiveIgnoreGlobs, getEffectiveUnignoreDirs, getLockedSkillsIgnoreGlobs, registerDynamicCachePath };
