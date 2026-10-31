import { BaseAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export type MarkdownCodeReferenceRuleId = 'markdown-broken-source-ref' | 'markdown-hardcoded-runtime-version' | 'markdown-broken-skill-ref' | 'markdown-case-mismatch' | 'markdown-outdated-project-version';
export declare const MARKDOWN_CODE_REFERENCE_RULES: readonly MarkdownCodeReferenceRuleId[];
export interface MarkdownCodeViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: MarkdownCodeReferenceRuleId;
  readonly message: string;
  readonly context: string;
}
export declare function resolveMarkdownScanDirectories(projectRoot?: string, explicitRoots?: readonly string[]): readonly string[];
export declare const DEFAULT_KNOWN_VALID_ABSTRACT_PATHS: readonly string[];
export declare function getKnownValidAbstractPaths(projectRoot?: string): ReadonlySet<string>;
export declare const KNOWN_VALID_ABSTRACT_PATHS: Set<string>;
export declare function stripCodeBlocks(markdown: string): string;
export declare function checkExactCase(startDir: string, relativePath: string): {
  exists: boolean;
  exactMatch: boolean;
  actualCasing?: string;
};
export declare const TARGET_NODE_MAJOR_VERSION = "26";
export declare const TARGET_NPM_MAJOR_VERSION = "12";
export interface MarkdownCodeReferencesOptions extends FileScanRootsOptions {
  readonly knownValidAbstractPaths?: readonly string[];
}
export declare class MarkdownCodeReferencesAuditor extends BaseAuditor<MarkdownCodeReferenceRuleId> {
  private readonly rootDir;
  private readonly scanRoots;
  private readonly gitIgnoreMatcher;
  private readonly customAbstractPaths?;
  constructor(options?: MarkdownCodeReferencesOptions);
  private scanMarkdownDocReferences;
  runAudit(): Promise<void>;
  repairOutdatedVersionReferences(): void;
  private collectMarkdownFiles;
}