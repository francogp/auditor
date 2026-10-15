/**
 * scripts/auditors/architecture/validate_z_index.ts
 *
 * Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
 *
 * Enforces unified Z-Index design system governance:
 *   1. 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables in _base.scss.
 *   2. Detection of hardcoded numeric z-index literals with automated CSS variable autofix.
 *   3. Prohibition of isolated Z-Index constants declared outside canonical Z_LAYERS.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
 *   npm run validate:z-index
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import {
  getAuditConfig,
  resolveZLayersScssPath,
  getEffectiveZLayers,
  AUDIT_CONFIG_FILE,
  Z_LAYERS,
  isExemptFile,
  isTestPath
} from '../../core/auditConfig.ts';
import { resolveZLayer } from '../../analyzers/zIndexRules.ts';
import { normalizePosixPath } from '../../core/safePath.ts';

enableCompileCache();

export const Z_INDEX_RULES = [
  'z-index-missing-var',
  'z-index-mismatch',
  'z-index-read-error',
  'z-index-hardcoded-literal',
  'z-index-isolated-constant'
] as const;
export type ZIndexRuleId = (typeof Z_INDEX_RULES)[number];

export interface ZIndexAuditViolation {
  ruleId: ZIndexRuleId;
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
      updatedContent: content.replace(/\}\s*$/, `  ${varName}: ${value};\n}\n`),
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
      const res = checkOrFixMismatchVar(
        varName,
        value,
        parsed,
        match[1]!,
        regex,
        content,
        isFixMode,
        errors,
        violations
      );
      content = res.updatedContent;
      if (res.wasModified) modified = true;
    }
  }

  return { scssContent: content, modified, errors, violations };
}

export const HARDCODED_Z_INDEX_REGEX = /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi;
export const ISOLATED_Z_INDEX_CONST_REGEX =
  /const\s+(\w*Z_INDEX\w*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi;

export { fixZIndexLiteral as fixZIndexLiteralMatch } from '../../analyzers/zIndexRules.ts';

export class ZIndexAuditor extends FileScanAuditor<ZIndexRuleId> {
  private readonly scssPath?: string;
  private readonly isExplicit: boolean;

  constructor(scssPath?: string, roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? (scssPath ? [path.dirname(scssPath)] : config.paths.srcRoots);

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        Z_INDEX_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['z-index-missing-var', 'z-index-mismatch', 'z-index-hardcoded-literal']
      ),
      fixableRuleIds: ['z-index-missing-var', 'z-index-mismatch', 'z-index-hardcoded-literal'],
      id: 'validate_z_index',
      name: 'Z-Index Consistency Validator',
      description: 'Valida paridad entre Z_LAYERS y variables CSS (SCSS)',
      family: 'architecture',
      packageName: 'Z-Index',
      configKey: 'styles.zLayersEnabled',
      defaultConfig: { enabled: true, zLayersEnabled: true },
      criticalConfig: {},
      icon: '🥞',
      roots: effectiveRoots,
      allowedExtensions: new Set(['.vue', '.scss', '.css', '.ts', '.tsx']),
      ruleIds: Z_INDEX_RULES,
      ruleDescriptions: {
        'z-index-missing-var': 'Falta variable en _base.scss',
        'z-index-mismatch': 'Desincronización TS vs SCSS',
        'z-index-read-error': 'Error al leer estilos base',
        'z-index-hardcoded-literal': 'Valor hardcodeado sin variable',
        'z-index-isolated-constant': 'Constante aislada fuera de Z_LAYERS'
      },
      ruleRemediations: {
        'z-index-missing-var':
          'Guía de diagnóstico y remediación para z-index-missing-var. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'z-index-mismatch':
          'Guía de diagnóstico y remediación para z-index-mismatch. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'z-index-read-error':
          'Guía de diagnóstico y remediación para z-index-read-error. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'z-index-hardcoded-literal':
          'Guía de diagnóstico y remediación para z-index-hardcoded-literal. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'z-index-isolated-constant':
          'Guía de diagnóstico y remediación para z-index-isolated-constant. Revisa la incidencia detectada y ajusta el código correspondiente.'
      },
      projectRoot
    });

    if (scssPath) {
      this.scssPath = scssPath;
      this.isExplicit = true;
    } else {
      this.scssPath = resolveZLayersScssPath(this.projectRoot);
      this.isExplicit = !!(config.styles?.zLayersScssFile ?? config.styles?.baseScssFile);
    }

    // 1. Declaración canónica de sub-auditor para literales numéricos hardcodeados
    this.declareFileSubAuditor('z-index-hardcoded-literal', (doc) => {
      const isTest = isTestPath(doc.relPath);
      const isExempt = isExemptFile(doc.relPath);
      if (isTest || isExempt) return;

      HARDCODED_Z_INDEX_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HARDCODED_Z_INDEX_REGEX.exec(doc.rawContent)) !== null) {
        if (doc.isInsideComment(m.index)) continue;
        const pos = doc.getLineAndColumn(m.index);
        if (doc.hasEscapeHatch(pos.line, 'z-index-hardcoded-literal')) continue;

        const numMatch = m[0].match(/-?\d+/);
        const val = numMatch ? parseInt(numMatch[0], 10) : 0;
        const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(val);

        let msg: string;
        if (exactKey && cssVarExpr) {
          msg = `Z-Index hardcodeado detectado: '${m[0]}'. Corresponde a Z_LAYERS.${exactKey}. Usa '${cssVarExpr}'.`;
        } else if (nearestKey && cssVarExpr) {
          msg = `Z-Index relativo detectado: '${m[0]}'. Cerca de Z_LAYERS.${nearestKey}. Usa '${cssVarExpr}'.`;
        } else {
          msg = `Z-Index hardcodeado fuera de estándar: '${m[0]}'. Registra la capa en Z_LAYERS o usa una existente.`;
        }

        this.addViolation({
          ruleId: 'z-index-hardcoded-literal',
          severity: 'error',
          filePath: doc.relPath,
          line: pos.line,
          column: pos.column,
          message: msg,
          context: m[0],
          fixable: false
        });
      }
    });

    // 2. Declaración canónica de sub-auditor para constantes aisladas fuera de Z_LAYERS
    this.declareFileSubAuditor('z-index-isolated-constant', (doc) => {
      const norm = normalizePosixPath(doc.relPath).toLowerCase();
      const isTest = isTestPath(doc.relPath);
      const isExempt = isExemptFile(doc.relPath);
      if (isTest || isExempt) return;

      if (norm.endsWith('.ts') || norm.endsWith('.tsx') || norm.endsWith('.vue')) {
        const auditConfig = getAuditConfig(this.projectRoot);
        const zFile = auditConfig.styles?.zLayersTsFile ?? auditConfig.domain?.zLayersFile;
        const isZLayersDeclFile =
          zFile && norm.includes(zFile.replace(/^\/+|\/+$/g, '').toLowerCase());

        if (!isZLayersDeclFile && !norm.includes('node_modules')) {
          ISOLATED_Z_INDEX_CONST_REGEX.lastIndex = 0;
          let cMatch: RegExpExecArray | null;
          while ((cMatch = ISOLATED_Z_INDEX_CONST_REGEX.exec(doc.rawContent)) !== null) {
            if (doc.isInsideComment(cMatch.index)) continue;
            const pos = doc.getLineAndColumn(cMatch.index);
            if (doc.hasEscapeHatch(pos.line, 'z-index-isolated-constant')) continue;

            this.addViolation({
              ruleId: 'z-index-isolated-constant',
              severity: 'error',
              filePath: doc.relPath,
              line: pos.line,
              column: pos.column,
              message: `Declaración de constante de Z-Index aislada detectada: '${cMatch[0]}'. Está PROHIBIDO declarar constantes de Z-Index fuera de Z_LAYERS. Registra la capa en Z_LAYERS o consume 'Z_LAYERS.<CAPA>'.`,
              context: cMatch[0],
              fixable: false
            });
          }
        }
      }
    });
  }

  public override async runAudit(): Promise<void> {
    if (!this.isExplicit && this.isSuiteGatingDisabled('Z-Layers desactivado en config')) {
      return;
    }

    // Si el proyecto explícitamente no tiene SCSS configurado
    if (!this.scssPath) {
      this.runSubAuditorSync('z-index-read-error', () => {
        this.addViolation({
          ruleId: 'z-index-read-error',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message:
            "Falta configuración de Z-Layers en audit.config.ts: no se encontró archivo SCSS. Defina 'styles.zLayersScssFile' apuntando a su archivo SCSS base, o configure explícitamente 'styles.zLayersEnabled: false' si este proyecto no utiliza capas Z de SCSS.",
          context: AUDIT_CONFIG_FILE
        });
      });
      for (const r of [
        'z-index-missing-var',
        'z-index-mismatch',
        'z-index-hardcoded-literal',
        'z-index-isolated-constant'
      ] as const) {
        this.runSubAuditorSync(r, () => {
          this.markRuleNotApplicable(r, 'Z-Layers no configurado en proyecto');
        });
      }
      return;
    }

    const relTarget = path
      .relative(this.projectRoot, this.scssPath)
      .split(path.sep)
      .join(path.posix.sep);
    const rootsCoverage = deriveCoverageFromRoots(this.roots, this.allowedExtensions);
    this.redeclareCoverage({
      include: Array.from(new Set([relTarget, ...rootsCoverage.include])),
      source: 'runtime'
    });

    const isFixMode = this.isFixModeRequested();

    let scssContent: string | null = null;
    let readErr: unknown = null;
    try {
      scssContent = await fs.readFile(this.scssPath!, 'utf-8');
      this.recordScanned(this.scssPath!);
    } catch (err: unknown) {
      readErr = err;
    }

    this.runSubAuditorSync('z-index-read-error', () => {
      if (readErr) {
        this.addViolation({
          ruleId: 'z-index-read-error',
          severity: 'error',
          file: this.scssPath!,
          line: 1,
          message: `Error leyendo _base.scss: ${readErr instanceof Error ? readErr.message : typeof readErr === 'string' ? readErr : JSON.stringify(readErr)}`,
          context: this.scssPath!
        });
      }
    });

    if (scssContent !== null) {
      const effectiveLayers = getEffectiveZLayers(this.projectRoot);
      const result = auditZIndexParity(scssContent, isFixMode, effectiveLayers);

      this.runSubAuditorSync('z-index-missing-var', () => {
        const missingVars = result.violations.filter((v) => v.ruleId === 'z-index-missing-var');
        for (const v of missingVars) {
          this.addViolation({
            ruleId: 'z-index-missing-var',
            severity: 'error',
            file: this.scssPath!,
            line: 1,
            message: v.message,
            context: v.context,
            fixable: true
          });
        }
      });

      this.runSubAuditorSync('z-index-mismatch', () => {
        const mismatches = result.violations.filter((v) => v.ruleId === 'z-index-mismatch');
        for (const v of mismatches) {
          this.addViolation({
            ruleId: 'z-index-mismatch',
            severity: 'error',
            file: this.scssPath!,
            line: 1,
            message: v.message,
            context: v.context,
            fixable: true
          });
        }
      });

      if (isFixMode && result.modified) {
        await fs.writeFile(this.scssPath!, result.scssContent, 'utf-8');
      }

      this.context.setMetric('Total Layers Checked', Object.keys(Z_LAYERS).length);
      this.context.setMetric('Status', result.modified ? 'Auto-fixed' : 'Synced');
    } else {
      this.runSubAuditorSync('z-index-missing-var', () => {
        this.markRuleNotApplicable('z-index-missing-var', 'Archivo SCSS no legible');
      });
      this.runSubAuditorSync('z-index-mismatch', () => {
        this.markRuleNotApplicable('z-index-mismatch', 'Archivo SCSS no legible');
      });
    }

    // Escanear los archivos de código y estilos mediante las sub-herramientas declaradas
    await super.runAudit();
  }
}

// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ZIndexAuditor());
