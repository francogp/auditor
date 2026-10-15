/**
 * scripts/auditors/documentation/validate_markdown_links.ts
 *
 * RELATIVE MARKDOWN LINK & DOX INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Scans all documentation (.md), skill manuals (SKILL.md), reference guides,
 * and DOX index files (AGENTS.md) across the codebase.
 *
 * Validates that:
 *   1. All relative links point to existent files/directories on disk.
 *   2. No broken links, miscalculated folder depths, or nonexistent targets exist.
 *   3. No forbidden absolute paths (file://, /home/...) or stale environment references.
 *   4. No links target git-ignored resources (.gitignore).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_markdown_links.ts
 *   npm run validate:markdown-links
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  collectRepositoryFiles,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { buildRepositoryFileIndex, toPosixRelative } from '../../core/safePath.ts';
import {
  resolveMarkdownScanDirectories,
  stripCodeBlocks
} from './validate_markdown_code_references.ts';

export { stripCodeBlocks };

enableCompileCache();

export type MarkdownLinkRuleId =
  | 'markdown-broken-relative-link'
  | 'markdown-absolute-path'
  | 'markdown-stale-environment-path'
  | 'markdown-gitignored-target'
  | 'markdown-broken-workspace-package';

export const MARKDOWN_LINK_RULES: readonly MarkdownLinkRuleId[] = [
  'markdown-broken-relative-link',
  'markdown-absolute-path',
  'markdown-stale-environment-path',
  'markdown-gitignored-target',
  'markdown-broken-workspace-package'
] as const;

export interface BrokenMarkdownLink {
  readonly sourceFile: string;
  readonly linkText: string;
  readonly rawUrl: string;
  readonly resolvedPath: string;
  readonly error: string;
  readonly ruleId?: MarkdownLinkRuleId;
  readonly line?: number;
}

export interface MarkdownLinkItem {
  readonly linkText: string;
  readonly rawUrl: string;
  readonly line: number;
}

export interface ParsedMarkdownDoc {
  readonly file: string;
  readonly relSourceFile: string;
  readonly lines: readonly string[];
  readonly links: readonly MarkdownLinkItem[];
}

export interface MarkdownLinkAuditResult {
  readonly filesScanned: number;
  readonly linksChecked: number;
  readonly violations: readonly BrokenMarkdownLink[];
  readonly passed: boolean;
}

export interface MarkdownLinkAuditOptions {
  readonly rootDir?: string;
  readonly scanPaths?: readonly string[];
  readonly extraIgnorePatterns?: readonly string[];
  readonly summaryOnly?: boolean;
  readonly errorsOnly?: boolean;
  readonly outputFile?: string;
}

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../../..');

export {
  DEFAULT_SCAN_DIRECTORIES,
  resolveMarkdownScanDirectories
} from './validate_markdown_code_references.ts';

export const DEFAULT_MARKDOWN_IGNORE_PATTERNS = ['coverage/**'] as const;

let gitIgnoreMatcherInstance: GitIgnoreMatcher | null = null;

export function getGitIgnoreMatcher(rootDir: string): GitIgnoreMatcher {
  if (!gitIgnoreMatcherInstance) {
    gitIgnoreMatcherInstance = new GitIgnoreMatcher(rootDir);
  }
  return gitIgnoreMatcherInstance;
}

let repoFileIndexCache: Map<string, string[]> | null = null;
let repoFileIndexCacheRoot: string | null = null;

export function clearRepoFileIndexCache(): void {
  repoFileIndexCache = null;
  repoFileIndexCacheRoot = null;
}

export function clearGitIgnoredPathsCache(): void {
  gitIgnoreMatcherInstance = null;
  clearRepoFileIndexCache();
}

function getRepoFileIndex(rootDir: string, matcher: GitIgnoreMatcher): Map<string, string[]> {
  if (repoFileIndexCache && repoFileIndexCacheRoot === rootDir) {
    return repoFileIndexCache;
  }
  const index = buildRepositoryFileIndex(rootDir, (p) => matcher.isIgnored(p));
  repoFileIndexCache = index;
  repoFileIndexCacheRoot = rootDir;
  return index;
}

/**
 * Collects all relevant markdown files (.md) recursively.
 */
