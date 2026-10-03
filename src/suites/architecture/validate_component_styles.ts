/**
 * scripts/auditors/architecture/validate_component_styles.ts
 *
 * VUE COMPONENT STYLE LINKAGE & SCSS ORPHAN AUDITOR (Node.js 26+ Native)
 *
 * Enforces component-level style governance across the codebase:
 *   1. Broken style link verification: All `<style src="...">` in `.vue` files
 *      and `@use`/`@import`/`@forward` must resolve to existent files on disk.
 *   2. Missing style linkage verification: Every `.vue` component with custom
 *      template classes must have an associated `<style>` block or explicit link.
 *   3. SCSS orphan detection: All component stylesheets must be
 *      actively linked or imported in the dependency graph rooted at main SCSS entries
 *      or directly inside Vue components.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=. --allow-fs-write=. scripts/auditors/architecture/validate_component_styles.ts
 *   npm run validate:component-styles
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';
import { getEffectiveGlobalUtilityClasses } from './validate_dead_css.ts';

enableCompileCache();

export type ComponentStyleRuleId =
  | 'broken-style-link'
  | 'missing-style-tag'
  | 'banned-style-inherited'
  | 'orphaned-scss'
  | 'ad-hoc-button-styles';

export const COMPONENT_STYLE_RULES: readonly ComponentStyleRuleId[] = [
  'broken-style-link',
  'missing-style-tag',
  'banned-style-inherited',
  'orphaned-scss',
  'ad-hoc-button-styles'
];

export interface ComponentStyleViolation {
  readonly file: string;
  readonly type: 'broken_style_link' | 'missing_style_tag' | 'banned_style_inherited' | 'orphaned_scss' | 'ad_hoc_button_styles';
  readonly message: string;
}

export interface ComponentStyleAuditResult {
  readonly vueComponentsScanned: number;
  readonly scssFilesScanned: number;
  readonly violations: readonly ComponentStyleViolation[];
  readonly passed: boolean;
}

const DEFAULT_CANONICAL_BUTTON_VARIANTS = new Set([
  'btn-primary',
  'btn-secondary',
  'btn-dark',
  'btn-success',
  'btn-warning',
  'btn-danger',
  'btn-sm',
  'btn-md',
  'btn-lg',
  'btn-block',
  'btn-3d',
  'btn-icon'
]);

function getEffectiveCanonicalButtonVariants(): ReadonlySet<string> {
  const config = getAuditConfig();
  const configured = config.styles?.buttonGovernance?.canonicalVariants ?? config.styles?.canonicalButtonVariants;
  if (configured) {
    return new Set(configured);
  }
  return DEFAULT_CANONICAL_BUTTON_VARIANTS;
}


/**
 * Standard SASS candidate resolution
 */
function resolveSassPath(importPath: string, fromFile: string, srcDir: string): string | null {
  let baseDir = path.dirname(fromFile);
  let cleanImport = importPath;

  if (cleanImport.startsWith('@/')) {
    baseDir = srcDir;
    cleanImport = cleanImport.slice(2);
  } else if (cleanImport.startsWith('~')) {
    cleanImport = cleanImport.slice(1);
  }

  const dirPart = path.dirname(cleanImport);
  const baseName = path.basename(cleanImport);

  const candidates = [
    path.resolve(baseDir, cleanImport),
    path.resolve(baseDir, `${cleanImport}.scss`),
    path.resolve(baseDir, `${cleanImport}.css`),
    path.resolve(baseDir, dirPart, `_${baseName}.scss`),
    path.resolve(baseDir, cleanImport, '_index.scss'),
    path.resolve(baseDir, cleanImport, 'index.scss')
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return cand;
    }
  }

  return null;
}

function isCustomCandidateClass(c: string, globalUtilityClasses: ReadonlySet<string>): boolean {
  return (
    !c.startsWith('var(') &&
    !c.includes('{') &&
    !c.includes('}') &&
    !c.startsWith(':') &&
    !c.includes('[') &&
    !c.includes(']') &&
    !c.includes('(') &&
    !c.includes(')') &&
    !globalUtilityClasses.has(c)
  );
}

