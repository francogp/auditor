/**
 * src/suites/architecture/validate_script_extensions.ts
 *
 * SCRIPT & MODULE EXTENSIONS VALIDATOR (Node.js 26+ Native)
 *
 * Enforces canonical TypeScript (.ts) extensions across all project scripts, tools, and modules.
 * Detects and prohibits legacy .mjs and .cjs files, as well as unmigrated .js in scripts directories.
 * In --fix mode, automatically migrates files to .ts, renames them on disk, rewrites relative
 * import statements across the codebase, and updates package.json scripts.
 */
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
import { type AuditEngineConfig } from '../../core/auditConfig.ts';
export declare const SCRIPT_EXTENSIONS_RULES: readonly ["banned-mjs-extension", "banned-cjs-extension", "banned-raw-js-script"];
export type ScriptExtensionsRuleId = (typeof SCRIPT_EXTENSIONS_RULES)[number];
export interface ScriptViolationInfo {
    readonly file: string;
    readonly fullPath: string;
    readonly ruleId: ScriptExtensionsRuleId;
    readonly message: string;
    readonly targetTsPath: string;
}
export declare function isCanonicalConfigExempt(relPath: string): boolean;
export declare function isExemptScriptFile(relPath: string, exemptList?: readonly string[]): boolean;
export declare function resolveScriptAndCliDirs(config: AuditEngineConfig): string[];
export declare class ValidateScriptExtensionsAuditor extends BaseAuditor<ScriptExtensionsRuleId> {
    constructor(options?: Partial<AuditorOptions<ScriptExtensionsRuleId>>);
    runAudit(): Promise<void>;
    private collectCandidateFiles;
    private executeFixes;
    private rewriteImportReferences;
    private rewritePackageJsonScripts;
}
//# sourceMappingURL=validate_script_extensions.d.ts.map