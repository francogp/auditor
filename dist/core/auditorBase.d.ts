/**
 * scripts/lib/auditorBase.ts
 *
 * BASE AUDITOR FRAMEWORK (Node.js 26+ Native)
 * Mandatory base orchestrator for all sub-auditors in scripts/auditors/.
 * Enforces the StandardAuditResult contract:
 *   1. Always outputs the clean Box-Drawing summary table to console.
 *   2. Always writes 100% complete structured JSON to scratch/audits/<family>/<id>.json.
 */
import './permissionGuard.ts';
import { type AuditFamily, type AuditFinding, type FindingSeverity, type StandardAuditResult, type ICompositeAuditor, type SubAuditorStep, type SubAuditorReport, type AuditorCapabilities, type AuditorCoverageDeclaration, type GitIgnoreRequirement, type AuditorConfigFileRequirement, type AuditorPackageScriptRequirement, type AuditorManifestDTO, deriveCanonicalAuditorScript } from './auditContract.ts';
export { deriveCanonicalAuditorScript };
import { CoverageRecorder } from './auditCoverage.ts';
import { type AuditEngineConfig } from './auditConfig.ts';
import type { SharedAstContext } from './astContext.ts';
import ts from 'typescript';
import { AuditedDocument, type DocumentReplacement, type LineColumnPosition } from './auditedDocument.ts';
export { AuditedDocument, type DocumentReplacement, type LineColumnPosition };
/** Directories that must ALWAYS be ignored across all tools, runners, and auditors (compilation, VCS, scratch, test artifacts) */
export declare const ALWAYS_IGNORE_DIRS: ReadonlySet<string>;
/** Additional directories ignored during code scanning (documentation/skills and static assets) */
export declare const CODE_ONLY_IGNORE_DIRS: ReadonlySet<string>;
/** Canonical ignore directories for application code auditors (union of ALWAYS + CODE_ONLY) */
export declare const CANONICAL_IGNORE_DIRS: ReadonlySet<string>;
/** Returns the effective set of ignore directories combining canonical defaults with audit.config.ts paths.ignoredDirs */
export declare function getEffectiveIgnoreDirs(): ReadonlySet<string>;
/** Returns the effective set of unignore directories combining audit.config.ts paths.unignoreDirs, documentation.unignoreDirs, and derived skillsRoots */
export declare function getEffectiveUnignoreDirs(projectRoot?: string): readonly string[];
export declare const SCANNABLE_EXTENSIONS: ReadonlySet<string>;
export declare const CANONICAL_SCANNABLE_ROOTS: readonly ["scripts", "src", "tests"];
export type CanonicalScannableRoot = (typeof CANONICAL_SCANNABLE_ROOTS)[number];
export declare function getEffectiveScannableRoots(config?: AuditEngineConfig): readonly string[];
/**
 * Validates that a path component is safe against path traversal.
 */
export declare function assertSafePathComponent(component: string): void;
/**
 * Loads directory ignore patterns from .fallowrc.json if present.
 */
export declare function loadFallowIgnorePatterns(projectRoot?: string): string[];
export declare function clearLockedSkillsCache(): void;
/**
 * Canonical candidate relative locations for skills-lock.json in order of precedence.
 */
export declare const SKILLS_LOCK_CANDIDATE_PATHS: readonly string[];
export declare function loadLockedSkills(projectRoot?: string): ReadonlySet<string>;
/**
 * Checks whether a relative POSIX or absolute path belongs to an official/locked skill directory
 * (e.g. .agents/skills/<lockedSkill>/**, skills/<lockedSkill>/**, .skills/<lockedSkill>/**).
 */
export declare function isLockedSkillPath(filePath: string, projectRoot?: string): boolean;
export declare function matchesSinglePattern(normalized: string, pattern: string): boolean;
/**
 * Determines whether a relative POSIX path belongs to an ignored directory or matches directory ignore patterns.
 */
