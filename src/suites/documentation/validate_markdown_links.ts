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
import { BaseAuditor, collectRepositoryFiles } from '../../core/auditorBase.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { buildRepositoryFileIndex } from '../../core/safePath.ts';
import { resolveMarkdownScanDirectories, stripCodeBlocks } from './validate_markdown_code_references.ts';

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
  'markdown-broken-workspace-package',
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

export const DEFAULT_MARKDOWN_IGNORE_PATTERNS = [
  'coverage/**'
] as const;

let gitIgnoredPathsCache: Set<string> | null = null;
let gitIgnoreMatcherInstance: GitIgnoreMatcher | null = null;

export function getGitIgnoreMatcher(rootDir: string): GitIgnoreMatcher {
  if (!gitIgnoreMatcherInstance) {
    gitIgnoreMatcherInstance = new GitIgnoreMatcher(rootDir);
  }
  return gitIgnoreMatcherInstance;
}

export function getGitIgnoredPaths(rootDir: string): Set<string> {
  if (gitIgnoredPathsCache) return gitIgnoredPathsCache;
  const paths = new Set<string>();
  try {
    const gitignoreRaw = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf-8');
    for (const line of gitignoreRaw.split('\n')) {
      const trimmed = line.trim().replace(/\/$/, '');
      if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?')) continue;
      paths.add(path.resolve(rootDir, trimmed));
    }
  } catch {
    // catch-ok: no .gitignore found
  }
  gitIgnoredPathsCache = paths;
  return paths;
}

let repoFileIndexCache: Map<string, string[]> | null = null;
let repoFileIndexCacheRoot: string | null = null;

export function clearRepoFileIndexCache(): void {
  repoFileIndexCache = null;
  repoFileIndexCacheRoot = null;
}

export function clearGitIgnoredPathsCache(): void {
  gitIgnoredPathsCache = null;
  gitIgnoreMatcherInstance = null;
  clearRepoFileIndexCache();
}

function getRepoFileIndex(rootDir: string, matcher: GitIgnoreMatcher): Map<string, string[]> {
  if (repoFileIndexCache && repoFileIndexCacheRoot === rootDir) {
    return repoFileIndexCache;
  }
  const index = buildRepositoryFileIndex(rootDir, p => matcher.isIgnored(p));
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
const STALE_ENV_PATH_REGEX = /(?:file:\/\/\/(?:home|Users|[a-zA-Z]:)|(?:^|(?<![a-zA-Z0-9_.]))\/(?:home|Users)\/[a-zA-Z0-9_-]+|[a-zA-Z]:[\\/]Users[\\/][a-zA-Z0-9_-]+)/;

function isExternalOrAnchorLink(rawUrl: string): boolean {
  return (
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl.startsWith('mailto:') ||
    rawUrl.startsWith('conversation://') ||
    rawUrl.startsWith('#')
  );
}

function checkTargetExistence(params: {
  rawUrl: string;
  linkText: string;
  line: number;
  relSourceFile: string;
  filePath: string;
  rootDir: string;
}): BrokenMarkdownLink | null {
  const [rawUrlPath] = params.rawUrl.split('#');
  let urlPath = rawUrlPath ?? '';
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    // catch-ok: keep raw if decode fails
  }

  const resolvedTarget = urlPath.length > 0 ? path.resolve(path.dirname(params.filePath), urlPath) : params.filePath;
  const resolvedRelPath = path.relative(params.rootDir, resolvedTarget).replace(/\\/g, '/');

  const matcher = getGitIgnoreMatcher(params.rootDir);
  if (matcher.isIgnored(resolvedTarget)) {
    return {
      sourceFile: params.relSourceFile,
      linkText: params.linkText,
      rawUrl: params.rawUrl,
      resolvedPath: resolvedRelPath,
      error: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
      ruleId: 'markdown-gitignored-target',
      line: params.line,
    };
  }

  if (!fs.existsSync(resolvedTarget)) {
    const basename = path.basename(resolvedTarget);
    const repoIndex = getRepoFileIndex(params.rootDir, matcher);
    const candidateMatches = (repoIndex.get(basename) ?? []).filter(cand => !matcher.isIgnored(cand));

    let error = `Target path does not exist on disk: "${resolvedRelPath}"`;

    if (candidateMatches.length > 0) {
      const sourceDir = path.dirname(params.filePath);
      const suggestions = candidateMatches.map(cand => {
        let rel = path.relative(sourceDir, cand).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = './' + rel;
        return rel;
      });
      const foundIn = candidateMatches.map(cand => path.relative(params.rootDir, cand).replace(/\\/g, '/')).join(', ');
      error = `Target path does not exist on disk: "${resolvedRelPath}", pero aparentemente fue localizado en: "${foundIn}". Verifica si corresponde corregir el enlace a: "${suggestions.join('" o "')}"`;
    }

    return {
      sourceFile: params.relSourceFile,
      linkText: params.linkText,
      rawUrl: params.rawUrl,
      resolvedPath: resolvedRelPath,
      error,
      ruleId: 'markdown-broken-relative-link',
      line: params.line,
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
        line,
      }
    };
  }

  const isAbsolutePath =
    rawUrl.startsWith('file://') ||
    rawUrl.startsWith('/') ||
    rawUrl.startsWith('\\') ||
    /^[a-zA-Z]:/.test(rawUrl) ||
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
        line,
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
        line: lineNum,
      });
    } else if (/file:\/\/\/[^\s)]+/i.test(textWithoutInlineCode)) {
      textViolations.push({
        sourceFile: relSourceFile,
        linkText: '',
        rawUrl: lineText.trim(),
        resolvedPath: '',
        error: `Forbidden absolute file:// URL detected in text: "${lineText.trim()}"`,
        ruleId: 'markdown-absolute-path',
        line: lineNum,
      });
    }
  }

  return textViolations;
}

