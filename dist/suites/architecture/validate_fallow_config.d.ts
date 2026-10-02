/**
 * scripts/auditors/architecture/validate_fallow_config.ts
 *
 * FALLOW CONFIGURATION & EXPORTS HYGIENE AUDITOR (Node.js 26+)
 *
 * Enforces the integrity of .fallowrc.json:
 *   1. Prohibits banned blanket entry globs (e.g. src/components/**) that suppress dead code.
 *   2. Guarantees that 100% of files listed in ignoreExports actually exist on disk.
 *   3. Guarantees that 100% of symbols in ignoreExports are legitimately exported in their files.
 *   4. Flags duplicate entries and empty export lists.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type FallowConfigRuleId = 'fallow-config-missing' | 'fallow-config-syntax' | 'fallow-banned-entry-glob' | 'fallow-stale-file' | 'fallow-stale-export' | 'fallow-empty-export-list' | 'fallow-duplicate-entry' | 'fallow-workspace-diagnostic';
export declare const FALLOW_CONFIG_RULES: readonly FallowConfigRuleId[];
export declare function getBannedEntryGlobs(projectRoot?: string): readonly string[];
export declare const BANNED_ENTRY_GLOBS: readonly ["src/components/**/*.vue", "src/views/**/*.vue", "src/components/**", "src/views/**"];
export declare function escapeRegExp(str: string): string;
/**
 * Checks whether a symbol is exported from file content.
 */
export declare function isSymbolExportedInContent(content: string, symbol: string, isVue?: boolean): boolean;
export interface FallowIgnoreExportEntry {
    file: string;
    exports: string[];
}
export interface FallowConfigSchema {
    entry?: string[];
    ignorePatterns?: string[];
    ignoreExports?: FallowIgnoreExportEntry[];
    rules?: Record<string, string>;
}
export interface FallowWorkspaceDiagnosticItem {
    readonly path?: string;
    readonly kind?: string;
    readonly message?: string;
}
export declare function validateFallowWorkspaceDiagnostics(diagnostics: readonly FallowWorkspaceDiagnosticItem[] | undefined, auditor: ValidateFallowConfigAuditor): void;
export declare class ValidateFallowConfigAuditor extends BaseAuditor<FallowConfigRuleId> {
    private readonly configPath;
    constructor(targetPath?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_fallow_config.d.ts.map