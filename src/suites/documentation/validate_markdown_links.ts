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

enableCompileCache();

export type MarkdownLinkRuleId =
  | 'markdown-broken-relative-link'
  | 'markdown-absolute-path'
  | 'markdown-stale-environment-path'
  | 'markdown-gitignored-target';

export const MARKDOWN_LINK_RULES: readonly MarkdownLinkRuleId[] = [
  'markdown-broken-relative-link',
  'markdown-absolute-path',
  'markdown-stale-environment-path',
  'markdown-gitignored-target',
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

export const DEFAULT_SCAN_DIRECTORIES = [
  '.agents/skills',
  'AGENTS.md',
  'README.md',
  'src',
  'tests',
  'scripts',
  'supabase',
] as const;

export const DEFAULT_MARKDOWN_IGNORE_PATTERNS = [
  'supabase/docker/**',
  'supabase/generated/**',
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
    // no .gitignore found
  }
  gitIgnoredPathsCache = paths;
  return paths;
}

export function clearGitIgnoredPathsCache(): void {
  gitIgnoredPathsCache = null;
  gitIgnoreMatcherInstance = null;
}

/**
 * Strips fenced code blocks so markdown examples inside ``` blocks are not parsed as active links.
 * Preserves line numbers by inserting empty lines.
 * Crucially DOES NOT strip inline code backticks, allowing links like [`/skill`](url) to retain their text.
 */
export function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, match => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
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

