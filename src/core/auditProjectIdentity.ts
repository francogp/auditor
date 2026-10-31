/**
 * packages/auditor/src/core/auditProjectIdentity.ts
 *
 * Project identity predicates and framework self-provider detection.
 */

import fs from 'node:fs';
import path from 'node:path';

import { safeReadFileSync, safeJsonParse } from './safeUtils.ts';

/**
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export function isSelfProviderProject(projectRoot: string): boolean {
  const hostPkgPath = path.join(projectRoot, 'package.json');
  const content = safeReadFileSync(hostPkgPath);
  if (!content) return false;

  const pkgData = safeJsonParse<{ name?: string }>(content);
  if (pkgData?.name === '@francogp/auditor') {
    const hasPluginJson = fs.existsSync(path.join(projectRoot, 'plugin.json'));
    const hasSkillMd =
      fs.existsSync(path.join(projectRoot, '.agents/skills/auditor/SKILL.md')) ||
      fs.existsSync(path.join(projectRoot, 'skills/auditor/SKILL.md')) ||
      fs.existsSync(path.join(projectRoot, 'skills/auditor-framework/SKILL.md'));
    return hasPluginJson && hasSkillMd;
  }
  return false;
}
