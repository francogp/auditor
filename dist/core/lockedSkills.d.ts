//#region src/core/lockedSkills.d.ts
/**
 * src/core/lockedSkills.ts
 *
 * OFFICIAL LOCKED SKILLS ISOLATION ENGINE
 * Discovers, parses, and caches official skills declared in skills-lock.json.
 * Validates immutable skill paths across .agents/skills/, skills/, and .skills/.
 */
export declare function clearLockedSkillsCache(): void;
/**
 * Canonical candidate relative locations for skills-lock.json in order of precedence.
 */
export declare const SKILLS_LOCK_CANDIDATE_PATHS: readonly string[];
export declare function loadLockedSkills(projectRoot?: string): ReadonlySet<string>;
/**
 * Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
 * (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
 */
export declare function isLockedSkillPath(filePath: string, projectRoot?: string): boolean;
//#endregion