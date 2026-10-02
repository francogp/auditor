/**
 * scripts/lib/auditorBase.ts
 *
 * BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
 * Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
 * Enforces the StandardAuditResult contract:
 *   1. Always outputs the clean Box-Drawing summary table to console.
 *   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
 */
import { type AuditFamily, type AuditFinding, type FindingSeverity, type StandardAuditResult } from './auditContract.ts';
import type { SharedAstContext } from './astContext.ts';
import type ts from 'typescript';
/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
export declare const ALWAYS_IGNORE_DIRS: ReadonlySet<string>;
/** Additional directories ignored during code scanning (documentation/skills and static assets) */
export declare const CODE_ONLY_IGNORE_DIRS: ReadonlySet<string>;
/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
export declare const CANONICAL_IGNORE_DIRS: ReadonlySet<string>;
/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
export declare function getEffectiveIgnoreDirs(): ReadonlySet<string>;
export declare const SCANNABLE_EXTENSIONS: ReadonlySet<string>;
export declare const CANONICAL_SCANNABLE_ROOTS: readonly ["scripts", "src", "tests"];
export type CanonicalScannableRoot = (typeof CANONICAL_SCANNABLE_ROOTS)[number];
export declare function getEffectiveScannableRoots(config?: import("./auditConfig.ts").AuditEngineConfig): readonly string[];
/**
 * Validates that a path component is safe against path traversal.
 */
export declare function assertSafePathComponent(component: string): void;
/**
 * Loads directory ignore patterns from .fallowrc.json if present.
 */
export declare function loadFallowIgnorePatterns(projectRoot?: string): string[];
/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export declare function isPathIgnored(relPath: string, extraIgnorePatterns?: readonly string[], unignoreDirs?: ReadonlySet<string> | readonly string[]): boolean;
/**
 * Recursively collects scannable files from a directory, applying ignore filters.
 */
export declare function collectRepositoryFiles(dir: string, projectRoot?: string, extraIgnorePatterns?: readonly string[], allowedExtensions?: ReadonlySet<string>, unignoreDirs?: ReadonlySet<string> | readonly string[]): string[];
export interface AuditorConfig {
    id: string;
    name: string;
    description: string;
    family: AuditFamily;
    requiredFiles?: string[];
    extraIgnorePatterns?: string[];
    unignoreDirs?: string[];
    projectRoot?: string;
}
export interface AuditorContext {
    values: {
        output?: string;
        'errors-only'?: boolean;
    };
    ignorePatterns: readonly string[];
    unignoreDirs: readonly string[];
    isPathIgnored: (relPath: string) => boolean;
    collectFiles: (roots?: readonly string[], allowedExtensions?: ReadonlySet<string>) => string[];
    logProgress: (msg: string) => void;
    logStep: (stepNumber: number, totalSteps: number, description: string) => void;
    addFinding: (finding: AuditFinding) => void;
    addError: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
    addWarning: (message: string, file?: string, line?: number, context?: string, ruleId?: string, ruleDescription?: string, suiteId?: string, suiteName?: string) => void;
    setMetric: (key: string, value: number | string) => void;
    checkFiles: () => Promise<void>;
    finish: (finalMetrics?: Record<string, number | string>, legacyErrors?: string[], legacyWarnings?: string[]) => Promise<StandardAuditResult>;
}
export declare function setupAuditor(config: AuditorConfig): AuditorContext;
export declare const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export declare const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
export interface AuditorOptions<TRuleId extends string = string> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly family: AuditFamily;
    readonly packageName?: string;
    readonly ruleIds?: readonly TRuleId[];
    readonly ruleDescriptions?: Readonly<Partial<Record<TRuleId, string>>>;
    readonly roots?: readonly string[];
    readonly allowedExtensions?: ReadonlySet<string>;
    readonly extraIgnorePatterns?: readonly string[];
    readonly unignoreDirs?: readonly string[];
    readonly requiredFiles?: readonly string[];
    readonly requiresAst?: boolean;
    readonly projectRoot?: string;
}
export interface ViolationInput<TRuleId extends string = string> {
    readonly ruleId: TRuleId;
    readonly ruleDescription?: string;
    readonly severity: FindingSeverity;
    readonly file: string;
    readonly line: number;
    readonly message: string;
    readonly context: string;
}
export declare abstract class BaseAuditor<TRuleId extends string = string> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly family: AuditFamily;
    readonly packageName?: string;
    readonly ruleIds: readonly TRuleId[];
    readonly ruleDescriptions?: Readonly<Partial<Record<TRuleId, string>>>;
    readonly roots: readonly string[];
    readonly allowedExtensions: ReadonlySet<string>;
    readonly extraIgnorePatterns: readonly string[];
    readonly unignoreDirs: readonly string[];
    readonly requiredFiles: readonly string[];
    readonly requiresAst: boolean;
    protected readonly projectRoot: string;
    protected readonly context: AuditorContext;
    protected readonly countsByRule: Map<TRuleId, number>;
    protected filesScannedCount: number;
    constructor(options: AuditorOptions<TRuleId>);
    getCountsByRule(): ReadonlyMap<TRuleId, number>;
    formatRuleDescription(ruleId: TRuleId, rawDescription?: string): string;
    getRuleLabel(ruleId: string): string;
    getFilesScanned(): number;
    addViolation(v: ViolationInput<TRuleId>): void;
    isLineIgnored(line: string, customTokens?: readonly string[]): boolean;
    protected hasEscapeHatch(line: string, hatches: readonly string[]): boolean;
    protected isFixModeRequested(): boolean;
    protected getLineNumber(content: string, charIndex: number): number;
    protected getLineAt(content: string, lineIndex: number): string;
    protected scanRegexMatches(content: string, regex: RegExp, relPath: string, ruleId: TRuleId, escapeHatches: readonly string[], message: string, filter?: (lineContent: string, match: RegExpExecArray) => boolean, sourceForLines?: string, charOffset?: number): void;
    abstract runAudit(astContext?: SharedAstContext): Promise<void> | void;
    execute(astContext?: SharedAstContext): Promise<StandardAuditResult>;
    finishAudit(): Promise<StandardAuditResult>;
    importAuditFindings(findings: readonly AuditFinding[], fallbackRuleId: TRuleId, fallbackContext?: string): void;
    static runCli(auditor: BaseAuditor<string>): Promise<void>;
    static runCliIfMain(metaUrl: string, auditor: BaseAuditor<string>): Promise<void>;
}
/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export declare abstract class FileScanAuditor<TRuleId extends string = string> extends BaseAuditor<TRuleId> {
    protected abstract scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void | Promise<void>;
    runAudit(astContext?: SharedAstContext): Promise<void>;
}
//# sourceMappingURL=auditorBase.d.ts.map