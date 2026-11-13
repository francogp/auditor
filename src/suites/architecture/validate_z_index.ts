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

import { writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { resolveZLayer, fixZIndexLiteral } from '../../analyzers/zIndexRules.ts';
import {
  AuditedDocument,
  type DocumentReplacement,
  FileScanAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions,
  getAuditConfig,
  resolveZLayersScssPath,
  getEffectiveZLayers,
  AUDIT_CONFIG_FILE,
  Z_LAYERS,
  isExemptFile,
  isTestPath,
  type RuleFixContext,
  deriveCoverageFromRoots,
  normalizePosixPath
} from '../../core/auditorBase.ts';

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
  const msg = `Missing CSS variable '${varName}' (must be ${value})`;
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

  const msg = `Desynchronization in '${varName}': TS=${value}, SCSS=${matchStr}`;
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
export const VUE_TEMPLATE_Z_INDEX_ATTR_REGEX =
  /(?<=\s)(?::|v-bind:)?(?:z-index|zIndex)\s*=\s*["']\s*(-?\d+)\s*["']/g;
export const ISOLATED_Z_INDEX_CONST_REGEX =
  /const\s+(\w*Z_INDEX\w*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi;

export { fixZIndexLiteral as fixZIndexLiteralMatch } from '../../analyzers/zIndexRules.ts';

export interface ZIndexAuditorOptions extends FileScanRootsOptions {
  readonly scssPath?: string;
}

export async function fixZIndexVariables(
  context: RuleFixContext<'z-index-missing-var' | 'z-index-mismatch'>
): Promise<boolean> {
  const scssPath = resolveZLayersScssPath(context.projectRoot);
  if (!scssPath) return false;
  try {
    const scssContent = await fs.readFile(scssPath, 'utf-8');
    const effectiveLayers = getEffectiveZLayers(context.projectRoot);
    const result = auditZIndexParity(scssContent, true, effectiveLayers);
    if (result.modified) {
      await fs.writeFile(scssPath, result.scssContent, 'utf-8');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function formatHardcodedZIndexMessage(
  rawMatch: string,
  exactKey: string | undefined,
  nearestKey: string | undefined,
  cssVarExpr: string | undefined
): string {
  if (exactKey && cssVarExpr) {
    return `Hardcoded Z-Index detected: '${rawMatch}'. Corresponds to Z_LAYERS.${exactKey}. Use '${cssVarExpr}'.`;
  }
  if (nearestKey && cssVarExpr) {
    return `Relative Z-Index detected: '${rawMatch}'. Near Z_LAYERS.${nearestKey}. Use '${cssVarExpr}'.`;
  }
  return `Non-standard hardcoded Z-Index: '${rawMatch}'. Register the layer in Z_LAYERS or use an existing one.`;
}

function formatVueZIndexPropMessage(
  rawMatch: string,
  exactKey: string | undefined,
  nearestKey: string | undefined
): string {
  if (exactKey) {
    return `Hardcoded Vue Z-Index prop detected: '${rawMatch}'. Corresponds to Z_LAYERS.${exactKey}. Bind ':z-index="Z_LAYERS.${exactKey}"' or modal stack zIndex.`;
  }
  if (nearestKey) {
    return `Hardcoded Vue Z-Index prop detected: '${rawMatch}'. Near Z_LAYERS.${nearestKey}. Register a named layer in Z_LAYERS or use modal stack zIndexOffset.`;
  }
  return `Hardcoded Vue Z-Index prop detected: '${rawMatch}'. Register the layer in Z_LAYERS or consume modal stack zIndex.`;
}

export class ZIndexAuditor extends FileScanAuditor<ZIndexRuleId> {
  private readonly scssPath?: string;
  private readonly isExplicit: boolean;

  public constructor(options: ZIndexAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) =>
      options.scssPath ? [path.dirname(options.scssPath)] : config.paths.srcRoots
    );
    const config = getAuditConfig(effectiveRoot);

    super({
      ruleFixers: {
        'z-index-missing-var': fixZIndexVariables,
        'z-index-mismatch': fixZIndexVariables
      },
      fixableRuleIds: ['z-index-hardcoded-literal'],
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(Z_INDEX_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_z_index',
      name: 'Z-Index Consistency Validator',
      description: 'Validates parity between Z_LAYERS and CSS variables (SCSS)',
      family: 'architecture',
      packageName: 'Z-Index',
      configKey: 'styles.zLayersEnabled',
      defaultConfig: { enabled: true, zLayersEnabled: true },
      criticalConfig: {},
      icon: '🥞',
      roots: targetRoots,
      allowedExtensions: new Set(['.vue', '.scss', '.css', '.ts', '.tsx']),
      ruleIds: Z_INDEX_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(Z_INDEX_RULES, 'hygiene'),
      ruleDescriptions: {
        'z-index-missing-var': 'Missing variable in _base.scss',
        'z-index-mismatch': 'TS vs SCSS desynchronization',
        'z-index-read-error': 'Error reading base styles',
        'z-index-hardcoded-literal': 'Hardcoded value without variable',
        'z-index-isolated-constant': 'Isolated constant outside Z_LAYERS'
      },
      ruleRemediations: {
        'z-index-missing-var':
          '📖 REMEDIATION GUIDE: z-index-missing-var\n' +
          '1. Root Cause: A stacking layer was declared in TypeScript (`Z_LAYERS` in `src/types/zLayers.ts` or in `audit.config.ts`), but lacks its matching `--z-<layer>` CSS custom property in the base styles file (`src/styles/_base.scss`).\n' +
          '2. Diagnosis: Compare `Z_LAYERS` keys against `:root` `--z-*` custom properties declared in `_base.scss`.\n' +
          '3. Canonical Solution: Add the corresponding `--z-<layer>` CSS custom property inside `:root` in `_base.scss` matching the numeric value in TypeScript, or run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - In TS: `Z_LAYERS = { DROPDOWN: 7000 }`\n' +
          '   - In SCSS (`:root`): `--z-dropdown: 7000;`',
        'z-index-mismatch':
          '📖 REMEDIATION GUIDE: z-index-mismatch\n' +
          '1. Root Cause: Numerical divergence exists between the z-index value defined in TypeScript (`Z_LAYERS`) and the value in the CSS custom property (`--z-*`) for the same stacking layer.\n' +
          '2. Diagnosis: Review the error message indicating which layer and values diverge (e.g., TS=11000 vs SCSS=10000).\n' +
          '3. Canonical Solution: Unify both values by updating the `--z-*` property in `_base.scss` to match the canonical TypeScript constant.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'z-index-read-error':
          '📖 REMEDIATION GUIDE: z-index-read-error\n' +
          '1. Root Cause: The base styles file specified in `config.styles.baseScssFile` or `config.styles.zLayersScssFile` was not found on disk or has syntax errors.\n' +
          '2. Diagnosis: Verify the physical path configured in `.auditor/audit.config.ts` exists and is readable.\n' +
          '3. Canonical Solution: Correct the path in `audit.config.ts` or fix SCSS syntax errors in the base stylesheet.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Verify `styles.baseScssFile` in `.auditor/audit.config.ts`.',
        'z-index-hardcoded-literal':
          '📖 REMEDIATION GUIDE: z-index-hardcoded-literal\n' +
          '1. Root Cause: A raw numeric literal was assigned to z-index (e.g. `z-index: 9999`, `zIndex: 100`, or `:z-index="13000"`) instead of using canonical `Z_LAYERS` tokens or `--z-*` CSS custom properties. Hardcoded values trigger specificity wars and modal z-fighting.\n' +
          '2. Diagnosis: Look for numeric literals in CSS/SCSS `z-index` properties, JS inline styles, or Vue template `:z-index` props.\n' +
          '3. Canonical Solution:\n' +
          '   a) In CSS/SCSS: replace the number with official custom properties: `z-index: var(--z-modal);`.\n' +
          '   b) In TypeScript/Vue props: bind canonical layers (`Z_LAYERS.MODAL`) or modal stack `zIndex` / `zIndexOffset`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: `.tooltip { z-index: 15000; }`\n' +
          '   ✅ Correct:   `.tooltip { z-index: var(--z-tooltip); }`',
        'z-index-isolated-constant':
          '📖 REMEDIATION GUIDE: z-index-isolated-constant\n' +
          '1. Root Cause: An isolated numeric z-index constant was defined outside the unified `Z_LAYERS` catalog (e.g. `const MODAL_Z = 5000` in a local file).\n' +
          '2. Diagnosis: Locate the constant declared in the reported file.\n' +
          '3. Canonical Solution: Delete the isolated constant and import the canonical value from `Z_LAYERS` (`src/types/zLayers.ts`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   `import { Z_LAYERS } from "@/types/zLayers";`'
      },
      projectRoot: effectiveRoot
    });

    if (options.scssPath) {
      this.scssPath = options.scssPath;
      this.isExplicit = true;
    } else {
      this.scssPath = resolveZLayersScssPath(this.projectRoot);
      this.isExplicit = !!(config.styles?.zLayersScssFile ?? config.styles?.baseScssFile);
    }

    // 1. Canonical sub-auditor declaration for hardcoded numeric literals
    this.declareFileSubAuditor('z-index-hardcoded-literal', (doc) => {
      this.auditDocumentHardcodedZIndex(doc);
    });

    // 2. Canonical sub-auditor declaration for isolated constants outside Z_LAYERS
    this.declareFileSubAuditor('z-index-isolated-constant', (doc) => {
      this.auditDocumentIsolatedZIndexConstants(doc);
    });
  }

  private auditDocumentHardcodedZIndex(doc: AuditedDocument): void {
    if (isTestPath(doc.relPath) || isExemptFile(doc.relPath)) return;
    const effectiveLayers = getEffectiveZLayers(this.projectRoot);
    const replacements = this.scanCssAndJsHardcodedLiterals(doc, effectiveLayers);
    this.scanVueTemplateHardcodedProps(doc, effectiveLayers);

    if (replacements.length === 0) return;
    let updated = doc.rawContent;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i]!;
      updated = updated.slice(0, r.start) + r.newText + updated.slice(r.end);
    }
    writeFileSync(doc.filePath, updated, 'utf-8');
  }

  private scanCssAndJsHardcodedLiterals(
    doc: AuditedDocument,
    effectiveLayers: Readonly<Record<string, number>>
  ): DocumentReplacement[] {
    HARDCODED_Z_INDEX_REGEX.lastIndex = 0;
    const replacements: DocumentReplacement[] = [];
    let m: RegExpExecArray | null;

    while ((m = HARDCODED_Z_INDEX_REGEX.exec(doc.rawContent)) !== null) {
      if (doc.isInsideComment(m.index)) continue;
      const numMatch = m[0].match(/-?\d+/);
      const val = numMatch ? parseInt(numMatch[0], 10) : 0;
      const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(val, effectiveLayers);
      const canFix = Boolean(cssVarExpr);

      if (this.isFixActive() && canFix) {
        const replaced = fixZIndexLiteral(m[0], effectiveLayers);
        if (replaced !== m[0]) {
          replacements.push({
            start: m.index,
            end: m.index + m[0].length,
            newText: replaced
          });
          continue;
        }
      }

      const pos = doc.getLineAndColumn(m.index);
      this.addViolation({
        ruleId: 'z-index-hardcoded-literal',
        severity: 'error',
        file: doc.relPath,
        line: pos.line,
        col: pos.col,
        message: formatHardcodedZIndexMessage(m[0], exactKey, nearestKey, cssVarExpr),
        context: m[0],
        fixable: canFix
      });
    }

    return replacements;
  }

  private scanVueTemplateHardcodedProps(
    doc: AuditedDocument,
    effectiveLayers: Readonly<Record<string, number>>
  ): void {
    const templateBlock = doc.getVueBlocks()?.template;
    if (!templateBlock) return;

    VUE_TEMPLATE_Z_INDEX_ATTR_REGEX.lastIndex = 0;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = VUE_TEMPLATE_Z_INDEX_ATTR_REGEX.exec(templateBlock.content)) !== null) {
      const absOffset = templateBlock.contentStart + propMatch.index;
      if (doc.isInsideComment(absOffset)) continue;
      const pos = doc.getLineAndColumn(absOffset);
      const val = propMatch[1] ? parseInt(propMatch[1], 10) : 0;
      const { exactKey, nearestKey } = resolveZLayer(val, effectiveLayers);

      this.addViolation({
        ruleId: 'z-index-hardcoded-literal',
        severity: 'error',
        file: doc.relPath,
        line: pos.line,
        col: pos.col,
        message: formatVueZIndexPropMessage(propMatch[0], exactKey, nearestKey),
        context: propMatch[0],
        fixable: false
      });
    }
  }

  private auditDocumentIsolatedZIndexConstants(doc: AuditedDocument): void {
    if (isTestPath(doc.relPath) || isExemptFile(doc.relPath)) return;
    const norm = normalizePosixPath(doc.relPath).toLowerCase();
    const isScriptOrSfc = norm.endsWith('.ts') || norm.endsWith('.tsx') || norm.endsWith('.vue');
    if (!isScriptOrSfc || norm.includes('node_modules')) return;

    const auditConfig = getAuditConfig(this.projectRoot);
    const zFile = auditConfig.styles?.zLayersTsFile ?? auditConfig.domain?.zLayersFile;
    if (zFile && path.resolve(this.projectRoot, zFile) === path.resolve(doc.filePath)) {
      return;
    }

    ISOLATED_Z_INDEX_CONST_REGEX.lastIndex = 0;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = ISOLATED_Z_INDEX_CONST_REGEX.exec(doc.rawContent)) !== null) {
      if (doc.isInsideComment(cMatch.index)) continue;
      const pos = doc.getLineAndColumn(cMatch.index);
      this.addViolation({
        ruleId: 'z-index-isolated-constant',
        severity: 'error',
        file: doc.relPath,
        line: pos.line,
        col: pos.col,
        message: `Isolated Z-Index constant declaration detected: '${cMatch[0]}'. Declaring Z-Index constants outside Z_LAYERS is PROHIBITED. Register the layer in Z_LAYERS or consume 'Z_LAYERS.<LAYER>'.`,
        context: cMatch[0],
        fixable: false
      });
    }
  }

  public override async runAudit(): Promise<void> {
    if (!this.isExplicit && this.isSuiteGatingDisabled('Z-Layers disabled in config')) {
      return;
    }

    // Si el proyecto no tiene SCSS configurado o detectado
    if (!this.scssPath) {
      if (!this.isExplicit) {
        // En proyectos sin SCSS configurado explícitamente y sin archivos SCSS en disco (ej. CLI, backend, Day 0)
        // no bloquear el setup: marcar las reglas como no aplicables limpiamente.
        for (const r of Z_INDEX_RULES) {
          this.runSubAuditorSync(r, () => {
            this.markRuleNotApplicable(r, 'No SCSS stylesheets found in project');
          });
        }
        this.markSkipped('No SCSS stylesheets found in project');
        return;
      }

      this.runSubAuditorSync('z-index-read-error', () => {
        this.addViolation({
          ruleId: 'z-index-read-error',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message:
            "Missing Z-Layers configuration in audit.config.ts: configured SCSS file was not found. Define 'styles.zLayersScssFile' pointing to your base SCSS file, or explicitly configure 'styles.zLayersEnabled: false' if this project does not use SCSS Z-layers.",
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
          this.markRuleNotApplicable(r, 'Z-Layers not configured in project');
        });
      }
      this.redeclareCoverage({ include: [AUDIT_CONFIG_FILE], source: 'declared-only' });
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

    const isFixMode = this.isFixActive();

    let scssContent: string | null = null;
    let readErr: unknown = null;
    try {
      scssContent = await fs.readFile(this.scssPath, 'utf-8');
      this.recordScanned(relTarget);
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
        await fs.writeFile(this.scssPath, result.scssContent, 'utf-8');
      }

      this.context.setMetric('Total Layers Checked', Object.keys(effectiveLayers).length);
      this.context.setMetric('Status', result.modified ? 'Auto-fixed' : 'Synced');
    } else {
      this.runSubAuditorSync('z-index-missing-var', () => {
        this.markRuleNotApplicable('z-index-missing-var', 'Unreadable SCSS file');
      });
      this.runSubAuditorSync('z-index-mismatch', () => {
        this.markRuleNotApplicable('z-index-mismatch', 'Unreadable SCSS file');
      });
    }

    // Scan code and style files using declared sub-auditors
    await super.runAudit();
  }
}

// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ZIndexAuditor());