interface ScssTracker {
  importedScssFiles: Set<string>;
  trackScssFile: (filePath: string) => void;
}

function createScssTracker(srcDir: string): ScssTracker {
  const importedScssFiles = new Set<string>();

  const trackScssFile = (filePath: string): void => {
    const normalized = path.normalize(filePath);
    if (importedScssFiles.has(normalized)) return;
    importedScssFiles.add(normalized);

    if (fs.existsSync(normalized)) {
      const content = fs.readFileSync(normalized, 'utf-8');
      const matches = content.matchAll(/@(?:use|import|forward)\s+["']([^"']+)["']/g);
      for (const m of matches) {
        const importTarget = m[1]!;
        const resolved = resolveSassPath(importTarget, normalized, srcDir);
        if (resolved) {
          trackScssFile(resolved);
        }
      }
    }
  };

  return { importedScssFiles, trackScssFile };
}

function seedRootScssGraph(
  stylesRoots: readonly string[],
  projectRoot: string,
  trackScssFile: (p: string) => void
): void {
  for (const sRoot of stylesRoots) {
    const candidates = [
      path.join(projectRoot, sRoot, '_index.scss'),
      path.join(projectRoot, sRoot, 'index.scss'),
      path.join(projectRoot, sRoot, 'main.scss')
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        trackScssFile(cand);
      }
    }
  }
}

function auditStyleLinkage(
  file: string,
  relPath: string,
  content: string,
  srcDir: string,
  trackScssFile: (p: string) => void,
  auditor: ComponentStylesAuditor
): void {
  const scssMatches = content.matchAll(/@(?:use|import|forward)\s+["']([^"']+)["']|src=["']([^"']+\.scss)["']/g);
  for (const m of scssMatches) {
    const importTarget = m[1] || m[2];
    if (importTarget) {
      const resolved = resolveSassPath(importTarget, file, srcDir);
      if (resolved) trackScssFile(resolved);
    }
  }

  const styleSrcMatch = content.match(/<style[^>]*src=["']([^"']+)["']/i);
  if (styleSrcMatch) {
    const srcPath = styleSrcMatch[1]!;
    const resolved = resolveSassPath(srcPath, file, srcDir);
    if (!resolved) {
      auditor.recordViolation(
        {
          file: relPath,
          type: 'broken_style_link',
          message: `Style src points to non-existent file: ${srcPath}`
        },
        'broken-style-link',
        styleSrcMatch[0]
      );
    } else {
      trackScssFile(resolved);
    }
  }

  if (content.includes('style-inherited')) {
    auditor.recordViolation(
      {
        file: relPath,
        type: 'banned_style_inherited',
        message: `Directiva ilegal '// ' + 'style-inherited' detectada. Los estilos scoped en Vue 3 no penetran a componentes hijos; cada SFC debe declarar o enlazar explícitamente sus propios estilos.`
      },
      'banned-style-inherited',
      'style-inherited'
    );
  }
}

