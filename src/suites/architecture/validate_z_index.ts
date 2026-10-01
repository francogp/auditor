/**
 * scripts/auditors/architecture/validate_z_index.ts
 *
 * Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
 *
 * Validates 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables
 * defined in src/styles/_base.scss.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
 *   npm run validate:z-index
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { Z_LAYERS } from './audit_rules.ts';

enableCompileCache();

export type ZIndexRuleId =
  | 'z-index-missing-var'
  | 'z-index-mismatch'
  | 'z-index-read-error';

export const Z_INDEX_RULES: readonly ZIndexRuleId[] = [
  'z-index-missing-var',
  'z-index-mismatch',
  'z-index-read-error'
] as const;

export class ZIndexAuditor extends BaseAuditor<ZIndexRuleId> {
  private readonly scssPath?: string;
  private readonly isExplicit: boolean;

  constructor(scssPath?: string) {
    super({
      id: 'validate_z_index',
      name: 'Z-Index Consistency Validator',
      description: 'Valida paridad entre Z_LAYERS (TS) y variables CSS (SCSS)',
      family: 'architecture',
      ruleIds: Z_INDEX_RULES,
      ruleDescriptions: {
        'z-index-missing-var': 'Z-Index: Falta variable en _base.scss',
        'z-index-mismatch': 'Z-Index: Desincronización TS vs SCSS',
        'z-index-read-error': 'Z-Index: Error al leer estilos base'
      }
    });

    const config = getAuditConfig();
    if (scssPath) {
      this.scssPath = scssPath;
      this.isExplicit = true;
    } else if (config.styles?.zLayersScssFile) {
      this.scssPath = path.resolve(this.projectRoot, config.styles.zLayersScssFile);
      this.isExplicit = true;
    } else {
      this.isExplicit = false;
      const corePath = path.resolve(this.projectRoot, 'src/styles/core/_base.scss');
      const rootPath = path.resolve(this.projectRoot, 'src/styles/_base.scss');
      if (fsSync.existsSync(corePath)) {
        this.scssPath = corePath;
      } else if (fsSync.existsSync(rootPath)) {
        this.scssPath = rootPath;
      } else {
        this.scssPath = undefined;
      }
    }
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig();
    if (!this.isExplicit && config.styles?.zLayersEnabled === false) {
      this.context.logStep(1, 1, 'Z-Layers deshabilitadas explícitamente en audit.config.ts (styles.zLayersEnabled: false). Omitiendo.');
      return;
    }

    if (!this.scssPath) {
      this.addViolation({
        ruleId: 'z-index-read-error',
        severity: 'error',
        file: 'audit.config.ts',
        line: 1,
        message: "Falta configuración de Z-Layers en audit.config.ts: no se encontró archivo SCSS. Defina 'styles.zLayersScssFile' apuntando a su archivo SCSS base, o configure explícitamente 'styles.zLayersEnabled: false' si este proyecto no utiliza capas Z de SCSS.",
        context: 'audit.config.ts'
      });
      return;
    }

    const isFixMode = process.argv.includes('fix') || process.argv.includes('--fix');
    this.context.logStep(1, 1, 'Verificando paridad de variables Z-Index en _base.scss...');

    let scssContent: string;
    try {
      scssContent = await fs.readFile(this.scssPath, 'utf-8');
      this.filesScannedCount++;
    } catch (err: unknown) {
      this.addViolation({
        ruleId: 'z-index-read-error',
        severity: 'error',
        file: this.scssPath,
        line: 1,
        message: `Error leyendo _base.scss: ${(err as Error).message || String(err)}`,
        context: this.scssPath
      });
      return;
    }

    let modified = false;
    let checkedCount = 0;

    for (const [key, value] of Object.entries(Z_LAYERS)) {
      checkedCount++;
      const dashedKey = key.toLowerCase().replace(/_/g, '-');
      const varName = `--z-${dashedKey}`;
      const regex = new RegExp(`${varName}\\s*:\\s*(-?\\d+)\\b`);
      const match = scssContent.match(regex);

      if (!match) {
        if (isFixMode && scssContent.includes(':root {')) {
          scssContent = scssContent.replace(/}\s*$/, `  ${varName}: ${value};\n}\n`);
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'z-index-missing-var',
            severity: 'error',
            file: this.scssPath,
            line: 1,
            message: `Falta variable CSS '${varName}' (debe ser ${value})`,
            context: varName
          });
        }
      } else {
        const parsed = parseInt(match[1]!, 10);
        if (parsed !== value) {
          if (isFixMode) {
            scssContent = scssContent.replace(regex, `${varName}: ${value}`);
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'z-index-mismatch',
              severity: 'error',
              file: this.scssPath,
              line: 1,
              message: `Desincronización en '${varName}': TS=${value}, SCSS=${match[1]}`,
              context: `${varName}: ${match[1]}`
            });
          }
        }
      }
    }

    if (isFixMode && modified) {
      await fs.writeFile(this.scssPath, scssContent, 'utf-8');
    }

    this.context.setMetric('Total Layers Checked', checkedCount);
    this.context.setMetric('Status', modified ? 'Auto-fixed' : 'Synced');
  }
}

if (process.argv[1] && (
  process.argv[1].endsWith('validate_z_index.ts') ||
  (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename)
)) {
  await BaseAuditor.runCli(new ZIndexAuditor());
}
