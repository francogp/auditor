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
import { BaseAuditor } from '../../core/auditorBase.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { stripCodeBlocks } from './validate_markdown_code_references.ts';
export { stripCodeBlocks };
export type MarkdownLinkRuleId = 'markdown-broken-relative-link' | 'markdown-absolute-path' | 'markdown-stale-environment-path' | 'markdown-gitignored-target' | 'markdown-broken-workspace-package';
export declare const MARKDOWN_LINK_RULES: readonly MarkdownLinkRuleId[];
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
export { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories } from './validate_markdown_code_references.ts';
export declare const DEFAULT_MARKDOWN_IGNORE_PATTERNS: readonly ["coverage/**"];
export declare function getGitIgnoreMatcher(rootDir: string): GitIgnoreMatcher;
export declare function clearRepoFileIndexCache(): void;
export declare function clearGitIgnoredPathsCache(): void;
/**
 * Collects all relevant markdown files (.md) recursively.
 */
export declare function collectMarkdownFiles(targetPath: string, rootDir: string, extraIgnorePatterns?: readonly string[]): string[];
/**
 * Parses all markdown links in a file and returns broken references or illegal paths.
 */
export declare function checkMarkdownLinksInContent(content: string, filePath: string, rootDir: string): {
    linksChecked: number;
    brokenLinks: BrokenMarkdownLink[];
};
/**
 * Runs the full markdown link audit.
 */
export declare function auditMarkdownLinks(options?: MarkdownLinkAuditOptions): MarkdownLinkAuditResult;
export declare class MarkdownLinkAuditor extends BaseAuditor<MarkdownLinkRuleId> {
    private readonly scanRoots;
    constructor(scanRoots?: readonly string[], projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_markdown_links.d.ts.map