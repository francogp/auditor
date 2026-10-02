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
import { BaseAuditor, collectRepositoryFiles } from "../../core/auditorBase.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { resolveMarkdownScanDirectories, stripCodeBlocks } from "./validate_markdown_code_references.js";
export { stripCodeBlocks };
enableCompileCache();
export const MARKDOWN_LINK_RULES = [
    'markdown-broken-relative-link',
    'markdown-absolute-path',
    'markdown-stale-environment-path',
    'markdown-gitignored-target',
];
const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../../..');
export { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories } from "./validate_markdown_code_references.js";
export const DEFAULT_MARKDOWN_IGNORE_PATTERNS = [
    'coverage/**'
];
let gitIgnoredPathsCache = null;
let gitIgnoreMatcherInstance = null;
export function getGitIgnoreMatcher(rootDir) {
    if (!gitIgnoreMatcherInstance) {
        gitIgnoreMatcherInstance = new GitIgnoreMatcher(rootDir);
    }
    return gitIgnoreMatcherInstance;
}
export function getGitIgnoredPaths(rootDir) {
    if (gitIgnoredPathsCache)
        return gitIgnoredPathsCache;
    const paths = new Set();
    try {
        const gitignoreRaw = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf-8');
        for (const line of gitignoreRaw.split('\n')) {
            const trimmed = line.trim().replace(/\/$/, '');
            if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?'))
                continue;
            paths.add(path.resolve(rootDir, trimmed));
        }
    }
    catch {
        // catch-ok: no .gitignore found
    }
    gitIgnoredPathsCache = paths;
    return paths;
}
export function clearGitIgnoredPathsCache() {
    gitIgnoredPathsCache = null;
    gitIgnoreMatcherInstance = null;
}
/**
 * Collects all relevant markdown files (.md) recursively.
 */
export function collectMarkdownFiles(targetPath, rootDir, extraIgnorePatterns = DEFAULT_MARKDOWN_IGNORE_PATTERNS) {
    const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
    if (!fs.existsSync(fullPath))
        return [];
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
        return fullPath.endsWith('.md') ? [fullPath] : [];
    }
    return collectRepositoryFiles(fullPath, rootDir, extraIgnorePatterns, new Set(['.md']), new Set(['.agents']));
}
/** Regex detecting personal machine absolute paths (e.g. /home/user, /Users/user, C:\Users\user) */
const STALE_ENV_PATH_REGEX = /(?:file:\/\/\/(?:home|Users|[a-zA-Z]:)|(?:^|(?<![a-zA-Z0-9_.]))\/(?:home|Users)\/[a-zA-Z0-9_-]+|[a-zA-Z]:[\\/]Users[\\/][a-zA-Z0-9_-]+)/;
function isExternalOrAnchorLink(rawUrl) {
    return (rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('mailto:') ||
        rawUrl.startsWith('conversation://') ||
        rawUrl.startsWith('#'));
}
function checkTargetExistence(params) {
    const [rawUrlPath] = params.rawUrl.split('#');
    let urlPath = rawUrlPath ?? '';
    try {
        urlPath = decodeURIComponent(urlPath);
    }
    catch {
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
        return {
            sourceFile: params.relSourceFile,
            linkText: params.linkText,
            rawUrl: params.rawUrl,
            resolvedPath: resolvedRelPath,
            error: `Target path does not exist on disk: "${resolvedRelPath}"`,
            ruleId: 'markdown-broken-relative-link',
            line: params.line,
        };
    }
    return null;
}
function checkSingleMarkdownLink(params) {
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
    const isAbsolutePath = rawUrl.startsWith('file://') ||
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
function checkStandaloneTextViolations(lines, relSourceFile, brokenLines) {
    const textViolations = [];
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const lineNum = i + 1;
        if (brokenLines.has(lineNum))
            continue;
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
        }
        else if (/file:\/\/\/[^\s)]+/i.test(textWithoutInlineCode)) {
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
/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export function checkMarkdownLinksInContent(content, filePath, rootDir) {
    const cleanContent = stripCodeBlocks(content);
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const brokenLinks = [];
    let linksChecked = 0;
    let match;
    const relSourceFile = path.relative(rootDir, filePath).replace(/\\/g, '/');
    while ((match = linkRegex.exec(cleanContent)) !== null) {
        const linkText = match[1].trim();
        const rawUrl = match[2].trim().replace(/^[`'"]+|[`'"]+$/g, '');
        const line = cleanContent.slice(0, match.index).split('\n').length;
        const result = checkSingleMarkdownLink({
            linkText,
            rawUrl,
            line,
            relSourceFile,
            filePath,
            rootDir
        });
        if (result.checked)
            linksChecked++;
        if (result.brokenLink)
            brokenLinks.push(result.brokenLink);
    }
    const brokenLines = new Set(brokenLinks.map(b => b.line).filter((l) => l !== undefined));
    const standaloneViolations = checkStandaloneTextViolations(cleanContent.split('\n'), relSourceFile, brokenLines);
    brokenLinks.push(...standaloneViolations);
    return { linksChecked, brokenLinks };
}
/**
 * Runs the full markdown link audit.
 */
export function auditMarkdownLinks(options = {}) {
    const root = options.rootDir ?? DEFAULT_ROOT;
    const scanDirs = options.scanPaths ?? resolveMarkdownScanDirectories(root);
    const extraIgnores = options.extraIgnorePatterns ?? DEFAULT_MARKDOWN_IGNORE_PATTERNS;
    const fileSet = new Set();
    for (const dir of scanDirs) {
        const files = collectMarkdownFiles(dir, root, extraIgnores);
        for (const f of files)
            fileSet.add(f);
    }
    const allFiles = Array.from(fileSet);
    let totalLinks = 0;
    const violations = [];
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
export class MarkdownLinkAuditor extends BaseAuditor {
    scanRoots;
    constructor(scanRoots, projectRoot) {
        const effectiveScanRoots = resolveMarkdownScanDirectories(projectRoot, scanRoots);
        const config = getAuditConfig(projectRoot);
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
    async runAudit() {
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
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLinkAuditor());
//# sourceMappingURL=validate_markdown_links.js.map