/**
 * scripts/auditors/documentation/validate_dox_integrity.ts
 *
 * DOX & AGENTS.md HIERARCHY AND INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces documentation governance and link integrity across all AGENTS.md files:
 *   1. Verifies that every code directory contains an AGENTS.md file.
 *   2. Verifies that child AGENTS.md files are registered in their nearest parent index.
 *   3. Enforces relative links (forbids absolute paths).
 *   4. Verifies target files exist on disk (no broken links).
 *   5. Forbids linking to git-ignored files (.gitignore).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_dox_integrity.ts
 *   npm run validate:dox-integrity
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, getEffectiveIgnoreDirs } from '../../core/auditorBase.ts';
import { loadAuditConfig } from '../../core/auditConfig.ts';
import { checkDoxIntegrity } from '../../analyzers/doxAnalyzer.ts';

enableCompileCache();

export type DoxRuleId =
  | 'dox-missing-agents-md'
  | 'dox-unregistered-child'
  | 'dox-absolute-link'
  | 'dox-broken-link'
  | 'dox-gitignore-target'
  | 'dox-unindexed-file'
  | 'dox-missing-section'
  | 'dox-section-order'
  | 'dox-empty-section';

export const DOX_RULES: readonly DoxRuleId[] = [
  'dox-missing-agents-md',
  'dox-unregistered-child',
  'dox-absolute-link',
  'dox-broken-link',
  'dox-gitignore-target',
  'dox-unindexed-file',
  'dox-missing-section',
  'dox-section-order',
  'dox-empty-section'
] as const;

export class DoxIntegrityAuditor extends BaseAuditor<DoxRuleId> {
private readonly rootDir: string;

  constructor(rootDir?: string) {
    const projectRoot = rootDir || process.cwd();
    super({
      capabilities: { md: true },
      id: 'validate_dox_integrity',
      name: 'DOX & AGENTS.md Integrity Validator',
      description: 'Valida jerarquía, enlaces e integridad de AGENTS.md',
      family: 'documentation',
      packageName: 'DOX',
      icon: '📚',
      ruleIds: DOX_RULES,
      ruleDescriptions: {
        'dox-missing-agents-md': 'Falta AGENTS.md en directorio',
        'dox-unregistered-child': 'AGENTS.md hijo no registrado',
        'dox-absolute-link': 'Enlace con ruta absoluta',
        'dox-broken-link': 'Enlace roto a archivo inexistente',
        'dox-gitignore-target': 'Enlace a ruta ignorada en git',
        'dox-unindexed-file': 'Archivo de código no indexado en DOX',
        'dox-missing-section': 'Sección obligatoria ausente en AGENTS.md',
        'dox-section-order': 'Orden incorrecto de secciones en AGENTS.md',
        'dox-empty-section': 'Sección vacía o con contenido basura'
      },
      coverage: {
        include: ['**/AGENTS.md']
      },
      projectRoot
    });
    this.rootDir = projectRoot;
  }

  public override async runAudit(): Promise<void> {
    await loadAuditConfig(this.rootDir);
    for (const r of DOX_RULES) {
      this.markRuleEvaluated(r);
    }

    const agentsFiles = await this.context.collectFiles(['.'], new Set(['.md']));
    for (const f of agentsFiles) {
      if (path.basename(f) === 'AGENTS.md') {
        this.recordScanned(f);
      }
    }
    if (this.filesScannedCount === 0) {
      this.recordScanned('AGENTS.md');
    }

    const rawViolations = await checkDoxIntegrity(this.rootDir, getEffectiveIgnoreDirs());

    for (const v of rawViolations) {
      const ruleId = (v.ruleId as DoxRuleId) || 'dox-missing-agents-md';

      this.addViolation({
        ruleId,
        severity: v.severity || 'error',
        file: v.file,
        line: v.line || 1,
        message: v.message,
        context: v.context
      });
    }

    this.context.setMetric('Total Violations Found', rawViolations.length);
  }
}

if (process.argv[1] && (
  process.argv[1].endsWith('validate_dox_integrity.ts') ||
  (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename)
)) {
  await BaseAuditor.runCli(new DoxIntegrityAuditor());
}