export function collectMarkdownFiles(
  targetPath: string,
  rootDir: string,
  extraIgnorePatterns: readonly string[] = DEFAULT_MARKDOWN_IGNORE_PATTERNS
): string[] {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
  if (!fs.existsSync(fullPath)) return [];

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return fullPath.endsWith('.md') ? [fullPath] : [];
  }

  return collectRepositoryFiles(
    fullPath,
    rootDir,
    extraIgnorePatterns,
    new Set(['.md']),
    new Set(['.agents'])
  );
}

/** Regex detecting personal machine absolute paths (e.g. /home/user, /Users/user, C:\Users\user) */
const STALE_ENV_PATH_REGEX =
  /file:\/\/\/(?:home|Users|[a-zA-Z]:)|(?:^|(?<![\w.]))\/(?:home|Users)\/[\w-]+|[a-zA-Z]:[\\/]Users[\\/][\w-]+/;

function isExternalOrAnchorLink(rawUrl: string): boolean {
  return (
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl.startsWith('mailto:') ||
    rawUrl.startsWith('conversation://') ||
    rawUrl.startsWith('#')
  );
}

function resolveLocalMarkdownTarget(docFile: string, rawUrl: string): string | null {
  if (
    isExternalOrAnchorLink(rawUrl) ||
    path.isAbsolute(rawUrl) ||
    /^[a-z]:/i.test(rawUrl) ||
    rawUrl.startsWith('file://')
  ) {
    return null;
  }
  const [rawPath] = rawUrl.split('#');
  let urlPath = rawPath ?? '';
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    // catch-ok
  }
  return urlPath.length > 0 ? path.resolve(path.dirname(docFile), urlPath) : docFile;
}

function formatCandidateMatchError(
  resolvedRelPath: string,
  candidateMatches: readonly string[],
  sourceDir: string,
  rootDir: string
): string {
  if (candidateMatches.length === 0) {
    return `Target path does not exist on disk: "${resolvedRelPath}"`;
  }
  const suggestions = candidateMatches.map((cand) => {
    let rel = toPosixRelative(sourceDir, cand);
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  });
  const foundIn = candidateMatches.map((cand) => toPosixRelative(rootDir, cand)).join(', ');
  return `Target path does not exist on disk: "${resolvedRelPath}", pero aparentemente fue localizado en: "${foundIn}". Verifica si corresponde corregir el enlace a: "${suggestions.join('" o "')}"`;
}

function checkTargetExistence(params: {
  rawUrl: string;
  linkText: string;
  line: number;
  relSourceFile: string;
  filePath: string;
  rootDir: string;
}): BrokenMarkdownLink | null {
  const resolvedTarget = resolveLocalMarkdownTarget(params.filePath, params.rawUrl);
  if (!resolvedTarget) return null;
  const resolvedRelPath = toPosixRelative(params.rootDir, resolvedTarget);

  const matcher = getGitIgnoreMatcher(params.rootDir);

  if (matcher.isIgnored(resolvedTarget)) {
    return {
      sourceFile: params.relSourceFile,
      linkText: params.linkText,
      rawUrl: params.rawUrl,
      resolvedPath: resolvedRelPath,
      error: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
      ruleId: 'markdown-gitignored-target',
      line: params.line
    };
  }

  if (!fs.existsSync(resolvedTarget)) {
    const basename = path.basename(resolvedTarget);
    const repoIndex = getRepoFileIndex(params.rootDir, matcher);
    const candidateMatches = (repoIndex.get(basename) ?? []).filter(
      (cand) => !matcher.isIgnored(cand)
    );
    const error = formatCandidateMatchError(
      resolvedRelPath,
      candidateMatches,
      path.dirname(params.filePath),
      params.rootDir
    );

    return {
      sourceFile: params.relSourceFile,
      linkText: params.linkText,
      rawUrl: params.rawUrl,
      resolvedPath: resolvedRelPath,
      error,
      ruleId: 'markdown-broken-relative-link',
      line: params.line
    };
  }

  return null;
}