function checkWorkspacePackageViolations(
  lines: readonly string[],
  relSourceFile: string,
  filePath: string,
  rootDir: string,
  brokenLines: ReadonlySet<number>
): BrokenMarkdownLink[] {
  const violations: BrokenMarkdownLink[] = [];
  const pkgRegex = /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_./#-]+)?)(?:\/)?(?:$|[`'"\s)\]>,:;])/g;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    const lineNum = i + 1;
    if (brokenLines.has(lineNum)) continue;

    if (/\b(migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa]|example|ejemplo)\b/i.test(lineText) || /(?:\be\.g\.)/i.test(lineText)) {
      continue;
    }

    let match: RegExpExecArray | null;
    pkgRegex.lastIndex = 0;
    while ((match = pkgRegex.exec(lineText)) !== null) {
      const pkgSubpath = match[1]!.replace(/[.,:;)\]`'"]+$/, '');
      if (pkgSubpath.includes('*') || pkgSubpath.includes('...') || pkgSubpath.includes('<')) {
        continue;
      }
      const candidateRel = path.join('packages', pkgSubpath);
      const rootTarget = path.resolve(rootDir, candidateRel);
      const localTarget = path.resolve(path.dirname(filePath), candidateRel);

      if (!fs.existsSync(rootTarget) && !fs.existsSync(localTarget)) {
        violations.push({
          sourceFile: relSourceFile,
          linkText: '',
          rawUrl: `packages/${pkgSubpath}`,
          resolvedPath: candidateRel,
          error: `Referencia a workspace package inexistente en disco: "packages/${pkgSubpath}" (RULE: No mantener rutas a paquetes de workspace eliminados)`,
          ruleId: 'markdown-broken-workspace-package',
          line: lineNum,
        });
      }
    }
  }

  return violations;
}

/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export function checkMarkdownLinksInContent(
  content: string,
  filePath: string,
  rootDir: string,
): { linksChecked: number; brokenLinks: BrokenMarkdownLink[] } {
  const cleanContent = stripCodeBlocks(content);
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const brokenLinks: BrokenMarkdownLink[] = [];
  let linksChecked = 0;
  let match: RegExpExecArray | null;
  const relSourceFile = path.relative(rootDir, filePath).replace(/\\/g, '/');

  while ((match = linkRegex.exec(cleanContent)) !== null) {
    const linkText = match[1]!.trim();
    const rawUrl = match[2]!.trim().replace(/^[`'"]+|[`'"]+$/g, '');
    const line = cleanContent.slice(0, match.index).split('\n').length;

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
    brokenLinks.map(b => b.line).filter((l): l is number => l !== undefined)
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
export function auditMarkdownLinks(options: MarkdownLinkAuditOptions = {}): MarkdownLinkAuditResult {
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
    passed: violations.length === 0,
  };
}

export class MarkdownLinkAuditor extends BaseAuditor<MarkdownLinkRuleId> {
private readonly scanRoots: readonly string[];

  constructor(scanRoots?: readonly string[], projectRoot?: string) {
    const effectiveScanRoots = resolveMarkdownScanDirectories(projectRoot, scanRoots);
    const config = getAuditConfig(projectRoot);
    super({
      capabilities: { md: true },
      id: 'validate_markdown_links',
      name: 'Markdown & DOX Relative Links Auditor',
      description: 'Enlaces relativos y rutas válidas en markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_LINK_RULES,
      packageName: 'Doc',
      icon: '🔗',
      ruleDescriptions: {
        'markdown-broken-relative-link': 'Enlace relativo roto',
        'markdown-absolute-path': 'Ruta absoluta prohibida',
        'markdown-stale-environment-path': 'Referencia a entorno obsoleto',
        'markdown-gitignored-target': 'Enlace a ruta ignorada en git',
        'markdown-broken-workspace-package': 'Workspace package inexistente',
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
      projectRoot,
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
      for (const r of MARKDOWN_LINK_RULES) {
        this.markRuleEvaluated(r);
      }
    }

    const result = auditMarkdownLinks({
      scanPaths: this.scanRoots,
      rootDir: this.projectRoot,
      extraIgnorePatterns: this.extraIgnorePatterns
    });

    for (const v of result.violations) {
      this.addViolation({
        ruleId: v.ruleId ?? 'markdown-broken-relative-link',
        severity: 'error',
        file: v.sourceFile,
        line: v.line ?? 1,
        message: v.error,
        context: v.rawUrl,
      });
    }

    this.context.setMetric('Markdown files scanned', result.filesScanned);
    this.context.setMetric('Relative links verified', result.linksChecked);
    this.context.setMetric('Broken link violations', result.violations.length);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLinkAuditor());
