import { safeJsonParse, safeReadFileSync, tryOrNull } from "./safeUtils.js";
import { getAuditConfig } from "./auditConfigLoader.js";
import path from "node:path";
import fs from "node:fs";
// src/core/lockedSkills.ts
/**
* src/core/lockedSkills.ts
*
* OFFICIAL LOCKED SKILLS ISOLATION ENGINE
* Discovers, parses, and caches official skills declared in skills-lock.json.
* Validates immutable skill paths across .agents/skills/, skills/, and .skills/.
*/
let lockedSkillsCache = null;
let lockedSkillsCacheRoot = null;
function clearLockedSkillsCache() {
	lockedSkillsCache = null;
	lockedSkillsCacheRoot = null;
}
/**
* Canonical candidate relative locations for skills-lock.json in order of precedence.
*/
const SKILLS_LOCK_CANDIDATE_PATHS = [
	"skills-lock.json",
	".auditor/skills-lock.json",
	".agents/skills-lock.json"
];
function parseLockedSkillsFile(skillsLockPath) {
	const raw = safeReadFileSync(skillsLockPath);
	if (!raw) return [];
	const data = safeJsonParse(raw);
	if (data?.skills && typeof data.skills === "object") return Object.keys(data.skills).map((s) => s.toLowerCase());
	return [];
}
function resolveSkillsLockCandidates(projectRoot) {
	const candidatePaths = [...SKILLS_LOCK_CANDIDATE_PATHS];
	const config = tryOrNull(() => getAuditConfig(projectRoot));
	if (config?.paths?.skillsLockFile && !candidatePaths.includes(config.paths.skillsLockFile)) candidatePaths.unshift(config.paths.skillsLockFile);
	const inheritedLock = "node_modules/@francogp/auditor/skills-lock.json";
	if (fs.existsSync(path.resolve(projectRoot, inheritedLock))) candidatePaths.push(inheritedLock);
	return candidatePaths;
}
function loadLockedSkills(projectRoot = process.cwd()) {
	if (lockedSkillsCache && lockedSkillsCacheRoot === projectRoot) return lockedSkillsCache;
	const locked = /* @__PURE__ */ new Set();
	for (const relPath of resolveSkillsLockCandidates(projectRoot)) for (const skill of parseLockedSkillsFile(path.resolve(projectRoot, relPath))) locked.add(skill);
	lockedSkillsCache = locked;
	lockedSkillsCacheRoot = projectRoot;
	return locked;
}
/**
* Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
* (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
*/
function isLockedSkillPath(filePath, projectRoot = process.cwd()) {
	const locked = loadLockedSkills(projectRoot);
	if (locked.size === 0) return false;
	let curr = path.resolve(projectRoot, filePath);
	const root = path.parse(curr).root;
	while (curr && curr !== root) {
		const parentDir = path.dirname(curr);
		if (parentDir === curr) break;
		const skillName = path.basename(curr);
		const parentName = path.basename(parentDir);
		if (locked.has(skillName)) {
			if (parentName === "skills" || parentName === ".skills") return true;
			const grandParentDir = path.dirname(parentDir);
			if (parentName === "skills" && path.basename(grandParentDir) === ".agents") return true;
		}
		curr = parentDir;
	}
	return false;
}
export { SKILLS_LOCK_CANDIDATE_PATHS, clearLockedSkillsCache, isLockedSkillPath, loadLockedSkills };