function checkSingleMarkdownLink(params: {
  linkText: string;
  rawUrl: string;
  line: number;
  relSourceFile: string;
  filePath: string;
  rootDir: string;
}): { checked: boolean; brokenLink?: BrokenMarkdownLink } {
  const { linkText, rawUrl, line, relSourceFile } = params;

  if (STALE_ENV_PATH_REGEX.test(rawUrl) || STALE_ENV_PATH_REGEX.test(linkText)) {
    return {
      checked: true,
      brokenLink: {
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: '',
        error: `Stale legacy environment path detected: "${rawUrl}" (RULE: No references to legacy repository or personal machine paths)`,
        ruleId: 'markdown-stale-environment-path',
        line
      }
    };
  }

  const isAbsolutePath =
    rawUrl.startsWith('file://') ||
    rawUrl.startsWith('/') ||
    rawUrl.startsWith('\\') ||
    /^[a-z]:/i.test(rawUrl) ||
    path.isAbsolute(rawUrl);

  if (isAbsolutePath) {
    return {
      checked: true,
      brokenLink: {
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: '',
        error: `Forbidden absolute path or file:// URL: "${rawUrl}" (RULE: Use relative paths exclusively)`,
        ruleId: 'markdown-absolute-path',
        line
      }
    };
  }

  if (isExternalOrAnchorLink(rawUrl)) {
    return { checked: false };
  }

  const targetViolation = checkTargetExistence(params);
  return {
    checked: true,
    brokenLink: targetViolation ?? undefined
  };
}

function checkStandaloneTextViolations(
  lines: readonly string[],
  relSourceFile: string,
  brokenLines: ReadonlySet<number>
): BrokenMarkdownLink[] {
  const textViolations: BrokenMarkdownLink[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    const lineNum = i + 1;
    if (brokenLines.has(lineNum)) continue;

    const textWithoutInlineCode = lineText.replace(/`[^`\n]+`/g, '');
    if (STALE_ENV_PATH_REGEX.test(textWithoutInlineCode)) {
      textViolations.push({
        sourceFile: relSourceFile,
        linkText: '',
        rawUrl: lineText.trim(),
        resolvedPath: '',
        error: `Stale legacy environment reference detected in text: "${lineText.trim()}"`,
        ruleId: 'markdown-stale-environment-path',
        line: lineNum
      });
    } else if (/file:\/\/\/[^\s)]+/i.test(textWithoutInlineCode)) {
      textViolations.push({
        sourceFile: relSourceFile,
        linkText: '',
        rawUrl: lineText.trim(),
        resolvedPath: '',
        error: `Forbidden absolute file:// URL detected in text: "${lineText.trim()}"`,
        ruleId: 'markdown-absolute-path',
        line: lineNum
      });
    }
  }

  return textViolations;
}

const HISTORICAL_OR_EXAMPLE_LINE_REGEX =
  /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa]|example|ejemplo)\b|\be\.g\./i;

const isHistoricalOrExampleLine = (lineText: string): boolean =>
  HISTORICAL_OR_EXAMPLE_LINE_REGEX.test(lineText);

function checkPackageMatchViolation(
  match: RegExpExecArray,
  relSourceFile: string,
  filePath: string,
  rootDir: string,
  lineNum: number
): BrokenMarkdownLink | null {
  const pkgSubpath = match[1]!.replace(/[.,:;)\]`'"]+$/, '');
  if (pkgSubpath.includes('*') || pkgSubpath.includes('...') || pkgSubpath.includes('<')) {
    return null;
  }
  const candidateRel = path.join('packages', pkgSubpath);
  const rootTarget = path.resolve(rootDir, candidateRel);
  const localTarget = path.resolve(path.dirname(filePath), candidateRel);

  if (!fs.existsSync(rootTarget) && !fs.existsSync(localTarget)) {
    return {
      sourceFile: relSourceFile,
      linkText: '',
      rawUrl: `packages/${pkgSubpath}`,
      resolvedPath: candidateRel,
      error: `Referencia a workspace package inexistente en disco: "packages/${pkgSubpath}" (RULE: No mantener rutas a paquetes de workspace eliminados)`,
      ruleId: 'markdown-broken-workspace-package',
      line: lineNum
    };
  }
  return null;
}

function checkWorkspacePackageViolations(
  lines: readonly string[],
  relSourceFile: string,
  filePath: string,
  rootDir: string,
  brokenLines: ReadonlySet<number>
): BrokenMarkdownLink[] {
  const violations: BrokenMarkdownLink[] = [];
  const pkgRegex =
    /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([\w.-]+(?:\/[\w./#-]+)?)\/?(?:$|[`'"\s)\]>,:;])/g;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (brokenLines.has(lineNum) || isHistoricalOrExampleLine(lines[i]!)) continue;

    pkgRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pkgRegex.exec(lines[i]!)) !== null) {
      const violation = checkPackageMatchViolation(
        match,
        relSourceFile,
        filePath,
        rootDir,
        lineNum
      );
      if (violation) violations.push(violation);
    }
  }

  return violations;
}

