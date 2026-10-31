/**
 * src/core/lockedSkills.ts
 *
 * OFFICIAL LOCKED SKILLS ISOLATION ENGINE
 * Discovers, parses, and caches official skills declared in skills-lock.json.
 * Validates immutable skill paths across .agents/skills/, skills/, and .skills/.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { getAuditConfig } from './auditConfigLoader.ts';
import { normalizePosixPath } from './reportUtils.ts';
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

/**
 * Loads the set of skill names owned and distributed by `@francogp/auditor` inside
 * `node_modules/@francogp/auditor` (both locked upstream skills in its `skills-lock.json`
 * and built-in auditor skills in `node_modules/@francogp/auditor/.agents/skills/`).
 */
export function loadAuditorOwnedSkills(projectRoot = process.cwd()): ReadonlySet<string> {
  const owned = new Set<string>();
  const auditorLockPath = path.resolve(
    projectRoot,
    'node_modules/@francogp/auditor/skills-lock.json'
  );
  if (nodeFs.existsSync(auditorLockPath)) {
    for (const skill of parseLockedSkillsFile(auditorLockPath)) {
      owned.add(skill);
    }
  }
  const auditorSkillsDir = path.resolve(
    projectRoot,
    'node_modules/@francogp/auditor/.agents/skills'
  );
  if (nodeFs.existsSync(auditorSkillsDir)) {
    const entries = tryOrNull(() => nodeFs.readdirSync(auditorSkillsDir, { withFileTypes: true }));
    for (const entry of entries ?? []) {
      if (entry.isDirectory()) {
        owned.add(entry.name.toLowerCase());
      }
    }
  }
  return owned;
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

  let curr = normalizePosixPath(filePath, projectRoot);

  while (curr && curr !== '.' && curr !== '/') {
    const parentDir = path.posix.dirname(curr);
    if (parentDir === curr) break;
    const skillName = path.posix.basename(curr);
    const parentName = path.posix.basename(parentDir);
    if (locked.has(skillName)) {
      if (parentName === 'skills' || parentName === '.skills') {
        return true;
      }
      const grandParentDir = path.posix.dirname(parentDir);
      if (parentName === 'skills' && path.posix.basename(grandParentDir) === '.agents') {
        return true;
      }
    }
    curr = parentDir;
  }
  return false;
}
