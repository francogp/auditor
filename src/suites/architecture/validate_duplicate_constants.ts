/**
 * scripts/auditors/architecture/validate_duplicate_constants.ts
 *
 * CROSS-MODULE DUPLICATE CONSTANTS AUDITOR (Node.js 26+ Native)
 *
 * Employs TypeScript AST analysis via SharedAstContext to detect duplicate
 * constant declarations across independent modules in src/.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_duplicate_constants.ts
 *   npm run validate:duplicate-constants
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { detectDuplicateConstants } from '../../analyzers/constantAnalyzer.ts';
import { SharedAstContext } from '../../core/astContext.ts';

enableCompileCache();

export type DuplicateConstantsRuleId =
  | 'duplicate-constant-identical'
  | 'duplicate-constant-divergent';

export const DUPLICATE_CONSTANTS_RULES: readonly DuplicateConstantsRuleId[] = [
  'duplicate-constant-identical',
  'duplicate-constant-divergent'
] as const;

export class DuplicateConstantsAuditor extends BaseAuditor<DuplicateConstantsRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    const effectiveRoot = options.projectRoot
      ?? (fs.existsSync(path.resolve(process.cwd(), 'src/logic'))
        ? process.cwd()
        : (fs.existsSync(path.resolve(process.cwd(), '../..', 'src/logic'))
          ? path.resolve(process.cwd(), '../..')
          : process.cwd()));

    super({
      id: 'validate_duplicate_constants',
      name: 'Duplicate Constants Validator',
      description: 'Detecta constantes duplicadas entre módulos usando AST',
      family: 'architecture',
      ruleIds: DUPLICATE_CONSTANTS_RULES,
      packageName: 'Constantes',
      ruleDescriptions: {
        'duplicate-constant-identical': 'Constante idéntica duplicada',
        'duplicate-constant-divergent': 'Constante dispar entre módulos'
      },
      requiresAst: true,
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    this.context.logStep(1, 1, 'Analizando declaraciones de constantes con AST...');

    const relFiles = await this.context.collectFiles(['src'], new Set(['.ts', '.vue']));
    const absFiles = relFiles
      .filter(f => !f.includes('.spec.') && !f.includes('.test.') && !f.includes('.d.ts'))
      .map(f => path.resolve(this.projectRoot, f));

    this.filesScannedCount = absFiles.length;

    const rawViolations = await detectDuplicateConstants(absFiles, astContext);

    for (const v of rawViolations) {
      const isIdentical = v.message.includes('idéntico');
      const ruleId: DuplicateConstantsRuleId = isIdentical
        ? 'duplicate-constant-identical'
        : 'duplicate-constant-divergent';

      this.addViolation({
        ruleId,
        severity: v.severity || 'error',
        file: v.file,
        line: v.line || 1,
        message: v.message,
        context: v.context
      });
    }

    this.context.setMetric('Total Archivos Analizados', absFiles.length);
    this.context.setMetric('Violaciones Encontradas', rawViolations.length);
  }
}

if (process.argv[1] && (
  process.argv[1].endsWith('validate_duplicate_constants.ts') ||
  (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename)
)) {
  await BaseAuditor.runCli(new DuplicateConstantsAuditor());
}
