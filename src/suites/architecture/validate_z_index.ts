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
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig, resolveZLayersScssPath, getEffectiveZLayers } from '../../core/auditConfig.ts';
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

export interface ZIndexAuditViolation {
  ruleId: 'z-index-missing-var' | 'z-index-mismatch';
  message: string;
  context: string;
}

export interface ZIndexAuditResult {
  scssContent: string;
  modified: boolean;
  errors: string[];
  violations: ZIndexAuditViolation[];
}

function checkOrFixMissingVar(
  varName: string,
  value: number,
  content: string,
  isFixMode: boolean,
  errors: string[],
  violations: ZIndexAuditViolation[]
): { updatedContent: string; wasModified: boolean } {
  const msg = `Falta variable CSS '${varName}' (debe ser ${value})`;
  errors.push(msg);

  if (isFixMode && content.includes(':root {')) {
    return {
      updatedContent: content.replace(/}\s*$/, `  ${varName}: ${value};\n}\n`),
      wasModified: true
    };
  }

  violations.push({ ruleId: 'z-index-missing-var', message: msg, context: varName });
  return { updatedContent: content, wasModified: false };
}

function checkOrFixMismatchVar(
  varName: string,
  value: number,
  parsedValue: number,
  matchStr: string,
  regex: RegExp,
  content: string,
  isFixMode: boolean,
  errors: string[],
  violations: ZIndexAuditViolation[]
): { updatedContent: string; wasModified: boolean } {
  if (parsedValue === value) {
    return { updatedContent: content, wasModified: false };
  }

  const msg = `Desincronización en '${varName}': TS=${value}, SCSS=${matchStr}`;
  errors.push(msg);

  if (isFixMode) {
    return {
      updatedContent: content.replace(regex, `${varName}: ${value}`),
      wasModified: true
    };
  }

  violations.push({ ruleId: 'z-index-mismatch', message: msg, context: `${varName}: ${matchStr}` });
  return { updatedContent: content, wasModified: false };
}

export function auditZIndexParity(
  scssContent: string,
  isFixMode: boolean,
  layers: Record<string, number> = Z_LAYERS
): ZIndexAuditResult {
  let content = scssContent;
  let modified = false;
  const errors: string[] = [];
  const violations: ZIndexAuditViolation[] = [];

  for (const [key, value] of Object.entries(layers)) {
    const dashedKey = key.toLowerCase().replace(/_/g, '-');
    const varName = `--z-${dashedKey}`;
    const regex = new RegExp(`${varName}\\s*:\\s*(-?\\d+)\\b`);
    const match = content.match(regex);

    if (!match) {
      const res = checkOrFixMissingVar(varName, value, content, isFixMode, errors, violations);
      content = res.updatedContent;
      if (res.wasModified) modified = true;
    } else {
      const parsed = parseInt(match[1]!, 10);
      const res = checkOrFixMismatchVar(varName, value, parsed, match[1]!, regex, content, isFixMode, errors, violations);
      content = res.updatedContent;
      if (res.wasModified) modified = true;
    }
  }

  return { scssContent: content, modified, errors, violations };
}

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
    } else {
      this.scssPath = resolveZLayersScssPath(this.projectRoot);
      this.isExplicit = !!(config.styles?.zLayersScssFile ?? config.styles?.baseScssFile);
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

    const isFixMode = this.isFixModeRequested();
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

    const effectiveLayers = getEffectiveZLayers(this.projectRoot);
    const result = auditZIndexParity(scssContent, isFixMode, effectiveLayers);
    for (const v of result.violations) {
      this.addViolation({
        ruleId: v.ruleId,
        severity: 'error',
        file: this.scssPath,
        line: 1,
        message: v.message,
        context: v.context
      });
    }

    if (isFixMode && result.modified) {
      await fs.writeFile(this.scssPath, result.scssContent, 'utf-8');
    }

    this.context.setMetric('Total Layers Checked', Object.keys(Z_LAYERS).length);
    this.context.setMetric('Status', result.modified ? 'Auto-fixed' : 'Synced');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ZIndexAuditor());
