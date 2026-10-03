/**
 * packages/auditor/src/suites/architecture/validate_dead_css.ts
 *
 * SCOPED DEAD CSS AUDITOR (Node.js 26+ Native)
 *
 * Enforces lean CSS bundles by detecting orphaned/unused classes inside <style scoped>
 * blocks of Vue components across src/components and src/views using pure PostCSS AST.
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
import { BaseAuditor, CANONICAL_IGNORE_DIRS } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import {
  collectAllProjectCssRules,
  extractClassNamesFromSelector,
  type ParsedCssRule
} from '../../analyzers/cssAnalyzer.ts';

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

const EXCLUDED_EXTENSIONS = new Set(['scss', 'css', 'vue', 'png', 'webp']);
const MAX_PREV_COMMENT_LINES = 2;

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

function auditComponentScopedCss(params: {
  rawContent: string;
  relFile: string;
  scopedRules: readonly ParsedCssRule[];
  globalTokens: ReadonlySet<string>;
  globalUtilityClasses: ReadonlySet<string>;
  auditor: DeadCssAuditor;
}): number {
  const { componentLogic, dynamicPrefixes } = extractComponentLogic(params.rawContent);
  const contentLines = params.rawContent.split('\n');
  let checkedCount = 0;

  for (const rule of params.scopedRules) {
    if (rule.rawBlock.includes('css-ok') || rule.rawBlock.includes('dead-css-ok')) continue;
    const lineIdx = rule.line - 1;
    const blockLineCount = rule.rawBlock.split('\n').length;
    const endLineIdx = lineIdx + blockLineCount;
    const surroundingLines = contentLines.slice(Math.max(0, lineIdx - MAX_PREV_COMMENT_LINES), endLineIdx);
    if (surroundingLines.some(l => l.includes('css-ok') || l.includes('dead-css-ok'))) continue;

    const classNames = extractClassNamesFromSelector(rule.selector);
    for (const className of classNames) {
      if (EXCLUDED_EXTENSIONS.has(className)) continue;
      if (isClassExempt(className, params.globalUtilityClasses, dynamicPrefixes)) continue;
      checkedCount++;

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
    const allSrcFiles = await this.context.collectFiles(srcRoots, new Set(['.ts', '.vue', '.json']));
    const globalTokens = collectGlobalCodeTokens(this.projectRoot, allSrcFiles);

    const compRoots = [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views'])
    ];
    const componentFiles = await this.context.collectFiles(compRoots, new Set(['.vue']));

    // Retrieve all project CSS rules parsed via PostCSS AST (leveraging incremental cache and multicore)
    const { rules } = await collectAllProjectCssRules('.', new Set(CANONICAL_IGNORE_DIRS), this.projectRoot);
    const scopedRulesByFile = new Map<string, ParsedCssRule[]>();
    for (const rule of rules) {
      if (rule.scoped) {
        let list = scopedRulesByFile.get(rule.file);
        if (!list) {
          list = [];
          scopedRulesByFile.set(rule.file, list);
        }
        list.push(rule);
      }
    }

    let scopedClassesChecked = 0;

    for (const relPath of componentFiles) {
      if (relPath.includes('.spec.') || relPath.includes('.test.')) continue;
      this.filesScannedCount++;
      const fullPath = path.resolve(this.projectRoot, relPath);
      const relFile = path.relative(this.projectRoot, fullPath).split(path.sep).join(path.posix.sep);
      const rawContent = fs.readFileSync(fullPath, 'utf-8');
      const scopedRules = scopedRulesByFile.get(relFile) ?? [];

      scopedClassesChecked += auditComponentScopedCss({
        rawContent,
        relFile,
        scopedRules,
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