/**
 * Extracts all markdown links from markdown content outside code blocks.
 */
export function extractMarkdownLinks(content: string): MarkdownLinkItem[] {
  const cleanContent = stripCodeBlocks(content);
  const contentWithoutInlineCode = cleanContent.replace(/(`+)[^`\n]+\1/g, (match) =>
    ' '.repeat(match.length)
  );
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const links: MarkdownLinkItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(contentWithoutInlineCode)) !== null) {
    const linkText = match[1]!.trim();
    const rawUrl = match[2]!.trim().replace(/^[`'"]+|[`'"]+$/g, '');
    const line = cleanContent.slice(0, match.index).split('\n').length;
    links.push({ linkText, rawUrl, line });
  }

  return links;
}

/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export function checkMarkdownLinksInContent(
  content: string,
  filePath: string,
  rootDir: string
): { linksChecked: number; brokenLinks: BrokenMarkdownLink[] } {
  const cleanContent = stripCodeBlocks(content);
  const links = extractMarkdownLinks(content);
  const brokenLinks: BrokenMarkdownLink[] = [];
  let linksChecked = 0;
  const relSourceFile = toPosixRelative(rootDir, filePath);

  for (const { linkText, rawUrl, line } of links) {
    const result = checkSingleMarkdownLink({
      linkText,
      rawUrl,
      line,
      relSourceFile,
      filePath,
      rootDir
    });
    if (result.checked) linksChecked++;
    if (result.brokenLink) brokenLinks.push(result.brokenLink);
  }

  const brokenLines = new Set(
    brokenLinks.map((b) => b.line).filter((l): l is number => l !== undefined)
  );
  const standaloneViolations = checkStandaloneTextViolations(
    cleanContent.split('\n'),
    relSourceFile,
    brokenLines
  );
  brokenLinks.push(...standaloneViolations);

  const workspaceViolations = checkWorkspacePackageViolations(
    cleanContent.split('\n'),
    relSourceFile,
    filePath,
    rootDir,
    brokenLines
  );
  brokenLinks.push(...workspaceViolations);

  return { linksChecked, brokenLinks };
}

/**
 * Runs the full markdown link audit.
 */
export function auditMarkdownLinks(
  options: MarkdownLinkAuditOptions = {}
): MarkdownLinkAuditResult {
  const root = options.rootDir ?? DEFAULT_ROOT;
  const scanDirs = options.scanPaths ?? resolveMarkdownScanDirectories(root);
  const extraIgnores = options.extraIgnorePatterns ?? DEFAULT_MARKDOWN_IGNORE_PATTERNS;

  const fileSet = new Set<string>();
  for (const dir of scanDirs) {
    const files = collectMarkdownFiles(dir, root, extraIgnores);
    for (const f of files) fileSet.add(f);
  }

  const allFiles = Array.from(fileSet);
  let totalLinks = 0;
  const violations: BrokenMarkdownLink[] = [];

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { linksChecked, brokenLinks } = checkMarkdownLinksInContent(content, filePath, root);
    totalLinks += linksChecked;
    violations.push(...brokenLinks);
  }

  return {
    filesScanned: allFiles.length,
    linksChecked: totalLinks,
    violations,
    passed: violations.length === 0
  };
}

export class MarkdownLinkAuditor extends BaseAuditor<MarkdownLinkRuleId> {
  private readonly scanRoots: readonly string[];