export declare function isPathIgnored(relPath: string, extraIgnorePatterns?: readonly string[], unignoreDirs?: ReadonlySet<string> | readonly string[], projectRoot?: string): boolean;
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
    onFilesCollected?: (files: readonly string[]) => void;
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
    getAst: (relPath: string, content?: string) => ts.SourceFile;
    checkFiles: () => Promise<void>;
    finish: (finalMetrics?: Record<string, number | string>) => Promise<StandardAuditResult>;
    setStepLogger?: (logger: (stepNumber: number, totalSteps: number, description: string) => void) => void;
    setProgressLogger?: (logger: (msg: string) => void) => void;
}
export declare function setupAuditor(config: AuditorConfig): AuditorContext;
export declare const DEFAULT_AUDITOR_CAPABILITIES: AuditorCapabilities;
export declare const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export declare const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
export interface AuditorOptions<TRuleId extends string = string> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly family: AuditFamily;
    readonly packageName: string;
    readonly icon: string;
    readonly capabilities?: Partial<AuditorCapabilities>;
    readonly fix?: boolean;
    readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
    readonly configFiles?: readonly AuditorConfigFileRequirement<TRuleId>[];
    readonly scripts?: readonly AuditorPackageScriptRequirement[];
    readonly ruleIds?: readonly TRuleId[];
    readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
    readonly subAuditors?: readonly SubAuditorStep[];
    readonly roots?: readonly string[];
    readonly allowedExtensions?: ReadonlySet<string>;
    readonly extraIgnorePatterns?: readonly string[];
    readonly unignoreDirs?: readonly string[];
    readonly requiredFiles?: readonly string[];
    readonly requiresAst?: boolean;
    readonly projectRoot?: string;
    /** Section in .auditor/audit.config.ts utilized specifically by this suite (concise key, e.g. 'styles.baseScssFile', 'fallow.security', 'paths', 'core') */
    readonly configKey: string;
    /** Mandatory default configuration object for this suite to be injected into .auditor/audit.config.ts by auditor fix */
    readonly defaultConfig: Readonly<Record<string, unknown>>;
    /**
     * Files this suite is responsible for. Mandatory for direct BaseAuditor subclasses;
     * FileScanAuditor derives it from `roots` + `allowedExtensions` when omitted.
     */
    readonly coverage?: AuditorCoverageDeclaration;
}
export interface ViolationInput<TRuleId extends string = string> {
    readonly ruleId: TRuleId;
    readonly ruleDescription?: string;
    readonly severity: FindingSeverity;
    readonly file?: string;
    readonly filePath?: string;
    readonly line?: number;
    readonly col?: number;
    readonly column?: number;
    readonly message: string;
    readonly context?: string;
    readonly fixable?: boolean;
}
export declare abstract class BaseAuditor<TRuleId extends string = string> implements ICompositeAuditor {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly family: AuditFamily;
    readonly packageName: string;
    readonly icon: string;
    readonly capabilities: AuditorCapabilities;
    readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
    readonly configFiles: readonly AuditorConfigFileRequirement<TRuleId>[];
    readonly scripts: readonly AuditorPackageScriptRequirement[];
    readonly ruleIds: readonly TRuleId[];
    readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
    readonly explicitSubAuditors?: readonly SubAuditorStep[];
    readonly roots: readonly string[];
    readonly allowedExtensions: ReadonlySet<string>;
    readonly extraIgnorePatterns: readonly string[];
    readonly unignoreDirs: readonly string[];
    readonly requiredFiles: readonly string[];
    readonly requiresAst: boolean;
    readonly projectRoot: string;
    readonly configKey: string;
    readonly defaultConfig: Readonly<Record<string, unknown>>;
    protected readonly context: AuditorContext;
    protected readonly countsByRule: Map<TRuleId, number>;
    protected readonly errorsByRule: Map<TRuleId, number>;
    protected readonly warningsByRule: Map<TRuleId, number>;
    protected readonly subAuditorReports: SubAuditorReport[];
    protected readonly coverageRecorder: CoverageRecorder;
    protected readonly fixMode: boolean;
    protected isSkipped: boolean;
    protected skipReason?: string;
    /** Derived from the coverage recorder: record real files with `recordScanned()` instead of counting. */
    protected get filesScannedCount(): number;
    protected set filesScannedCount(count: number);
    markSkipped(reason: string): void;
    private resolveEffectiveCoverage;
    private resolveEffectiveScripts;
    private registerAuditorDependencies;
    private initExecutionContext;
    constructor(options: AuditorOptions<TRuleId>);
    /** Full rule catalog used for dormancy detection (declared ruleIds, else ruleDescriptions keys). */
    getRuleCatalog(): readonly TRuleId[];
    /** Records a file that this suite actually analyzed (absolute or project-relative path). */
    protected recordScanned(filePath: string): void;
    protected unrecordScanned(filePath: string): void;
    protected recordScannedMany(filePaths: Iterable<string>): void;
    /**
     * Evaluates an assertion or check block for a declared rule.
     * Automatically marks the rule as evaluated in the coverage ledger.
     */
    evaluateRule(ruleId: TRuleId, evaluateFn: () => void | Promise<void>): Promise<void>;
    /** Synchronous variant for inline invariant evaluation. */
    evaluateRuleSync(ruleId: TRuleId, evaluateFn: () => void): void;
    /**
     * Asserts a condition for a rule. Automatically marks the rule as evaluated.
     * If condition is false, adds a violation.
     */
    assertRule(ruleId: TRuleId, condition: boolean, violation: Omit<ViolationInput<TRuleId>, 'ruleId'>): void;
    /** Refines the coverage declaration at runtime (e.g. from config-driven roots loaded after construction). */
    protected redeclareCoverage(declaration: AuditorCoverageDeclaration): void;
    /** For `declared-only` suites whose external engine reports a file count but no file list. */
    protected recordExternalScanCount(count: number): void;
    /** Adds dynamically discovered rule ids (rule engines without static ruleIds) to the dormancy catalog. */
    protected declareRuleCatalog(ruleIds: readonly string[]): void;
    /** Records that a rule passed its activation gates and was evaluated (per file, or per tool invocation). */
    protected markRuleEvaluated(ruleId: TRuleId, count?: number): void;
    /**
     * Loud failure for obsolete v3 method name.
     * Enforces the Loud Failure Mandate under AGENTS.md.
     */
    protected recordRuleEvaluation(ruleId: string): never;
    /** Explicitly declares a rule as non-applicable for this run; never silent, always justified. */
    protected markRuleNotApplicable(ruleId: TRuleId, reason: string): void;
    /**
     * Evaluates suite gating against configuration and marks rules not applicable and suite skipped if disabled.
     * Returns true if the suite is disabled, allowing an immediate clean early return.
     */
    protected isSuiteGatingDisabled(defaultReason?: string): boolean;
    /** Gets evaluation count recorded so far for a given rule. */
    protected getEvaluations(ruleId: TRuleId): number;
    getCoverageRecorder(): CoverageRecorder;
    private persistCoverageLedger;
    getSubAuditors(): readonly SubAuditorStep[];
    private resolveSubAuditorStatus;
    private formatSubAuditorBadge;
    logSubAudit(stepNumber: number, totalSteps: number, name: string, result: number | 'passed' | 'warning' | 'failed' | string, detail?: string, counts?: {
        errors?: number;
        warnings?: number;
    }): void;
    getCountsByRule(): ReadonlyMap<TRuleId, number>;
    getErrorsByRule(): ReadonlyMap<TRuleId, number>;
    getWarningsByRule(): ReadonlyMap<TRuleId, number>;
    formatRuleDescription(ruleId: TRuleId, rawDescription?: string): string;
    getRuleLabel(ruleId: string): string;
    getFilesScanned(): number;
    addViolation(v: ViolationInput<TRuleId>): void;
    isLineIgnored(line: string, customTokens?: readonly string[]): boolean;
    protected hasEscapeHatch(line: string, hatches: readonly string[]): boolean;
    isFixActive(): boolean;
    protected isFixModeRequested(): boolean;
    /**
     * Resolves whether any declared file or candidate file for this requirement exists on disk.
     * Returns the absolute path of the first existing candidate, or null if none exist.
     */
    resolveConfigFile(requirement: AuditorConfigFileRequirement<TRuleId>): string | null;
    private scaffoldDefaultConfigFile;
    private reportMissingConfigFileViolation;
    ensureConfigFile(requirement: AuditorConfigFileRequirement<TRuleId>): Promise<{
        resolvedPath: string;
        created: boolean;
    } | null>;
    /**
     * Iterates through all declared `configFiles`, ensuring that every applicable requirement
     * is satisfied or scaffolded. Returns true if all applicable requirements are met, false otherwise.
     */
    verifyAndFixConfigFiles(): Promise<boolean>;
    isPathIgnored(relPath: string): boolean;
    protected getLineNumber(content: string, charIndex: number): number;
    protected getLineAt(content: string, lineIndex: number): string;
    protected scanRegexMatches(content: string, regex: RegExp, relPath: string, ruleId: TRuleId, escapeHatches: readonly string[], message: string, filter?: (lineContent: string, match: RegExpExecArray) => boolean, sourceForLines?: string, charOffset?: number): void;
    abstract runAudit(astContext?: SharedAstContext): Promise<void> | void;
    execute(astContext?: SharedAstContext): Promise<StandardAuditResult>;
    finishAudit(): Promise<StandardAuditResult>;
    protected ensureSubAuditorsLogged(): void;
    importAuditFindings(findings: readonly AuditFinding[], fallbackRuleId: TRuleId, fallbackContext?: string): void;
    setStepLogger(logger: (stepNumber: number, totalSteps: number, description: string) => void): void;
    setProgressLogger(logger: (msg: string) => void): void;
    /**
     * Genera el DTO canónico AuditorManifestDTO para introspección limpia y tipada,
     * permitiendo a herramientas externas y agentes consultar dinámicamente qué hace y cómo opera.
     */
    toManifest(): AuditorManifestDTO;
    private static isExecutingCli;
    static runCli(auditor: BaseAuditor<string>): Promise<void>;
    static runCliIfMain(metaUrl: string, auditor: BaseAuditor<string>): Promise<void>;
}
/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export declare abstract class FileScanAuditor<TRuleId extends string = string> extends BaseAuditor<TRuleId> {
    /**
     * Primary file scanning entry point receiving an immutable AuditedDocument.
     * By default, delegates to scanFile(relPath, content, sourceFile, doc).
     */
    protected scanDocument(doc: AuditedDocument): void | Promise<void>;
    /**
     * Overridable file scanning method for sub-auditors.
     */
    protected scanFile(_relPath: string, _content: string, _sourceFile?: ts.SourceFile, _doc?: AuditedDocument): void | Promise<void>;
    constructor(options: AuditorOptions<TRuleId>);
    /**
     * Adds a violation calculating 1-indexed line and column numbers from a string offset.
     */
    protected addViolationAtMatch(params: {
        ruleId: TRuleId;
        filePath: string;
        content: string;
        matchIndex: number;
        message: string;
        severity?: FindingSeverity;
        context?: string;
        doc?: AuditedDocument;
    }): void;
    /**
     * High-level pattern scanner that skips comments and strings automatically
     * and verifies escape hatches before registering violations.
     */
    protected scanSafePattern(doc: AuditedDocument, options: {
        regex: RegExp;
        ruleId: TRuleId;
        message: string | ((match: RegExpExecArray, pos: LineColumnPosition) => string);
        severity?: FindingSeverity;
        skipComments?: boolean;
        skipStrings?: boolean;
    }, onMatch?: (match: RegExpExecArray, pos: LineColumnPosition) => boolean | void): void;
    private resolveEffectiveAst;
    private scanSingleDiscoveredFile;
    runAudit(astContext?: SharedAstContext): Promise<void>;
}
//# sourceMappingURL=auditorBase.d.ts.map