function checkButtonStyleOverrides(
  relPath: string,
  styleMatches: readonly RegExpExecArray[],
  auditor: ComponentStylesAuditor
): void {
  for (const sm of styleMatches) {
    const styleBody = sm[2] ?? '';
    const btnSelectorMatch = styleBody.match(/(?:^|[^\w-])(\.btn(?:\s*\{|\s*[,>+~]|\.[a-z0-9_-]+))/i);
    if (btnSelectorMatch) {
      auditor.recordViolation(
        {
          file: relPath,
          type: 'ad_hoc_button_styles',
          message: `Sobreescritura ad-hoc de estilos de botón detectada en <style>: "${btnSelectorMatch[1]}". Todos los estilos de botón deben gobernarse de forma centralizada.`
        },
        'ad-hoc-button-styles',
        btnSelectorMatch[1]!
      );
    }
  }
}

function checkCanonicalButtonClasses(
  relPath: string,
  content: string,
  canonicalButtonVariants: ReadonlySet<string>,
  auditor: ComponentStylesAuditor
): void {
  const allClassMatches = content.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
  for (const cm of allClassMatches) {
    const clsList = cm[1]!.split(/\s+/).filter(Boolean);
    if (!clsList.includes('btn')) continue;

    for (const c of clsList) {
      if (c.startsWith('btn-') && !canonicalButtonVariants.has(c)) {
        auditor.recordViolation(
          {
            file: relPath,
            type: 'ad_hoc_button_styles',
            message: `Clase de botón no canónica "${c}" detectada. Solo se permiten variantes canónicas configuradas (${Array.from(canonicalButtonVariants).join(', ')}).`
          },
          'ad-hoc-button-styles',
          c
        );
      }
    }
  }
}

function auditButtonGovernance(
  relPath: string,
  content: string,
  styleMatches: readonly RegExpExecArray[],
  config: AuditEngineConfig,
  auditor: ComponentStylesAuditor
): void {
  const isButtonGovActive = config.styles?.buttonGovernance?.enabled === true || Boolean(config.styles?.canonicalButtonVariants?.length);
  if (!isButtonGovActive) return;

  checkButtonStyleOverrides(relPath, styleMatches, auditor);

  const canonicalButtonVariants = getEffectiveCanonicalButtonVariants();
  if (canonicalButtonVariants.size > 0) {
    checkCanonicalButtonClasses(relPath, content, canonicalButtonVariants, auditor);
  }
}

function checkHasValidStyle(styleMatches: readonly RegExpExecArray[]): boolean {
  return styleMatches.some(sm => {
    const attrs = sm[1] ?? '';
    const body = (sm[2] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    return /\bsrc=["']/.test(attrs) || body.length > 0;
  });
}

function extractCustomClasses(content: string, globalUtilityClasses: ReadonlySet<string>): string[] {
  const customClasses: string[] = [];
  const classMatches = content.matchAll(/(?<![-:\w])class=["']([^"']+)["']/g);
  for (const m of classMatches) {
    const clsList = m[1]!.split(/\s+/).filter(Boolean);
    for (const c of clsList) {
      if (isCustomCandidateClass(c, globalUtilityClasses)) {
        customClasses.push(c);
      }
    }
  }

  const dynamicClassMatches = content.matchAll(/(?:\s:|\bv-bind:)class=["']([^"']+)["']/g);
  for (const dm of dynamicClassMatches) {
    const expr = dm[1]!;
    const strLiterals = expr.matchAll(/['`]([a-zA-Z0-9_-]+)['`]/g);
    for (const sl of strLiterals) {
      const c = sl[1]!;
      if (isCustomCandidateClass(c, globalUtilityClasses)) {
        customClasses.push(c);
      }
    }
  }
  return customClasses;
}

function auditMissingStyleTag(
  relPath: string,
  content: string,
  hasValidStyle: boolean,
  auditor: ComponentStylesAuditor
): void {
  if (hasValidStyle) return;

  const globalUtilityClasses = getEffectiveGlobalUtilityClasses();
  const customClasses = extractCustomClasses(content, globalUtilityClasses);

  if (customClasses.length > 0) {
    auditor.recordViolation(
      {
        file: relPath,
        type: 'missing_style_tag',
        message: `Defines ${customClasses.length} custom template classes (${customClasses.slice(0, 3).join(', ')}...) without an associated non-empty <style> block`
      },
      'missing-style-tag',
      customClasses.slice(0, 3).join(', ')
    );
  }
}

function auditVueComponent(
  file: string,
  projectRoot: string,
  srcDir: string,
  trackScssFile: (p: string) => void,
  config: AuditEngineConfig,
  auditor: ComponentStylesAuditor
): void {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');

  auditStyleLinkage(file, relPath, content, srcDir, trackScssFile, auditor);

  const styleMatches = Array.from(content.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi));
  auditButtonGovernance(relPath, content, styleMatches, config, auditor);

  const hasValidStyle = checkHasValidStyle(styleMatches);
  auditMissingStyleTag(relPath, content, hasValidStyle, auditor);
}

function auditOrphanedScss(
  stylesRoots: readonly string[],
  scssFiles: readonly string[],
  importedScssFiles: ReadonlySet<string>,
  projectRoot: string,
  auditor: ComponentStylesAuditor
): void {
  const componentScssDirs = stylesRoots.map(sr => path.resolve(projectRoot, sr, 'components'));
  const componentScssFiles = scssFiles.filter(f => componentScssDirs.some(dir => f.startsWith(dir)));

  for (const file of componentScssFiles) {
    const normalized = path.normalize(file);
    if (!importedScssFiles.has(normalized)) {
      const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
      auditor.recordViolation(
        {
          file: relPath,
          type: 'orphaned_scss',
          message: 'SCSS component stylesheet is never imported by any Vue component or SCSS root'
        },
        'orphaned-scss',
        relPath
      );
    }
  }
}

export class ComponentStylesAuditor extends BaseAuditor<ComponentStyleRuleId> {
  private readonly collectedViolations: ComponentStyleViolation[] = [];
  private vueCount = 0;
  private scssCount = 0;

  constructor(options: { projectRoot?: string; roots?: readonly string[] } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const effectiveRoots = options.roots ?? [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views']),
      ...(config.paths.stylesRoots ?? ['src/styles'])
    ];

    super({
      id: 'validate_component_styles',
      name: 'Vue Component Style Linkage & SCSS Auditor',
      description: 'Valida enlaces de estilos de componentes y huérfanos SCSS',
      family: 'architecture',
      packageName: 'Estilos',
      ruleIds: COMPONENT_STYLE_RULES,
      ruleDescriptions: {
        'broken-style-link': 'Enlace de estilo roto o inexistente',
        'missing-style-tag': 'Componente sin bloque de estilos',
        'banned-style-inherited': 'Marcador style-inherited prohibido',
        'orphaned-scss': 'Archivo SCSS huérfano sin uso',
        'ad-hoc-button-styles': 'Clase de botón fuera de estándar'
      },
      roots: effectiveRoots,
      projectRoot: effectiveRoot
    });
  }

  public recordViolation(v: ComponentStyleViolation, ruleId: ComponentStyleRuleId, context: string, line = 1): void {
    this.collectedViolations.push(v);
    this.addViolation({
      ruleId,
      severity: 'error',
      file: v.file,
      line,
      message: v.message,
      context
    });
  }

  public getViolations(): readonly ComponentStyleViolation[] {
    return this.collectedViolations;
  }

  public getVueCount(): number {
    return this.vueCount;
  }

  public getScssCount(): number {
    return this.scssCount;
  }

  public override runAudit(): void {
    const config = getAuditConfig(this.projectRoot);
    const srcRoots = config.paths.srcRoots ?? ['src'];
    const srcDir = path.resolve(this.projectRoot, srcRoots[0] ?? 'src');
    const vueFiles = this.context.collectFiles(this.roots, new Set(['.vue']));
    const scssFiles = this.context.collectFiles(this.roots, new Set(['.scss']));

    this.vueCount = vueFiles.length;
    this.scssCount = scssFiles.length;
    this.filesScannedCount = vueFiles.length + scssFiles.length;

    const { importedScssFiles, trackScssFile } = createScssTracker(srcDir);
    const stylesRoots = config.paths.stylesRoots ?? ['src/styles'];
    seedRootScssGraph(stylesRoots, this.projectRoot, trackScssFile);

    for (const file of vueFiles) {
      auditVueComponent(file, this.projectRoot, srcDir, trackScssFile, config, this);
    }

    auditOrphanedScss(stylesRoots, scssFiles, importedScssFiles, this.projectRoot, this);

    const subAuditors = this.getSubAuditors();
    const totalSteps = subAuditors.length;
    for (let i = 0; i < subAuditors.length; i++) {
      const sub = subAuditors[i]!;
      const count = this.countsByRule.get(sub.id as ComponentStyleRuleId) ?? 0;
      this.logSubAudit(i + 1, totalSteps, sub.name, count);
    }
  }
}

export function auditComponentStyles(rootDir?: string): ComponentStyleAuditResult {
  const auditor = new ComponentStylesAuditor(rootDir ? { projectRoot: rootDir } : undefined);
  auditor.runAudit();
  return {
    vueComponentsScanned: auditor.getVueCount(),
    scssFilesScanned: auditor.getScssCount(),
    violations: auditor.getViolations(),
    passed: auditor.getViolations().length === 0
  };
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ComponentStylesAuditor());