/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export function checkMarkdownLinksInContent(
  content: string,
  filePath: string,
  rootDir: string,
): { linksChecked: number; brokenLinks: BrokenMarkdownLink[] } {
  const cleanContent = stripCodeBlocks(content);
  // Match [link text](rawUrl) where link text can be anything (including backticks)
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const brokenLinks: BrokenMarkdownLink[] = [];
  let linksChecked = 0;
  let match: RegExpExecArray | null;
  const relSourceFile = path.relative(rootDir, filePath).replace(/\\/g, '/');

  while ((match = linkRegex.exec(cleanContent)) !== null) {
    const linkText = match[1]!.trim();
    let rawUrl = match[2]!.trim();
    const line = cleanContent.slice(0, match.index).split('\n').length;

    // Clean wrapping backticks or quotes in rawUrl if present
    rawUrl = rawUrl.replace(/^[`'"]+|[`'"]+$/g, '');

    // Check for personal machine environment paths in link URL or text
    const STALE_ENV_PATH_REGEX = /(?:\/home\/[a-zA-Z0-9_-]+|[a-zA-Z]:[\\/]Users[\\/][a-zA-Z0-9_-]+|\/Users\/[a-zA-Z0-9_-]+)/i;
    if (
      STALE_ENV_PATH_REGEX.test(rawUrl) ||
      STALE_ENV_PATH_REGEX.test(linkText)
    ) {
      linksChecked++;
      brokenLinks.push({
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: '',
        error: `Stale legacy environment path detected: "${rawUrl}" (RULE: No references to legacy repository or personal machine paths)`,
        ruleId: 'markdown-stale-environment-path',
        line,
      });
      continue;
    }

    // Check for prohibited absolute paths or file:// URLs
    const isAbsolutePath =
      rawUrl.startsWith('file://') ||
      rawUrl.startsWith('/') ||
      rawUrl.startsWith('\\') ||
      /^[a-zA-Z]:/.test(rawUrl) ||
      path.isAbsolute(rawUrl);

    if (isAbsolutePath) {
      linksChecked++;
      brokenLinks.push({
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: '',
        error: `Forbidden absolute path or file:// URL: "${rawUrl}" (RULE: Use relative paths exclusively)`,
        ruleId: 'markdown-absolute-path',
        line,
      });
      continue;
    }

    // Skip external protocols and specialized schemes
    if (
      rawUrl.startsWith('http://') ||
      rawUrl.startsWith('https://') ||
      rawUrl.startsWith('mailto:') ||
      rawUrl.startsWith('conversation://') ||
      rawUrl.startsWith('#')
    ) {
      continue;
    }

    linksChecked++;
    const [rawUrlPath] = rawUrl.split('#');
    let urlPath = rawUrlPath ?? '';
    try {
      urlPath = decodeURIComponent(urlPath);
    } catch {
      // keep raw if decode fails
    }

    const resolvedTarget =
      urlPath.length > 0 ? path.resolve(path.dirname(filePath), urlPath) : filePath;

    const resolvedRelPath = path.relative(rootDir, resolvedTarget).replace(/\\/g, '/');

    // Check if target path is gitignored (.gitignore)
    const matcher = getGitIgnoreMatcher(rootDir);
    const isGitIgnored = matcher.isIgnored(resolvedTarget);

    if (isGitIgnored) {
      brokenLinks.push({
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: resolvedRelPath,
        error: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
        ruleId: 'markdown-gitignored-target',
        line,
      });
      continue;
    }

    // Check if target file or directory exists on disk
    if (!fs.existsSync(resolvedTarget)) {
      brokenLinks.push({
        sourceFile: relSourceFile,
        linkText,
        rawUrl,
        resolvedPath: resolvedRelPath,
        error: `Target path does not exist on disk: "${resolvedRelPath}"`,
        ruleId: 'markdown-broken-relative-link',
        line,
      });
    }
  }

  // Scan unescaped text outside code blocks for standalone stale paths or file:// references
  const lines = cleanContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    const lineNum = i + 1;
    if (brokenLinks.some(b => b.line === lineNum)) continue;

    const textWithoutInlineCode = lineText.replace(/`[^`\n]+`/g, '');

    if (/(?:\/home\/[a-zA-Z0-9_-]+|[a-zA-Z]:[\\/]Users[\\/][a-zA-Z0-9_-]+|\/Users\/[a-zA-Z0-9_-]+)/i.test(textWithoutInlineCode)) {
      brokenLinks.push({
        sourceFile: relSourceFile,
        linkText: '',
        rawUrl: lineText.trim(),
        resolvedPath: '',
        error: `Stale legacy environment reference detected in text: "${lineText.trim()}"`,
        ruleId: 'markdown-stale-environment-path',
        line: lineNum,
      });
    } else if (/file:\/\/\/[^\s)]+/i.test(textWithoutInlineCode)) {
      brokenLinks.push({
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

  return { linksChecked, brokenLinks };
}

/**
 * Runs the full markdown link audit.
 */
export function auditMarkdownLinks(options: MarkdownLinkAuditOptions = {}): MarkdownLinkAuditResult {
  const root = options.rootDir ?? DEFAULT_ROOT;
  const scanDirs = options.scanPaths ?? DEFAULT_SCAN_DIRECTORIES;
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

  constructor(scanRoots: readonly string[] = DEFAULT_SCAN_DIRECTORIES, projectRoot?: string) {
    super({
      id: 'validate_markdown_links',
      name: 'Markdown & DOX Relative Links Auditor',
      description: 'Enlaces relativos y rutas válidas en markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_LINK_RULES,
      packageName: 'Doc',
      ruleDescriptions: {
        'markdown-broken-relative-link': 'Enlace relativo roto',
        'markdown-absolute-path': 'Ruta absoluta prohibida',
        'markdown-stale-environment-path': 'Referencia a entorno obsoleto',
        'markdown-gitignored-target': 'Enlace a ruta ignorada en git',
      },
      roots: scanRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: DEFAULT_MARKDOWN_IGNORE_PATTERNS,
      unignoreDirs: ['.agents'],
      projectRoot,
    });
    this.scanRoots = scanRoots;
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Collecting markdown files...');
    const result = auditMarkdownLinks({
      scanPaths: this.scanRoots,
      rootDir: this.projectRoot,
      extraIgnorePatterns: this.extraIgnorePatterns
    });
    this.filesScannedCount = result.filesScanned;

    this.context.logStep(2, 2, 'Verifying relative links and paths...');
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
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MarkdownLinkAuditor());
}
