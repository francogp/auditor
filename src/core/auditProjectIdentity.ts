/**
 * packages/auditor/src/core/auditProjectIdentity.ts
 *
 * Project identity predicates and framework self-provider detection.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export function isSelfProviderProject(projectRoot: string): boolean {
  const hostPkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(hostPkgPath)) return false;
  try {
    const pkgData = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as { name?: string };
    if (pkgData.name === '@francogp/auditor') {
      const hasPluginJson = fs.existsSync(path.join(projectRoot, 'plugin.json'));
      const hasSkillMd =
        fs.existsSync(path.join(projectRoot, '.agents/skills/auditor/SKILL.md')) ||
        fs.existsSync(path.join(projectRoot, 'skills/auditor/SKILL.md')) ||
        fs.existsSync(path.join(projectRoot, 'skills/auditor-framework/SKILL.md'));
      return hasPluginJson && hasSkillMd;
    }
  } catch {
    // catch-ok: Fallback to false
  }
  return false;
}
