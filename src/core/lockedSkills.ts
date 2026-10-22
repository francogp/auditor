/**
 * src/core/lockedSkills.ts
 *
 * OFFICIAL LOCKED SKILLS ISOLATION ENGINE
 * Discovers, parses, and caches official skills declared in skills-lock.json.
 * Validates immutable skill paths across .agents/skills/, skills/, and .skills/.
 */

import nodeFs from 'node:fs';
import path from 'node:path';
import { getAuditConfig } from './auditConfig.ts';
import { safeReadFileSync, safeJsonParse, tryOrNull } from './safeUtils.ts';

let lockedSkillsCache: Set<string> | null = null;
let lockedSkillsCacheRoot: string | null = null;

export function clearLockedSkillsCache(): void {
  lockedSkillsCache = null;
  lockedSkillsCacheRoot = null;
}

/**
 * Canonical candidate relative locations for skills-lock.json in order of precedence.
 */
export const SKILLS_LOCK_CANDIDATE_PATHS: readonly string[] = [
  'skills-lock.json',
  '.auditor/skills-lock.json',
  '.agents/skills-lock.json'
];

function parseLockedSkillsFile(skillsLockPath: string): string[] {
  const raw = safeReadFileSync(skillsLockPath);
  if (!raw) return [];
  const data = safeJsonParse<{ skills?: Record<string, unknown> }>(raw);
  if (data?.skills && typeof data.skills === 'object') {
    return Object.keys(data.skills).map((s) => s.toLowerCase()); // no-domain: Skill name case-insensitive key
  }
  return [];
}

function resolveSkillsLockCandidates(projectRoot: string): string[] {
  const candidatePaths = [...SKILLS_LOCK_CANDIDATE_PATHS];
  const config = tryOrNull(() => getAuditConfig(projectRoot));
  if (config?.paths?.skillsLockFile && !candidatePaths.includes(config.paths.skillsLockFile)) {
    candidatePaths.unshift(config.paths.skillsLockFile);
  }
  const inheritedLock = 'node_modules/@francogp/auditor/skills-lock.json';
  if (nodeFs.existsSync(path.resolve(projectRoot, inheritedLock))) {
    candidatePaths.push(inheritedLock);
  }
  return candidatePaths;
}

export function loadLockedSkills(projectRoot = process.cwd()): ReadonlySet<string> {
  if (lockedSkillsCache && lockedSkillsCacheRoot === projectRoot) {
    return lockedSkillsCache;
  }
  const locked = new Set<string>();
  for (const relPath of resolveSkillsLockCandidates(projectRoot)) {
    for (const skill of parseLockedSkillsFile(path.resolve(projectRoot, relPath))) {
      locked.add(skill);
    }
  }
  lockedSkillsCache = locked;
  lockedSkillsCacheRoot = projectRoot;
  return locked;
}

/**
 * Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
 * (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
 */
export function isLockedSkillPath(filePath: string, projectRoot = process.cwd()): boolean {
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
      if (parentName === 'skills' || parentName === '.skills') {
        return true;
      }
      const grandParentDir = path.dirname(parentDir);
      if (parentName === 'skills' && path.basename(grandParentDir) === '.agents') {
        return true;
      }
    }
    curr = parentDir;
  }
  return false;
}
