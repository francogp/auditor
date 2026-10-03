/**
 * scripts/auditors/documentation/validate_markdown_code_references.ts
 *
 * MARKDOWN CODE & SCRIPT REFERENCES AUDITOR (Node.js 26+ Native)
 *
 * Validates that all inline source code paths, npm run commands, skill references,
 * and runtime versions referenced across documentation and skills are completely accurate:
 *   1. Broken Source Path References (`markdown-broken-source-ref`): Detects
 *      mentions of `src/...`, `scripts/...`, `supabase/...`, or `tests/...` that
 *      do not resolve to an existent file or directory on disk.
 *   2. Unregistered NPM Scripts (`markdown-unregistered-npm-script`): Detects
 *      mentions of `npm run <cmd>` where `<cmd>` is not registered in `package.json.scripts`.
 *   3. Hardcoded Runtime Versions (`markdown-hardcoded-runtime-version`): Detects
 *      hardcoded runtime version assertions (e.g. `Node >= 26.x`, `npm >= 12.x`)
 *      instead of referencing `package.json` (`engines`) and `.nvmrc`.
 *   4. Broken Skill References (`markdown-broken-skill-ref`): Detects mentions
 *      of `@/<skill-name>` where `<skill-name>` is not a valid skill in `.agents/skills/`.
 *   5. Case Mismatches (`markdown-case-mismatch`): Detects file path or filename
 *      mentions that differ in casing from disk (Linux ext4 case sensitivity violation).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_markdown_code_references.ts
 *   npm run validate:markdown-code-references
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type MarkdownCodeReferenceRuleId = 'markdown-broken-source-ref' | 'markdown-unregistered-npm-script' | 'markdown-hardcoded-runtime-version' | 'markdown-broken-skill-ref' | 'markdown-case-mismatch';
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
    constructor(scanRoots?: readonly string[], rootDir?: string);
    private scanMarkdownFile;
    runAudit(): Promise<void>;
    private collectMarkdownFiles;
}
//# sourceMappingURL=validate_markdown_code_references.d.ts.map