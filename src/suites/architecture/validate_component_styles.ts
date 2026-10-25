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
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getEffectiveGlobalUtilityClasses } from './validate_dead_css.ts';
import { parseVueSfc, type VueSfcBlock } from '../../core/vueSfcParser.ts';
import { stripComments } from '../../core/scannerUtils.ts';
import { toPosixRelative, normalizePosixPath } from '../../core/safePath.ts';
import { tryCatchSync } from '../../core/safeUtils.ts';

enableCompileCache();

export const COMPONENT_STYLE_RULES = [
  'broken-style-link',
  'missing-style-tag',
  'banned-style-inherited',
  'orphaned-scss',
  'ad-hoc-button-styles',
  'banned-plain-css-style',
  'banned-raw-css-file'
] as const;
export type ComponentStyleRuleId = (typeof COMPONENT_STYLE_RULES)[number];

export const COMPONENT_STYLE_VIOLATION_TYPES = [
  'broken_style_link',
  'missing_style_tag',
  'banned_style_inherited',
  'orphaned_scss',
  'ad_hoc_button_styles',
  'banned_plain_css_style',
  'banned_raw_css_file'
] as const;
export type ComponentStyleViolationType = (typeof COMPONENT_STYLE_VIOLATION_TYPES)[number];

export interface ComponentStyleViolation {
  readonly file: string;
  readonly type: ComponentStyleViolationType;
  readonly message: string;
}

