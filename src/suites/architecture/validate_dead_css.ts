/**
 * packages/auditor/src/suites/architecture/validate_dead_css.ts
 *
 * SCOPED DEAD CSS AUDITOR (Node.js 26+ Native)
 *
 * Enforces lean CSS bundles by detecting orphaned/unused classes inside <style scoped>
 * blocks of Vue components across src/components and src/views.
 *
 * Escape Hatch:
 *   // css-ok: <justification> or // dead-css-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_dead_css.ts
 *   npm run validate:dead-css
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';
import { isTestPath } from '../../core/auditTestPredicates.ts';
import { toPosixRelative } from '../../core/safePath.ts';

enableCompileCache();

export type DeadCssRuleId = 'dead-scoped-css';

export const DEAD_CSS_RULES: readonly DeadCssRuleId[] = ['dead-scoped-css'] as const;

export const DEFAULT_GLOBAL_UTILITY_CLASSES = new Set([
  'clickable',
  'flex',
  'hidden',
  'active',
  'disabled',
  'w-full',
  'h-full',
  'truncate',
  'pointer-events-none',
  'pointer-events-auto',
  'select-none',
  'custom-scrollbar',
  'empty-state',
  'scrollable-content',
  'modal-footer',
  'emoji',
  'tabular-nums'
]);

export function getEffectiveGlobalUtilityClasses(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const configured = config.styles?.globalUtilityClasses ?? [];
  return new Set([...DEFAULT_GLOBAL_UTILITY_CLASSES, ...configured]);
}

const VUE_TRANSITION_SUFFIXES = [
  '-enter-from',
  '-enter-active',
  '-enter-to',
  '-leave-from',
  '-leave-active',
  '-leave-to'
] as const;

const EXCLUDED_EXTENSIONS = new Set(['scss', 'css', 'vue', 'png', 'webp']);
const MAX_PREV_COMMENT_LINES = 2;

export interface ParsedScopedCssRule {
  readonly line: number;
  readonly selector: string;
  readonly rawBlock: string;
}

export function extractClassNamesFromSelector(selector: string): string[] {
  const classRegex = /(?:^|[^\w-])\.([a-z_-][\w-]*)/gi;
  const classes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(selector)) !== null) {
    const className = match[1];
    if (className) {
      classes.push(className);
    }
  }
  return classes;
}

export function extractScopedRulesFromVueContent(rawContent: string): ParsedScopedCssRule[] {
  const rules: ParsedScopedCssRule[] = [];
  const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = styleRegex.exec(rawContent)) !== null) {
    const attrs = match[1] ?? '';
    if (!/\bscoped\b/i.test(attrs)) continue;

    const preContent = rawContent.slice(0, match.index);
    const startLine = preContent.split('\n').length;
    const body = match[2] ?? '';
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/(?:^|[^\w-])\.[a-z_-][\w-]*/i.test(line)) {
        const colonIdx = line.indexOf(':');
        const dotIdx = line.indexOf('.');
        if (colonIdx === -1 || colonIdx > dotIdx) {
          rules.push({
            line: startLine + i,
            selector: line.trim(),
            rawBlock: line
          });
        }
      }
    }
  }

  return rules;
}

