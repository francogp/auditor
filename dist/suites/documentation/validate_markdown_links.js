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
import { buildRepositoryFileIndex, toPosixRelative } from "../../core/safePath.js";
import { resolveMarkdownScanDirectories, stripCodeBlocks } from "./validate_markdown_code_references.js";
export { stripCodeBlocks };
enableCompileCache();
export const MARKDOWN_LINK_RULES = [
    'markdown-broken-relative-link',
    'markdown-absolute-path',
    'markdown-stale-environment-path',
    'markdown-gitignored-target',
    'markdown-broken-workspace-package',
];
const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../../..');
export { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories } from "./validate_markdown_code_references.js";
export const DEFAULT_MARKDOWN_IGNORE_PATTERNS = [
    'coverage/**'
];
let gitIgnoreMatcherInstance = null;
export function getGitIgnoreMatcher(rootDir) {
    if (!gitIgnoreMatcherInstance) {
        gitIgnoreMatcherInstance = new GitIgnoreMatcher(rootDir);
    }
    return gitIgnoreMatcherInstance;
}
let repoFileIndexCache = null;
let repoFileIndexCacheRoot = null;
export function clearRepoFileIndexCache() {
    repoFileIndexCache = null;
    repoFileIndexCacheRoot = null;
}
export function clearGitIgnoredPathsCache() {
    gitIgnoreMatcherInstance = null;
    clearRepoFileIndexCache();
}
function getRepoFileIndex(rootDir, matcher) {
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
const STALE_ENV_PATH_REGEX = /file:\/\/\/(?:home|Users|[a-zA-Z]:)|(?:^|(?<![\w.]))\/(?:home|Users)\/[\w-]+|[a-zA-Z]:[\\/]Users[\\/][\w-]+/;
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
                let rel = toPosixRelative(sourceDir, cand);
                if (!rel.startsWith('.'))
                    rel = './' + rel;
                return rel;
            });
            const foundIn = candidateMatches.map(cand => toPosixRelative(params.rootDir, cand)).join(', ');
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
const HISTORICAL_OR_EXAMPLE_LINE_REGEX = /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa]|example|ejemplo)\b|\be\.g\./i;
function isHistoricalOrExampleLine(lineText) {
    return HISTORICAL_OR_EXAMPLE_LINE_REGEX.test(lineText);
}
function checkPackageMatchViolation(match, relSourceFile, filePath, rootDir, lineNum) {
    const pkgSubpath = match[1].replace(/[.,:;)\]`'"]+$/, '');
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
            line: lineNum,
        };
    }
    return null;
}
function checkWorkspacePackageViolations(lines, relSourceFile, filePath, rootDir, brokenLines) {
    const violations = [];
    const pkgRegex = /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([\w.-]+(?:\/[\w./#-]+)?)\/?(?:$|[`'"\s)\]>,:;])/g;
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        if (brokenLines.has(lineNum) || isHistoricalOrExampleLine(lines[i]))
            continue;
        pkgRegex.lastIndex = 0;
        let match;
        while ((match = pkgRegex.exec(lines[i])) !== null) {
            const violation = checkPackageMatchViolation(match, relSourceFile, filePath, rootDir, lineNum);
            if (violation)
                violations.push(violation);
        }
    }
    return violations;
}
/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export function checkMarkdownLinksInContent(content, filePath, rootDir) {
    const cleanContent = stripCodeBlocks(content);
    const contentWithoutInlineCode = cleanContent.replace(/(`+)[^`\n]+\1/g, match => ' '.repeat(match.length));
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const brokenLinks = [];
    let linksChecked = 0;
    let match;
    const relSourceFile = toPosixRelative(rootDir, filePath);
    while ((match = linkRegex.exec(contentWithoutInlineCode)) !== null) {
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
    const workspaceViolations = checkWorkspacePackageViolations(cleanContent.split('\n'), relSourceFile, filePath, rootDir, brokenLines);
    brokenLinks.push(...workspaceViolations);
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
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: false,
                md: true,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            id: 'validate_markdown_links',
            name: 'Markdown & DOX Relative Links Auditor',
            description: 'Enlaces relativos y rutas válidas en markdown',
            family: 'documentation',
            ruleIds: MARKDOWN_LINK_RULES,
            packageName: 'Doc',
            configKey: 'documentation.enabled',
            defaultConfig: { enabled: true },
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
    async runAudit() {
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
//# sourceMappingURL=validate_markdown_links.js.map