export interface ComponentStyleAuditResult {
  readonly vueComponentsScanned: number;
  readonly scssFilesScanned: number;
  readonly cssFilesScanned?: number;
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
  const configured =
    config.styles?.buttonGovernance?.canonicalVariants ?? config.styles?.canonicalButtonVariants;
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

function checkButtonStyleOverrides(
  relPath: string,
  styles: readonly VueSfcBlock[],
  auditor: ComponentStylesAuditor
): void {
  for (const style of styles) {
    const styleBody = style.content;
    const btnSelectorMatch = styleBody.match(/(?:^|[^\w-])(\.btn(?:\s*\{|\s*[,>+~]|\.[\w-]+))/i);
    if (btnSelectorMatch) {
      auditor.recordViolation(
        {
          file: relPath,
          type: 'ad_hoc_button_styles',
          message: `Ad-hoc button style override detected in <style>: "${btnSelectorMatch[1]}". All button styles must be centrally governed.`
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
            message: `Non-canonical button class "${c}" detected. Only configured canonical variants are allowed (${Array.from(canonicalButtonVariants).join(', ')}).`
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
  styles: readonly VueSfcBlock[],
  config: AuditEngineConfig,
  auditor: ComponentStylesAuditor
): void {
  const isButtonGovActive =
    config.styles?.buttonGovernance?.enabled === true ||
    Boolean(config.styles?.canonicalButtonVariants?.length);
  if (!isButtonGovActive) return;

  checkButtonStyleOverrides(relPath, styles, auditor);

  const canonicalButtonVariants = getEffectiveCanonicalButtonVariants();
  if (canonicalButtonVariants.size > 0) {
    checkCanonicalButtonClasses(relPath, content, canonicalButtonVariants, auditor);
  }
}

function checkHasValidStyle(styles: readonly VueSfcBlock[]): boolean {
  return styles.some((style) => {
    const hasSrc = Boolean(style.attributes['src']);
    const body = stripComments(style.content).trim();
    return hasSrc || body.length > 0;
  });
}

function extractCustomClasses(
  content: string,
  globalUtilityClasses: ReadonlySet<string>
): string[] {
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
    const strLiterals = expr.matchAll(/['`]([\w-]+)['`]/g);
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

function addOrReplaceLangScss(openingTag: string): string {
  const langRegex = /\blang=(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
  if (langRegex.test(openingTag)) {
    return openingTag.replace(langRegex, 'lang="scss"');
  }
  return openingTag.replace(/\s*(\/?>)$/, ' lang="scss"$1');
}

function auditScssEnforcement(
  file: string,
  relPath: string,
  content: string,
  styles: readonly VueSfcBlock[],
  auditor: ComponentStylesAuditor
): void {
  const violatingStyles: VueSfcBlock[] = [];

  for (const style of styles) {
    if (!style.lang || style.lang.toLowerCase() !== 'scss') {
      violatingStyles.push(style);
    }
  }

  if (violatingStyles.length === 0) return;

  if (auditor.isFixActive()) {
    const sorted = [...violatingStyles].sort((a, b) => b.startIndex - a.startIndex);
    let updatedContent = content;

    for (const style of sorted) {
      const openingTag = updatedContent.slice(style.startIndex, style.contentStartIndex);
      const fixedOpeningTag = addOrReplaceLangScss(openingTag);
      updatedContent =
        updatedContent.slice(0, style.startIndex) +
        fixedOpeningTag +
        updatedContent.slice(style.contentStartIndex);
    }

    fs.writeFileSync(file, updatedContent, 'utf-8');
    return;
  }

  for (const style of violatingStyles) {
    const openingTag = content.slice(style.startIndex, style.contentStartIndex).trim();
    auditor.recordViolation(
      {
        file: relPath,
        type: 'banned_plain_css_style',
        message: `<style> block in "${relPath}" does not declare lang="scss". All Vue components must use SCSS.`
      },
      'banned-plain-css-style',
      openingTag,
      style.startLine,
      true
    );
  }
}

function isExemptCssFile(relPath: string, exemptList: readonly string[]): boolean {
  if (!exemptList || exemptList.length === 0) return false;
  const normRel = normalizePosixPath(relPath).toLowerCase();
  const baseName = path.basename(normRel);
  return exemptList.some((item) => {
    const normItem = normalizePosixPath(item).toLowerCase();
    return normRel === normItem || normRel.endsWith(`/${normItem}`) || baseName === normItem;
  });
}

function rewriteCssReferencesInProject(
  projectRoot: string,
  roots: readonly string[],
  renamedPairs: readonly { oldBase: string; newBase: string }[],
  auditor: ComponentStylesAuditor
): void {
  if (renamedPairs.length === 0) return;
  const codeFiles = auditor.collectProjectFiles(
    roots,
    new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.scss', '.css', '.html'])
  );
  const indexHtml = path.resolve(projectRoot, 'index.html');
  if (fs.existsSync(indexHtml) && !codeFiles.includes(indexHtml)) {
    codeFiles.push(indexHtml);
  }
  for (const filePath of codeFiles) {
    tryCatchSync(() => {
      if (!fs.existsSync(filePath)) return;
      let content = fs.readFileSync(filePath, 'utf-8');
      let modified = false;
      for (const { oldBase, newBase } of renamedPairs) {
        const escapedOld = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const refPattern = new RegExp(`(['"\`/(])${escapedOld}(['"\`)\\s;])`, 'g');
        if (refPattern.test(content)) {
          content = content.replace(refPattern, `$1${newBase}$2`);
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
    });
  }
}

function auditRawCssFiles(
  cssFiles: readonly string[],
  projectRoot: string,
  exemptCssFiles: readonly string[],
  auditor: ComponentStylesAuditor
): void {
  const renamedPairs: { oldBase: string; newBase: string }[] = [];
  for (const file of cssFiles) {
    const relPath = toPosixRelative(projectRoot, file);
    if (isExemptCssFile(relPath, exemptCssFiles)) {
      continue;
    }
    if (auditor.isFixActive()) {
      const targetScss = file.slice(0, -4) + '.scss';
      const renameResult = tryCatchSync(() => {
        if (!fs.existsSync(targetScss)) {
          fs.renameSync(file, targetScss);
        } else {
          fs.rmSync(file, { force: true });
        }
      });
      if (renameResult.ok) {
        renamedPairs.push({
          oldBase: path.basename(file),
          newBase: path.basename(targetScss)
        });
        continue;
      }
    }
    auditor.recordViolation(
      {
        file: relPath,
        type: 'banned_raw_css_file',
        message: `Plain CSS file "${relPath}" detected. All stylesheet files must use the SCSS preprocessor (.scss).`
      },
      'banned-raw-css-file',
      relPath,
      1,
      true
    );
  }
  if (auditor.isFixActive() && renamedPairs.length > 0) {
    rewriteCssReferencesInProject(projectRoot, auditor.roots, renamedPairs, auditor);
  }
}

function auditVueComponent(
  file: string,
  projectRoot: string,
  srcDir: string,
  trackScssFile: (p: string) => void,
  config: AuditEngineConfig,
  auditor: ComponentStylesAuditor,
  enforceScss = false
): void {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = toPosixRelative(projectRoot, file);

  const scssMatches = content.matchAll(
    /@(?:use|import|forward)\s+["']([^"']+)["']|src=["']([^"']+\.scss)["']/g
  );
  for (const m of scssMatches) {
    const importTarget = m[1] || m[2];
    if (importTarget) {
      const resolved = resolveSassPath(importTarget, file, srcDir);
      if (resolved) trackScssFile(resolved);
    }
  }

  auditor.runSubAuditorSync('broken-style-link', () => {
    const parsed = parseVueSfc(content);
    for (const style of parsed.styles) {
      const srcPath =
        typeof style.attributes['src'] === 'string' ? style.attributes['src'] : undefined;
      if (srcPath) {
        const resolved = resolveSassPath(srcPath, file, srcDir);
        if (!resolved) {
          auditor.recordViolation(
            {
              file: relPath,
              type: 'broken_style_link',
              message: `Style src points to non-existent file: ${srcPath}`
            },
            'broken-style-link',
            style.rawBlock
          );
        } else {
          trackScssFile(resolved);
        }
      }
    }
  });

  auditor.runSubAuditorSync('banned-style-inherited', () => {
    if (content.includes('style-inherited')) {
      auditor.recordViolation(
        {
          file: relPath,
          type: 'banned_style_inherited',
          message: `Illegal '// ' + 'style-inherited' directive detected. Scoped styles in Vue 3 do not penetrate child components; each SFC must declare or explicitly link its own styles.`
        },
        'banned-style-inherited',
        'style-inherited'
      );
    }
  });

  const sfc = parseVueSfc(content);
  auditor.runSubAuditorSync('ad-hoc-button-styles', () => {
    auditButtonGovernance(relPath, content, sfc.styles, config, auditor);
  });

  auditor.runSubAuditorSync('missing-style-tag', () => {
    const hasValidStyle = checkHasValidStyle(sfc.styles);
    auditMissingStyleTag(relPath, content, hasValidStyle, auditor);
  });

  if (enforceScss) {
    auditor.runSubAuditorSync('banned-plain-css-style', () => {
      auditScssEnforcement(file, relPath, content, sfc.styles, auditor);
    });
  }
}

function auditOrphanedScss(
  stylesRoots: readonly string[],
  scssFiles: readonly string[],
  importedScssFiles: ReadonlySet<string>,
  projectRoot: string,
  auditor: ComponentStylesAuditor
): void {
  const componentScssDirs = stylesRoots.map((sr) => path.resolve(projectRoot, sr, 'components'));
  const componentScssFiles = scssFiles.filter((f) =>
    componentScssDirs.some((dir) => f.startsWith(dir))
  );

  for (const file of componentScssFiles) {
    const normalized = path.normalize(file);
    if (!importedScssFiles.has(normalized)) {
      const relPath = toPosixRelative(projectRoot, file);
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
  private cssCount = 0;

  constructor(options: { projectRoot?: string; roots?: readonly string[]; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const effectiveRoots =
      options.roots ??
      Array.from(
        new Set([
          ...(config.paths.srcRoots ?? []),
          ...(config.paths.componentsRoots ?? []),
          ...(config.paths.viewsRoots ?? []),
          ...(config.paths.stylesRoots ?? [])
        ])
      );

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        COMPONENT_STYLE_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['banned-plain-css-style', 'banned-raw-css-file']
      ),
      fixableRuleIds: ['banned-plain-css-style', 'banned-raw-css-file'],
      fix: options.fix,
      id: 'validate_component_styles',
      name: 'Vue Component Style Linkage & SCSS Auditor',
      description: 'Validates component style links and orphaned SCSS',
      family: 'architecture',
      packageName: 'Styles',
      configKey: 'styles.enabled',
      defaultConfig: { enabled: true, enforceScss: true },
      criticalConfig: {},
      icon: '🎨',
      ruleIds: COMPONENT_STYLE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(COMPONENT_STYLE_RULES, 'hygiene'),
      ruleDescriptions: {
        'broken-style-link': 'Broken or non-existent style link',
        'missing-style-tag': 'Component missing style block',
        'banned-style-inherited': 'Banned style-inherited marker',
        'orphaned-scss': 'Orphaned unused SCSS file',
        'ad-hoc-button-styles': 'Non-standard button class',
        'banned-plain-css-style': '<style> block missing lang="scss"',
        'banned-raw-css-file': 'Raw CSS file without SCSS'
      },
      ruleRemediations: {
        'broken-style-link':
          '📖 REMEDIATION GUIDE: broken-style-link\n' +
          '1. Root Cause: An `@import`, `@use`, or `src="..."` directive in `<style>` points to a non-existent SCSS file on disk.\n' +
          '2. Diagnosis: Check the imported path in the reported component `<style>` block.\n' +
          '3. Canonical Solution: Correct the path to an existing SCSS file or remove the directive if the partial was deleted or refactored.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Broken:    `@use "@/styles/button-old";`\n' +
          '   ✅ Canonical: `@use "@/styles/buttons";`',
        'missing-style-tag':
          '📖 REMEDIATION GUIDE: missing-style-tag\n' +
          '1. Root Cause: A Vue component SFC (`.vue`) completely lacks a `<style lang="scss" scoped>` section. Architectural standards require visual encapsulation in each component.\n' +
          '2. Diagnosis: Open the `.vue` component and verify it has no `<style>` block.\n' +
          '3. Canonical Solution:\n' +
          '   a) Add `<style lang="scss" scoped>` containing component-specific rules.\n' +
          '   b) If purely logical / renderless, add `<style lang="scss" scoped></style>` or extract logic to a composable (`.ts`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Add: `<style lang="scss" scoped>\n.component-root {\n  display: block;\n}\n</style>`',
        'banned-style-inherited':
          '📖 REMEDIATION GUIDE: banned-style-inherited\n' +
          '1. Root Cause: An escape comment was used to bypass local style validation without valid technical justification.\n' +
          '2. Diagnosis: Locate the inherited styles suppression directive in the component.\n' +
          '3. Canonical Solution: Declare corresponding local scoped styles in `<style lang="scss" scoped>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Remove suppression comment and define required scoped rules.',
        'orphaned-scss':
          '📖 REMEDIATION GUIDE: orphaned-scss\n' +
          '1. Root Cause: An SCSS file (`.scss`) was found in source roots that is never imported by any component or global stylesheet (`main.scss` / `index.scss`).\n' +
          '2. Diagnosis: Locate the reported orphaned file.\n' +
          '3. Canonical Solution:\n' +
          '   a) If obsolete: delete the file cleanly.\n' +
          '   b) If intended globally: import it in the primary stylesheet (`@use "...";`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Delete `src/styles/_obsolete-badge.scss`.',
        'ad-hoc-button-styles':
          '📖 REMEDIATION GUIDE: ad-hoc-button-styles\n' +
          '1. Root Cause: An HTML button (`<button>`, `<a class="btn...">`) uses invented variant classes not registered in button governance (`canonicalVariants`).\n' +
          '2. Diagnosis: Check classes applied to the button in the Vue template.\n' +
          '3. Canonical Solution: Use strictly canonical design system variants (`btn-primary`, `btn-secondary`, `btn-dark`, `btn-sm`, etc.).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Ad-hoc:    `<button class="btn my-custom-green-button">`\n' +
          '   ✅ Canonical: `<button class="btn btn-success">`',
        'banned-plain-css-style':
          '📖 REMEDIATION GUIDE: banned-plain-css-style\n' +
          '1. Root Cause: A `<style>` block in a Vue component lacks mandatory `lang="scss"` attribute.\n' +
          '2. Diagnosis: Locate the `<style>` tag in the component.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run auto-fix: `npm run auditor:fix` or `auditor fix` to automatically inject `lang="scss"`.\n' +
          '   b) Or manually edit: `<style lang="scss" scoped>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: `<style>`\n' +
          '   ✅ Correct:   `<style lang="scss" scoped>`',
        'banned-raw-css-file':
          '📖 REMEDIATION GUIDE: banned-raw-css-file\n' +
          '1. Root Cause: A file with `.css` extension was found in source code. Architecture standardizes the SCSS preprocessor for all stylesheets.\n' +
          '2. Diagnosis: Locate the reported `.css` file.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run auto-fix: `npm run auditor:fix` or `auditor fix` to automatically rename the file to `.scss` and update imports.\n' +
          '   b) Or manually rename to `.scss` and update import references.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ CSS:  `src/styles/theme.css`\n' +
          '   ✅ SCSS: `src/styles/theme.scss`'
      },
      coverage: {
        include: deriveCoverageFromRoots(
          effectiveRoots,
          new Set(['.vue', '.scss', '.css']),
          effectiveRoot
        ).include
      },
      roots: effectiveRoots,
      projectRoot: effectiveRoot
    });
  }

  public recordViolation(
    v: ComponentStyleViolation,
    ruleId: ComponentStyleRuleId,
    context: string,
    line = 1,
    fixable = false
  ): void {
    this.collectedViolations.push(v);
    this.addViolation({
      ruleId,
      severity: 'error',
      file: v.file,
      line,
      message: v.message,
      context,
      fixable
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

  public getCssCount(): number {
    return this.cssCount;
  }

  public collectProjectFiles(
    roots: readonly string[],
    extensions: ReadonlySet<string>
  ): string[] {
    return this.context.collectFiles(roots, extensions);
  }

  public override runAudit(): void {
    const config = getAuditConfig(this.projectRoot);
    this.redeclareCoverage({
      include: deriveCoverageFromRoots(
        this.roots,
        new Set(['.vue', '.scss', '.css']),
        this.projectRoot
      ).include
    });
    const srcRoots = config.paths.srcRoots ?? [];
    const srcDir = path.resolve(this.projectRoot, srcRoots[0] ?? 'src');
    const enforceScss = config.styles?.enforceScss !== false;
    const exemptCssFiles = config.styles?.exemptCssFiles ?? [];

    const initialCssFiles = this.context.collectFiles(this.roots, new Set(['.css']));
    if (enforceScss) {
      this.runSubAuditorSync('banned-raw-css-file', () => {
        for (const file of initialCssFiles) {
          this.recordScanned(file);
        }
        auditRawCssFiles(initialCssFiles, this.projectRoot, exemptCssFiles, this);
      });
    } else {
      this.markRuleNotApplicable(
        'banned-plain-css-style',
        'SCSS no está forzado en configuración (styles.enforceScss: false)'
      );
      this.markRuleNotApplicable(
        'banned-raw-css-file',
        'SCSS no está forzado en configuración (styles.enforceScss: false)'
      );
    }

    const vueFiles = this.context.collectFiles(this.roots, new Set(['.vue']));
    const scssFiles = this.context.collectFiles(this.roots, new Set(['.scss']));
    const cssFiles = this.context.collectFiles(this.roots, new Set(['.css']));

    this.vueCount = vueFiles.length;
    this.scssCount = scssFiles.length;
    this.cssCount = cssFiles.length;

    if (vueFiles.length === 0) {
      this.markRuleNotApplicable('broken-style-link', 'No se encontraron componentes .vue');
      this.markRuleNotApplicable('missing-style-tag', 'No se encontraron componentes .vue');
      this.markRuleNotApplicable('banned-style-inherited', 'No se encontraron componentes .vue');
      this.markRuleNotApplicable('ad-hoc-button-styles', 'No se encontraron componentes .vue');
      if (enforceScss) {
        this.markRuleNotApplicable('banned-plain-css-style', 'No se encontraron componentes .vue');
      }
    }

    if (scssFiles.length === 0) {
      this.markRuleNotApplicable('orphaned-scss', 'No se encontraron archivos .scss');
    }

    const { importedScssFiles, trackScssFile } = createScssTracker(srcDir);
    const stylesRoots = config.paths.stylesRoots ?? [];
    seedRootScssGraph(stylesRoots, this.projectRoot, trackScssFile);

    for (const file of vueFiles) {
      this.recordScanned(file);
      auditVueComponent(file, this.projectRoot, srcDir, trackScssFile, config, this, enforceScss);
    }

    for (const file of scssFiles) {
      this.recordScanned(file);
    }

    this.runSubAuditorSync('orphaned-scss', () => {
      auditOrphanedScss(stylesRoots, scssFiles, importedScssFiles, this.projectRoot, this);
    });
  }
}

export function auditComponentStyles(rootDir?: string): ComponentStyleAuditResult {
  const auditor = new ComponentStylesAuditor(rootDir ? { projectRoot: rootDir } : undefined);
  auditor.runAudit();
  return {
    vueComponentsScanned: auditor.getVueCount(),
    scssFilesScanned: auditor.getScssCount(),
    cssFilesScanned: auditor.getCssCount(),
    violations: auditor.getViolations(),
    passed: auditor.getViolations().length === 0
  };
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ComponentStylesAuditor());