  constructor(scanRoots?: readonly string[], projectRoot?: string) {
    const effectiveScanRoots = resolveMarkdownScanDirectories(projectRoot, scanRoots);
    const config = getAuditConfig(projectRoot);
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(MARKDOWN_LINK_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_markdown_links',
      name: 'Markdown & DOX Relative Links Auditor',
      description: 'Enlaces relativos y rutas válidas en markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_LINK_RULES,
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🔗',
      ruleDescriptions: {
        'markdown-broken-relative-link': 'Enlace relativo roto',
        'markdown-absolute-path': 'Ruta absoluta prohibida',
        'markdown-stale-environment-path': 'Referencia a entorno obsoleto',
        'markdown-gitignored-target': 'Enlace a ruta ignorada en git',
        'markdown-broken-workspace-package': 'Workspace package inexistente'
      },
      ruleRemediations: {
        'markdown-broken-relative-link':
          'Guía de diagnóstico y remediación para markdown-broken-relative-link. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'markdown-absolute-path':
          'Guía de diagnóstico y remediación para markdown-absolute-path. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'markdown-stale-environment-path':
          'Guía de diagnóstico y remediación para markdown-stale-environment-path. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'markdown-gitignored-target':
          'Guía de diagnóstico y remediación para markdown-gitignored-target. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'markdown-broken-workspace-package':
          'Guía de diagnóstico y remediación para markdown-broken-workspace-package. Revisa la incidencia detectada y ajusta el código correspondiente.'
      },
      coverage: {
        include: ['**/*.md']
      },
      roots: effectiveScanRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: [
        ...DEFAULT_MARKDOWN_IGNORE_PATTERNS,
        ...(config.paths.ignoreGlobs ?? []),
        ...(config.paths.ignoredPatterns ?? [])
      ],
      unignoreDirs: ['.agents'],
      projectRoot
    });
    this.scanRoots = effectiveScanRoots;
  }

  public override async runAudit(): Promise<void> {
    const mdFiles = this.context.collectFiles(this.scanRoots, new Set(['.md']));
    if (mdFiles.length === 0) {
      for (const r of MARKDOWN_LINK_RULES) {
        this.markRuleNotApplicable(r, 'No se encontraron archivos markdown');
      }
      return;
    }

    for (const f of mdFiles) {
      this.recordScanned(f);
    }

    const docs: ParsedMarkdownDoc[] = [];
    let totalLinks = 0;

    for (const filePath of mdFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const cleanContent = stripCodeBlocks(content);
      const links = extractMarkdownLinks(content);
      totalLinks += links.length;

      docs.push({
        file: filePath,
        relSourceFile: toPosixRelative(this.projectRoot, filePath),
        lines: cleanContent.split('\n'),
        links
      });
    }

    const scanDocLines = (
      ruleId: MarkdownLinkRuleId,
      matcherFn: (text: string) => boolean,
      msgFn: (lineText: string) => string
    ) => {
      for (const doc of docs) {
        for (let i = 0; i < doc.lines.length; i++) {
          const lineText = doc.lines[i]!;
          const textWithoutInline = lineText.replace(/`[^`\n]+`/g, '');
          if (matcherFn(textWithoutInline)) {
            this.addViolation({
              ruleId,
              severity: 'error',
              file: doc.relSourceFile,
              line: i + 1,
              message: msgFn(lineText.trim()),
              context: lineText.trim()
            });
          }
        }
      }
    };

    // 1. markdown-absolute-path
    this.runSubAuditorSync('markdown-absolute-path', () => {
      for (const doc of docs) {
        for (const link of doc.links) {
          const isAbsolute =
            link.rawUrl.startsWith('file://') ||
            link.rawUrl.startsWith('/') ||
            link.rawUrl.startsWith('\\') ||
            /^[a-z]:/i.test(link.rawUrl) ||
            path.isAbsolute(link.rawUrl);
          if (isAbsolute) {
            this.addViolation({
              ruleId: 'markdown-absolute-path',
              severity: 'error',
              file: doc.relSourceFile,
              line: link.line,
              message: `Forbidden absolute path or file:// URL: "${link.rawUrl}" (RULE: Use relative paths exclusively)`,
              context: link.rawUrl
            });
          }
        }
      }
      scanDocLines(
        'markdown-absolute-path',
        (text) => /file:\/\/\/[^\s)]+/i.test(text),
        (trimmed) => `Forbidden absolute file:// URL detected in text: "${trimmed}"`
      );
    });

    // 2. markdown-stale-environment-path
    this.runSubAuditorSync('markdown-stale-environment-path', () => {
      for (const doc of docs) {
        for (const link of doc.links) {
          if (STALE_ENV_PATH_REGEX.test(link.rawUrl) || STALE_ENV_PATH_REGEX.test(link.linkText)) {
            this.addViolation({
              ruleId: 'markdown-stale-environment-path',
              severity: 'error',
              file: doc.relSourceFile,
              line: link.line,
              message: `Stale legacy environment path detected: "${link.rawUrl}" (RULE: No references to legacy repository or personal machine paths)`,
              context: link.rawUrl
            });
          }
        }
      }
      scanDocLines(
        'markdown-stale-environment-path',
        (text) => STALE_ENV_PATH_REGEX.test(text),
        (trimmed) => `Stale legacy environment reference detected in text: "${trimmed}"`
      );
    });

    const forEachResolvedLocalLink = (
      callback: (doc: ParsedMarkdownDoc, link: MarkdownLinkItem, resolvedTarget: string) => void
    ) => {
      for (const doc of docs) {
        for (const link of doc.links) {
          const target = resolveLocalMarkdownTarget(doc.file, link.rawUrl);
          if (target) {
            callback(doc, link, target);
          }
        }
      }
    };

    // 3. markdown-gitignored-target
    this.runSubAuditorSync('markdown-gitignored-target', () => {
      const matcher = getGitIgnoreMatcher(this.projectRoot);
      forEachResolvedLocalLink((doc, link, resolvedTarget) => {
        if (matcher.isIgnored(resolvedTarget)) {
          const resolvedRelPath = toPosixRelative(this.projectRoot, resolvedTarget);
          this.addViolation({
            ruleId: 'markdown-gitignored-target',
            severity: 'error',
            file: doc.relSourceFile,
            line: link.line,
            message: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
            context: link.rawUrl
          });
        }
      });
    });

    // 4. markdown-broken-relative-link
    this.runSubAuditorSync('markdown-broken-relative-link', () => {
      const matcher = getGitIgnoreMatcher(this.projectRoot);
      const repoIndex = getRepoFileIndex(this.projectRoot, matcher);
      forEachResolvedLocalLink((doc, link, resolvedTarget) => {
        if (matcher.isIgnored(resolvedTarget)) return;

        if (!fs.existsSync(resolvedTarget)) {
          const resolvedRelPath = toPosixRelative(this.projectRoot, resolvedTarget);
          const basename = path.basename(resolvedTarget);
          const candidateMatches = (repoIndex.get(basename) ?? []).filter(
            (cand) => !matcher.isIgnored(cand)
          );
          const errorMsg = formatCandidateMatchError(
            resolvedRelPath,
            candidateMatches,
            path.dirname(doc.file),
            this.projectRoot
          );

          this.addViolation({
            ruleId: 'markdown-broken-relative-link',
            severity: 'error',
            file: doc.relSourceFile,
            line: link.line,
            message: errorMsg,
            context: link.rawUrl
          });
        }
      });
    });

    // 5. markdown-broken-workspace-package

    this.runSubAuditorSync('markdown-broken-workspace-package', () => {
      const pkgRegex =
        /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([\w.-]+(?:\/[\w./#-]+)?)\/?(?:$|[`'"\s)\]>,:;])/g;
      for (const doc of docs) {
        for (let i = 0; i < doc.lines.length; i++) {
          const lineText = doc.lines[i]!;
          if (isHistoricalOrExampleLine(lineText)) continue;

          pkgRegex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pkgRegex.exec(lineText)) !== null) {
            const violation = checkPackageMatchViolation(
              match,
              doc.relSourceFile,
              doc.file,
              this.projectRoot,
              i + 1
            );
            if (violation) {
              this.addViolation({
                ruleId: 'markdown-broken-workspace-package',
                severity: 'error',
                file: violation.sourceFile,
                line: violation.line ?? 1,
                message: violation.error,
                context: violation.rawUrl
              });
            }
          }
        }
      }
    });

    this.context.setMetric('Markdown files scanned', mdFiles.length);
    this.context.setMetric('Relative links verified', totalLinks);
    this.context.setMetric('Broken link violations', this.getFindings().length);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLinkAuditor());
