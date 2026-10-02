/**
 * scripts/auditors/architecture/validate_dead_css.ts
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
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_dead_css.ts
 *   npm run validate:dead-css
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type DeadCssRuleId = 'dead-scoped-css';

export const DEAD_CSS_RULES: readonly DeadCssRuleId[] = [
  'dead-scoped-css'
] as const;

export const DEFAULT_GLOBAL_UTILITY_CLASSES = new Set([
  'clickable', 'flex', 'hidden', 'active', 'disabled',
  'w-full', 'h-full', 'truncate', 'pointer-events-none', 'pointer-events-auto', 'select-none',
  'custom-scrollbar', 'empty-state', 'scrollable-content', 'modal-footer', 'emoji',
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

function collectGlobalCodeTokens(projectRoot: string, srcFiles: readonly string[]): Set<string> {
  const globalTokens = new Set<string>();
  for (const relPath of srcFiles) {
    if (relPath.includes('.spec.') || relPath.includes('.test.')) continue;
    const fullPath = path.resolve(projectRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const contentWithoutStyles = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const words = contentWithoutStyles.match(/[a-zA-Z0-9_-]{2,}/g);
    if (words) {
      for (const w of words) globalTokens.add(w);
    }
  }
  return globalTokens;
}

function extractComponentLogic(rawContent: string): { componentLogic: string; dynamicPrefixes: Set<string> } {
  const templateMatch = /<template\b[^>]*>([\s\S]*?)<\/template>/i.exec(rawContent);
  const templateContent = templateMatch?.[1] ?? '';

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptsContent = '';
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRegex.exec(rawContent)) !== null) {
    scriptsContent += `\n${scriptMatch[1]}`;
  }

  const componentLogic = `${templateContent}\n${scriptsContent}`;
  const dynamicPrefixes = new Set<string>();

  const dynamicClassRegex = /`([a-zA-Z0-9_-]+-)\$\{/g;
  let dynMatch: RegExpExecArray | null;
  while ((dynMatch = dynamicClassRegex.exec(componentLogic)) !== null) {
    if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
  }

  const concatPrefixRegex = /['"]([a-zA-Z0-9_-]+-)['"]\s*\+/g;
  while ((dynMatch = concatPrefixRegex.exec(componentLogic)) !== null) {
    if (dynMatch[1]) dynamicPrefixes.add(dynMatch[1]);
  }

  return { componentLogic, dynamicPrefixes };
}

function isLineIgnoredInCss(line: string, prevLines: readonly string[]): boolean {
  if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) return true;
  if (line.includes('css-ok') || line.includes('dead-css-ok')) return true;
  if (prevLines.some(l => l.includes('css-ok') || l.includes('dead-css-ok'))) return true;
  if (/^@(?:use|import|forward|include|extend)\b/.test(line)) return true;
  if (/^[a-zA-Z-]+:\s*[^;{]+;?$/.test(line) && !line.includes('{')) return true;
  return false;
}

const EXCLUDED_EXTENSIONS = new Set(['scss', 'css', 'vue', 'png', 'webp']);

function cleanCssLine(rawLine: string): string {
  let line = rawLine.replace(/\/\*[\s\S]*?\*\//g, '');
  line = line.replace(/\/\/[^\n]*/g, '');
  line = line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  return line.replace(/::?(?:deep|slotted)\([^)]*\)/g, '');
}

function extractClassNamesFromLine(line: string): string[] {
  const cleaned = cleanCssLine(line);
  const classRegex = /(?:^|[^\w-])\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  const classes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(cleaned)) !== null) {
    const className = match[1];
    if (className && !EXCLUDED_EXTENSIONS.has(className)) {
      classes.push(className);
    }
  }
  return classes;
}

function isClassExempt(
  className: string,
  globalUtilityClasses: ReadonlySet<string>,
  dynamicPrefixes: ReadonlySet<string>
): boolean {
  if (globalUtilityClasses.has(className)) return true;
  if (VUE_TRANSITION_SUFFIXES.some(suffix => className.endsWith(suffix))) return true;
  if (Array.from(dynamicPrefixes).some(prefix => className.startsWith(prefix))) return true;
  return false;
}

