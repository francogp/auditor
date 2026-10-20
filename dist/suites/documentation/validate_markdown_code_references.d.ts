import { BaseAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
//#region src/suites/documentation/validate_markdown_code_references.d.ts
export type MarkdownCodeReferenceRuleId = 'markdown-broken-source-ref' | 'markdown-hardcoded-runtime-version' | 'markdown-broken-skill-ref' | 'markdown-case-mismatch' | 'markdown-outdated-project-version';
export declare const MARKDOWN_CODE_REFERENCE_RULES: readonly MarkdownCodeReferenceRuleId[];
export interface MarkdownCodeViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: MarkdownCodeReferenceRuleId;
  readonly message: string;
  readonly context: string;
}
export declare const DEFAULT_SCAN_DIRECTORIES: readonly [".agents/skills", "AGENTS.md", "README.md", "docs", "src", "tests", "scripts"];
export declare function resolveMarkdownScanDirectories(projectRoot?: string, explicitRoots?: readonly string[]): readonly string[];
export declare const DEFAULT_KNOWN_VALID_ABSTRACT_PATHS: readonly ["scripts/tests", "scripts/.cache/", "scripts/setup/plugins/", "scripts/setup/plugins/01_deploy_env.sh", "scripts/setup/plugins/01_deploy_env.ps1", "scripts/auditors/"];
export declare function getKnownValidAbstractPaths(projectRoot?: string): ReadonlySet<string>;
export declare const KNOWN_VALID_ABSTRACT_PATHS: Set<"scripts/tests" | "scripts/.cache/" | "scripts/setup/plugins/" | "scripts/setup/plugins/01_deploy_env.sh" | "scripts/setup/plugins/01_deploy_env.ps1" | "scripts/auditors/">;
export declare function stripCodeBlocks(markdown: string): string;
export declare function checkExactCase(startDir: string, relativePath: string): {
  exists: boolean;
  exactMatch: boolean;
  actualCasing?: string;
};
export declare const TARGET_NODE_MAJOR_VERSION = "26";
export declare const TARGET_NPM_MAJOR_VERSION = "12";
export declare class MarkdownCodeReferencesAuditor extends BaseAuditor<MarkdownCodeReferenceRuleId> {
  private readonly rootDir;
  private readonly scanRoots;
  private readonly gitIgnoreMatcher;
  constructor(options?: FileScanRootsOptions);
  private scanMarkdownDocReferences;
  runAudit(): Promise<void>;
  private collectMarkdownFiles;
}
//#endregion