function collectGlobalCodeTokens(projectRoot: string, srcFiles: readonly string[]): Set<string> {
  const globalTokens = new Set<string>();
  for (const relPath of srcFiles) {
    if (isTestPath(relPath)) continue;
    const fullPath = path.resolve(projectRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const contentWithoutStyles = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const words = contentWithoutStyles.match(/[\w-]{2,}/g);
    if (words) {
      for (const w of words) globalTokens.add(w);
    }
  }
  return globalTokens;
}

function extractComponentLogic(rawContent: string): {
  componentLogic: string;
  dynamicPrefixes: Set<string>;
} {
  const sfc = parseVueSfc(rawContent);
  const templateContent = sfc.template?.content ?? '';
  const scriptsContent = sfc.scripts.map((s) => s.content).join('\n');
  const componentLogic = `${templateContent}\n${scriptsContent}`;
  const dynamicPrefixes = new Set<string>();

  const dynamicClassRegex = /`([\w-]+-)\$\{/g;
  let dynMatch: RegExpExecArray | null;
  while ((dynMatch = dynamicClassRegex.exec(componentLogic)) !== null) {
    if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
  }

  const concatPrefixRegex = /['"]([\w-]+-)['"]\s*\+/g;
  while ((dynMatch = concatPrefixRegex.exec(componentLogic)) !== null) {
    if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
  }

  return { componentLogic, dynamicPrefixes };
}

function isClassExempt(
  className: string,
  globalUtilityClasses: ReadonlySet<string>,
  dynamicPrefixes: ReadonlySet<string>
): boolean {
  if (globalUtilityClasses.has(className)) return true;
  if (VUE_TRANSITION_SUFFIXES.some((suffix) => className.endsWith(suffix))) return true;
  if (Array.from(dynamicPrefixes).some((prefix) => className.startsWith(prefix))) return true;
  return false;
}

function isRuleExemptByComments(
  rule: ParsedScopedCssRule,
  contentLines: readonly string[]
): boolean {
  if (rule.rawBlock.includes('css-ok') || rule.rawBlock.includes('dead-css-ok')) return true;
  const lineIdx = rule.line - 1;
  const blockLineCount = rule.rawBlock.split('\n').length;
  const endLineIdx = lineIdx + blockLineCount;
  const surroundingLines = contentLines.slice(
    Math.max(0, lineIdx - MAX_PREV_COMMENT_LINES),
    endLineIdx
  );
  return surroundingLines.some((l) => l.includes('css-ok') || l.includes('dead-css-ok'));
}

function auditSingleRuleClasses(
  rule: ParsedScopedCssRule,
  params: {
    relFile: string;
    globalTokens: ReadonlySet<string>;
    globalUtilityClasses: ReadonlySet<string>;
    auditor: DeadCssAuditor;
  },
  dynamicPrefixes: ReadonlySet<string>,
  componentLogic: string
): number {
  let count = 0;
  const classNames = extractClassNamesFromSelector(rule.selector);
  for (const className of classNames) {
    if (
      EXCLUDED_EXTENSIONS.has(className) ||
      isClassExempt(className, params.globalUtilityClasses, dynamicPrefixes)
    ) {
      continue;
    }
    count++;
    if (!componentLogic.includes(className) && !params.globalTokens.has(className)) {
      params.auditor.addViolation({
        ruleId: 'dead-scoped-css',
        severity: 'error',
        file: params.relFile,
        line: rule.line,
        message: `Clase CSS scoped '.${className}' es código muerto (huérfana): no se encuentra en el componente ni en el código de la aplicación.`,
        context: className
      });
    }
  }
  return count;
}

function auditComponentScopedCss(params: {
  rawContent: string;
  relFile: string;
  scopedRules: readonly ParsedScopedCssRule[];
  globalTokens: ReadonlySet<string>;
  globalUtilityClasses: ReadonlySet<string>;
  auditor: DeadCssAuditor;
}): number {
  const { componentLogic, dynamicPrefixes } = extractComponentLogic(params.rawContent);
  const contentLines = params.rawContent.split('\n');
  let checkedCount = 0;

  for (const rule of params.scopedRules) {
    if (isRuleExemptByComments(rule, contentLines)) continue;
    checkedCount += auditSingleRuleClasses(rule, params, dynamicPrefixes, componentLogic);
  }

  return checkedCount;
}

export class DeadCssAuditor extends BaseAuditor<DeadCssRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    const config = getAuditConfig(projectRoot);
    const compRoots = [...(config.paths.componentsRoots ?? []), ...(config.paths.viewsRoots ?? [])];

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(DEAD_CSS_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_dead_css',
      name: 'Scoped Dead CSS Auditor',
      description: 'Detecta clases CSS scoped huérfanas en componentes Vue',
      family: 'architecture',
      ruleIds: DEAD_CSS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DEAD_CSS_RULES, 'hygiene'),
      packageName: 'CSS',
      configKey: 'styles.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '💀',
      ruleDescriptions: {
        'dead-scoped-css': 'Clase scoped huérfana sin uso'
      },
      ruleRemediations: {
        'dead-scoped-css':
          '📖 GUÍA DE REMEDIACIÓN: dead-scoped-css\n' +
          '1. Causa Raíz: Se declaró una clase CSS dentro del bloque `<style scoped>` de un componente Vue que no se utiliza en ninguna parte de su plantilla (`<template>`) ni en su lógica de presentación (`<script>`). El CSS muerto infla el bundle y confunde la lectura del diseño.\n' +
          '2. Diagnóstico: Ubica la clase CSS señalada en la línea del bloque `<style scoped>` del componente.\n' +
          '3. Solución Canónica:\n' +
          '   a) Si el elemento HTML fue eliminado o refactorizado: elimina la regla de estilo huérfana.\n' +
          '   b) Si la clase se aplica dinámicamente mediante concatenación que el analizador no infiere: utiliza nombres de clase completos en plantillas (`:class="{ \'my-class\': isActive }"`) en lugar de fragmentación dinámica.\n' +
          '   c) Si es una clase transicional o inyectada por una librería externa, anota `/* dead-css-ok: <justificación> */` justo antes de la regla.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Clase huérfana: `.btn-old-badge { font-size: 10px; }` (sin uso en el template)\n' +
          '   ✅ Limpio:        Eliminada del bloque `<style scoped>`.'
      },
      coverage: {
        include: deriveCoverageFromRoots(compRoots, new Set(['.vue']), projectRoot).include
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const globalUtilityClasses = getEffectiveGlobalUtilityClasses(this.projectRoot);
    const srcRoots = config.paths.srcRoots ?? [];
    const allSrcFiles = this.context.collectFiles(srcRoots, new Set(['.ts', '.vue', '.json']));
    const globalTokens = collectGlobalCodeTokens(this.projectRoot, allSrcFiles);

    const compRoots = [...(config.paths.componentsRoots ?? []), ...(config.paths.viewsRoots ?? [])];
    this.redeclareCoverage({
      include: deriveCoverageFromRoots(compRoots, new Set(['.vue']), this.projectRoot).include
    });
    const componentFiles = this.context.collectFiles(compRoots, new Set(['.vue']));

    if (componentFiles.length === 0) {
      this.runSubAuditorSync('dead-scoped-css', () => {
        this.markRuleNotApplicable(
          'dead-scoped-css',
          'No se encontraron componentes .vue en el proyecto'
        );
      });
      return;
    }

    let scopedClassesChecked = 0;

    this.runSubAuditorSync('dead-scoped-css', () => {
      for (const relPath of componentFiles) {
        if (isTestPath(relPath)) continue;
        const fullPath = path.resolve(this.projectRoot, relPath);
        const relFile = toPosixRelative(this.projectRoot, fullPath);
        this.recordScanned(relFile);
        const rawContent = fs.readFileSync(fullPath, 'utf-8');
        const scopedRules = extractScopedRulesFromVueContent(rawContent);

        scopedClassesChecked += auditComponentScopedCss({
          rawContent,
          relFile,
          scopedRules,
          globalTokens,
          globalUtilityClasses,
          auditor: this
        });
      }
    });

    this.context.setMetric('Components Scanned', this.filesScannedCount);
    this.context.setMetric('Scoped Classes', scopedClassesChecked);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new DeadCssAuditor());
