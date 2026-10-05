/**
 * skills/auditor/references/extensions/validate_overscroll_lock.extension.ts
 *
 * MOBILE VIEWPORT & OVERSCROLL LOCK EXTENSION AUDITOR (Node.js 26+ Native)
 *
 * Extracted from @francogp/auditor core as a host-specific mobile game extension.
 * Enforces mobile viewport lock:
 *   - Verifies that the base stylesheet (e.g. 'src/styles/core/_base.scss') declares
 *     'overscroll-behavior: none !important;' on 'html, body' to prevent accidental
 *     pull-to-refresh and swipe-navigation gestures on mobile canvas/touch screens.
 *
 * Usage in .auditor/audit.config.ts:
 *   import { OverscrollLockAuditor } from '../scripts/auditors/extensions/validate_overscroll_lock.extension.ts';
 *   export default defineAuditConfig({
 *     extensions: [new OverscrollLockAuditor()]
 *   });
 */

import fs from 'node:fs';
import path from 'node:path';
import { BaseAuditor, getAuditConfig } from '@francogp/auditor';

export type OverscrollLockRuleId = 'overscroll-behavior-lock';

export const OVERSCROLL_LOCK_RULES: readonly OverscrollLockRuleId[] = [
  'overscroll-behavior-lock'
] as const;

export class OverscrollLockAuditor extends BaseAuditor<OverscrollLockRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_overscroll_lock',
      name: 'Mobile Overscroll Behavior Lock Validator',
      description: 'Bloqueo de overscroll-behavior en hoja base móvil',
      icon: '📱',
      family: 'architecture',
      ruleIds: OVERSCROLL_LOCK_RULES,
      packageName: 'Móvil',
      configKey: 'styles.baseScssFile',
      ruleDescriptions: {
        'overscroll-behavior-lock': 'Falta overscroll-behavior en hoja base'
      },
      roots: ['src/styles'],
      allowedExtensions: new Set(['.scss', '.css']),
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const targetRelFile = config.styles?.baseScssFile ?? config.styles?.zLayersScssFile;

    if (!targetRelFile) {
      this.markRuleNotApplicable('overscroll-behavior-lock', 'No baseScssFile or zLayersScssFile configured in .auditor/audit.config.ts');
      this.context.logStep(1, 1, 'Omitiendo auditoría de overscroll: no se configuró styles.baseScssFile ni styles.zLayersScssFile.');
      return;
    }

    const absPath = path.resolve(this.projectRoot, targetRelFile);
    if (!fs.existsSync(absPath)) {
      this.recordScanned(targetRelFile);
      this.addViolation({
        ruleId: 'overscroll-behavior-lock',
        severity: 'error',
        file: targetRelFile,
        line: 1,
        message: `El archivo base de estilos '${targetRelFile}' no existe en disco.`,
        context: targetRelFile
      });
      return;
    }

    this.recordScanned(targetRelFile);
    const content = fs.readFileSync(absPath, 'utf-8');
    const hasLock = content.includes('overscroll-behavior: none !important;');
    let line = 1;
    if (!hasLock) {
      const match = content.match(/html\s*,\s*body\s*\{/);
      if (match && match.index !== undefined) {
        line = content.slice(0, match.index).split('\n').length;
      }
    }

    this.assertRule('overscroll-behavior-lock', hasLock, {
      severity: 'error',
      file: targetRelFile,
      line,
      message: `Mandato de bloqueo de sobre-desplazamiento móvil violado: '${targetRelFile}' debe declarar 'overscroll-behavior: none !important;' para prevenir pull-to-refresh y navegación gestual accidental en navegadores móviles.`,
      context: 'html, body { overscroll-behavior: none !important; }'
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new OverscrollLockAuditor());