function auditScopedStyleBlock(params: {
  styleContent: string;
  linesBeforeStyle: number;
  componentLogic: string;
  dynamicPrefixes: ReadonlySet<string>;
  globalTokens: ReadonlySet<string>;
  globalUtilityClasses: ReadonlySet<string>;
  relFile: string;
  auditor: DeadCssAuditor;
}): number {
  let checked = 0;
  const lines = params.styleContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    const lineNum = params.linesBeforeStyle + i;
    const prevLines = lines.slice(Math.max(0, i - 2), i);

    if (isLineIgnoredInCss(line, prevLines)) continue;

    const classNames = extractClassNamesFromLine(line);
    for (const className of classNames) {
      if (isClassExempt(className, params.globalUtilityClasses, params.dynamicPrefixes)) continue;
      checked++;

      if (!params.componentLogic.includes(className) && !params.globalTokens.has(className)) {
        params.auditor.addViolation({
          ruleId: 'dead-scoped-css',
          severity: 'error',
          file: params.relFile,
          line: lineNum,
          message: `Clase CSS scoped '.${className}' es código muerto (huérfana): no se encuentra en el componente ni en el código de la aplicación.`,
          context: className
        });
      }
    }
  }

  return checked;
}

function auditComponentDeadCss(params: {
  rawContent: string;
  relFile: string;
  globalTokens: ReadonlySet<string>;
  globalUtilityClasses: ReadonlySet<string>;
  auditor: DeadCssAuditor;
}): number {
  const { componentLogic, dynamicPrefixes } = extractComponentLogic(params.rawContent);
  const scopedStyleRegex = /<style\b[^>]*\bscoped\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  let checkedCount = 0;

  while ((styleMatch = scopedStyleRegex.exec(params.rawContent)) !== null) {
    const styleContent = styleMatch[1] || '';
    const styleStartIndex = styleMatch.index;
    const linesBeforeStyle = params.rawContent.substring(0, styleStartIndex).split('\n').length;

    checkedCount += auditScopedStyleBlock({
      styleContent,
      linesBeforeStyle,
      componentLogic,
      dynamicPrefixes,
      globalTokens: params.globalTokens,
      globalUtilityClasses: params.globalUtilityClasses,
      relFile: params.relFile,
      auditor: params.auditor
    });
  }

  return checkedCount;
}

export class DeadCssAuditor extends BaseAuditor<DeadCssRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_dead_css',
      name: 'Scoped Dead CSS Auditor',
      description: 'Detecta clases CSS scoped huérfanas en componentes Vue',
      family: 'architecture',
      ruleIds: DEAD_CSS_RULES,
      packageName: 'CSS',
      ruleDescriptions: {
        'dead-scoped-css': 'Clase scoped huérfana sin uso'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const globalUtilityClasses = getEffectiveGlobalUtilityClasses(this.projectRoot);
    const srcRoots = config.paths.srcRoots ?? ['src'];
    this.context.logStep(1, 2, 'Recopilando tokens de código globales en código fuente...');
    const allSrcFiles = await this.context.collectFiles(srcRoots, new Set(['.ts', '.vue', '.json']));
    const globalTokens = collectGlobalCodeTokens(this.projectRoot, allSrcFiles);

    const compRoots = [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views'])
    ];
    this.context.logStep(2, 2, 'Auditando clases scoped en componentes...');
    const componentFiles = await this.context.collectFiles(compRoots, new Set(['.vue']));
    let scopedClassesChecked = 0;

    for (const relPath of componentFiles) {
      if (relPath.includes('.spec.') || relPath.includes('.test.')) continue;
      this.filesScannedCount++;
      const fullPath = path.resolve(this.projectRoot, relPath);
      const relFile = path.relative(this.projectRoot, fullPath).split(path.sep).join(path.posix.sep);
      const rawContent = fs.readFileSync(fullPath, 'utf-8');

      scopedClassesChecked += auditComponentDeadCss({
        rawContent,
        relFile,
        globalTokens,
        globalUtilityClasses,
        auditor: this
      });
    }

    this.context.setMetric('Components Scanned', this.filesScannedCount);
    this.context.setMetric('Scoped Classes', scopedClassesChecked);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new DeadCssAuditor());
