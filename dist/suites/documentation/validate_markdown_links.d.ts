import { BaseAuditor } from "../../core/auditorBase.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories, stripCodeBlocks } from "./validate_markdown_code_references.js";
//#region src/suites/documentation/validate_markdown_links.d.ts
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
export declare const DEFAULT_MARKDOWN_IGNORE_PATTERNS: readonly ["coverage/**"];
export declare function getGitIgnoreMatcher(rootDir: string): GitIgnoreMatcher;
export declare function clearRepoFileIndexCache(): void;
export declare function clearGitIgnoredPathsCache(): void;
/**
 * Collects all relevant markdown files (.md) recursively.
 */
export declare function collectMarkdownFiles(targetPath: string, rootDir: string, extraIgnorePatterns?: readonly string[]): string[];
/**
 * Extracts all markdown links from markdown content outside code blocks.
 */
export declare function extractMarkdownLinks(content: string): MarkdownLinkItem[];
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
//#endregion
export { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories, stripCodeBlocks };