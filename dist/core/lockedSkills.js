import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import { toPosixRelative } from "./auditCoverage.js";
import path from "node:path";
import fs from "node:fs";
//#region src/core/lockedSkills.ts
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
	try {
		if (!fs.existsSync(skillsLockPath)) return [];
		const raw = fs.readFileSync(skillsLockPath, "utf-8");
		const data = JSON.parse(raw);
		if (data?.skills && typeof data.skills === "object") return Object.keys(data.skills).map((s) => s.toLowerCase());
	} catch {}
	return [];
}
function resolveSkillsLockCandidates(projectRoot) {
	const candidatePaths = [...SKILLS_LOCK_CANDIDATE_PATHS];
	try {
		const config = getAuditConfig(projectRoot);
		if (config?.paths?.skillsLockFile && !candidatePaths.includes(config.paths.skillsLockFile)) candidatePaths.unshift(config.paths.skillsLockFile);
	} catch {}
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
	const segments = toPosixRelative(projectRoot, filePath).toLowerCase().split("/").filter(Boolean);
	for (let i = 0; i < segments.length - 1; i++) {
		const parent = segments[i];
		const candidate = segments[i + 1];
		if ((parent === "skills" || parent === ".skills") && candidate && locked.has(candidate)) return true;
		if (parent === ".agents" && candidate === "skills" && i + 2 < segments.length) {
			const skillName = segments[i + 2];
			if (skillName && locked.has(skillName)) return true;
		}
	}
	return false;
}
//#endregion
export { SKILLS_LOCK_CANDIDATE_PATHS, clearLockedSkillsCache, isLockedSkillPath, loadLockedSkills };
