import { AuditEngineConfig } from "./auditConfigTypes.js";
import { REMEDIATION_PHASE_IDS, RemediationPhaseId } from "./remediationPhases.js";
import { AuditExecutionSpeed, AuditFamily, AuditFinding, AuditorCapabilities, AuditorConfigFileRequirement, AuditorCoverageDeclaration, AuditorCriticalConfig, AuditorExecutionTier, AuditorManifestDTO, AuditorPackageScriptRequirement, AuditorRuleCapabilities, DualCommandProfile, FindingSeverity, FixableFindingCounts, FixableViolationsSummary, GitIgnoreRequirement, ICompositeAuditor, StandardAuditResult, SubAuditorReport, SubAuditorStep, ThirdPartyToolFailurePolicy, TieredCommandProfile, deriveCanonicalAuditorScript, normalizeSpeeds, resolveEffectiveSpeed } from "./auditContract.js";
import { CoverageRecorder } from "./auditCoverage.js";
import { SharedAstContext } from "./astContext.js";
import { AuditedDocument, DocumentReplacement, LineColumnPosition } from "./auditedDocument.js";
import { isPathExempt } from "./reportUtils.js";
import ts from "typescript";
//#region src/core/auditorBase.d.ts
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
  finish: (finalMetrics?: Record<string, number | string>, extra?: Partial<StandardAuditResult>) => Promise<StandardAuditResult>;
  getFindings: () => readonly AuditFinding[];
  setStepLogger?: (logger: (stepNumber: number, totalSteps: number, description: string) => void) => void;
  setProgressLogger?: (logger: (msg: string) => void) => void;
}
/**
 * Clears the in-memory RAM cache for workspace discovered files.
 */
export declare function clearWorkspaceFileCache(): void;
export declare function setupAuditor(config: AuditorConfig): AuditorContext;
export declare const DEFAULT_AUDITOR_CAPABILITIES: AuditorRuleCapabilities;
export declare const MAX_AUDITOR_DESCRIPTION_LENGTH = 50;
export declare const MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60;
/**
 * Derives aggregate suite-level capabilities from the logical union of all its sub-auditor ruleCapabilities.
 */
export declare function deriveSuiteCapabilities(ruleCapabilities: Readonly<Record<string, AuditorRuleCapabilities>> | undefined): AuditorRuleCapabilities;
/**
 * Creates individual rule capabilities for suites, automatically adjusting
 * the `fix` capability per rule based on declared fixableRuleIds.
 */
export declare function createRuleCapabilities<TRuleId extends string>(ruleIds: readonly TRuleId[], baseCapabilities: AuditorRuleCapabilities, fixableRuleIds?: readonly TRuleId[]): Record<TRuleId, AuditorRuleCapabilities>;
/**
 * Creates uniform rule capabilities for suites where every declared rule
 * shares the same operational capabilities.
 */
export declare function createUniformRuleCapabilities<TRuleId extends string>(ruleIds: readonly TRuleId[], capabilities: AuditorRuleCapabilities): Record<TRuleId, AuditorRuleCapabilities>;
/**
 * Creates uniform strategic remediation phases for suites where every declared rule
 * shares the same remediation phase.
 */
export declare function createUniformRemediationPhases<TRuleId extends string>(ruleIds: readonly TRuleId[], phase: RemediationPhaseId): Record<TRuleId, RemediationPhaseId>;
/**
 * Canonical capability template for standard fast/light rules (speed: 'light', phase: 'normal', fix: 'none').
 */
export declare const LIGHT_RULE_CAPABILITIES: Readonly<AuditorRuleCapabilities>;
/**
 * Canonical capability template for rules requiring TypeScript AST context (speed: 'light', ast: true).
 */
export declare const AST_RULE_CAPABILITIES: Readonly<AuditorRuleCapabilities>;
export interface FileScanRootsOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}
/**
 * Resolves effective roots for file scan auditors, dynamically consulting configured srcRoots.
 */
export declare function resolveFileScanRoots(options: FileScanRootsOptions, defaultRoots?: readonly string[]): {
  effectiveRoot: string;
  targetRoots: readonly string[];
};
export interface AuditorOptions<TRuleId extends string = string> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AuditFamily;
  readonly packageName: string;
  readonly icon: string;
  readonly ruleCapabilities: Readonly<Record<TRuleId, AuditorCapabilities>>;
  readonly capabilities?: never;
  readonly fixableRuleIds?: readonly TRuleId[];
  readonly fix?: boolean;
  readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  readonly configFiles?: readonly AuditorConfigFileRequirement<TRuleId>[];
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly ruleIds: readonly TRuleId[];
  readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
  /**
   * Mandatory on-demand diagnostic and remediation guide for every declared rule.
   * Explains root causes, what code patterns trigger the violation, and step-by-step resolution.
   */
  readonly ruleRemediations: Readonly<Record<TRuleId, string>>;
  /**
   * Strategic remediation phase for the entire suite. When specified, rules without an explicit
   * entry in ruleRemediationPhases inherit this phase automatically.
   */
  readonly remediationPhase?: RemediationPhaseId;
  /**
   * Mandatory strategic remediation phase for declared rules.
   * Classifies each rule into the canonical 7-tier resolution workflow:
   * 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish'.
   */
  readonly ruleRemediationPhases?: Readonly<Record<TRuleId, RemediationPhaseId>>;
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
   * Mandatory minimum baseline or immutable aspects that host projects CANNOT alter, omit, or degrade.
   * Mandatory by contract for all sub-auditors and host extensions (can be empty object {} if no critical constraints).
   */
  readonly criticalConfig: AuditorCriticalConfig;
  /**
   * Whether this suite relies on third-party binary/tool execution.
   * Mandatory boolean across all sub-auditors and extensions.
   */
  readonly usesThirdPartyTool: boolean;
  /**
   * Mandatory failure policy when usesThirdPartyTool is true.
   * Prohibited when usesThirdPartyTool is false.
   */
  readonly thirdPartyToolPolicy?: ThirdPartyToolFailurePolicy<TRuleId>;
  /**
   * Files this suite is responsible for. Mandatory for direct BaseAuditor subclasses;
   * FileScanAuditor derives it from `roots` + `allowedExtensions` when omitted.
   */
  readonly coverage?: AuditorCoverageDeclaration;
  /** Relative POSIX path globs or paths exempt from being analyzed by this suite. */
  readonly exemptPaths?: readonly string[];
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
  readonly remediation?: string;
  readonly remediationPhase?: RemediationPhaseId;
}
export declare const MANDATORY_AUDITOR_CAPABILITY_KEYS: readonly ["speed", "phase", "fix", "md", "ast", "changedOnly", "critical"];
export declare const MANDATORY_BOOLEAN_CAPABILITY_KEYS: readonly ["md", "ast", "changedOnly", "critical"];
export declare abstract class BaseAuditor<TRuleId extends string = string> implements ICompositeAuditor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly family: AuditFamily;
  readonly packageName: string;
  readonly icon: string;
  readonly capabilities: AuditorCapabilities;
  readonly ruleCapabilities: Readonly<Record<TRuleId, AuditorCapabilities>>;
  readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  readonly configFiles: readonly AuditorConfigFileRequirement<TRuleId>[];
  readonly scripts: readonly AuditorPackageScriptRequirement[];
  readonly ruleIds: readonly TRuleId[];
  readonly ruleDescriptions: Readonly<Record<TRuleId, string>>;
  readonly ruleRemediations: Readonly<Record<TRuleId, string>>;
  readonly ruleRemediationPhases: Readonly<Record<TRuleId, RemediationPhaseId>>;
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
  readonly criticalConfig: AuditorCriticalConfig;
  readonly usesThirdPartyTool: boolean;
  readonly thirdPartyToolPolicy?: ThirdPartyToolFailurePolicy<TRuleId>;
  protected readonly fixableRuleIds: ReadonlySet<TRuleId>;
  protected readonly durationsByRule: Map<TRuleId, number>;
  protected auditExecutionDurationMs?: number;
  protected readonly instanceStartTime: number;
  protected readonly declaredSubAuditors: Map<TRuleId, () => Promise<void> | void>;
  protected readonly context: AuditorContext;
  protected readonly countsByRule: Map<TRuleId, number>;
  protected readonly errorsByRule: Map<TRuleId, number>;
  protected readonly warningsByRule: Map<TRuleId, number>;
  protected readonly fixableErrorsByRule: Map<TRuleId, number>;
  protected readonly fixableWarningsByRule: Map<TRuleId, number>;
  protected readonly subAuditorReports: SubAuditorReport[];
  protected readonly coverageRecorder: CoverageRecorder;
  protected readonly fixMode: boolean;
  protected isSkipped: boolean;
  protected skipReason?: string;
  getFixableRuleIds(): readonly TRuleId[];
  recordRuleDuration(ruleId: TRuleId, durationMs: number): void;
  /**
   * Allows an external subprogram with its own telemetry (such as Fallow elapsed_ms)
   * or extension to report or override its net internally measured execution time.
   */
  reportRuleDuration(ruleId: TRuleId, durationMs: number): void;
  /**
   * Formally declares a sub-tool or sub-auditor bound to a declared rule.
   * The superclass automatically orchestrates its execution and empirically measures
   * its execution runtime homogeneously and transparently.
   */
  declareSubAuditor(ruleId: TRuleId, action: () => Promise<void> | void): void;
  /**
   * Executes a sub-auditor or rule block empirically measuring its start and end
   * completely transparently.
   */
  runSubAuditor<T = void>(ruleId: TRuleId, action: () => Promise<T> | T): Promise<T>;
  runSubAuditorSync<T = void>(ruleId: TRuleId, action: () => T): T;
  /**
   * @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
   * Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
   */
  runSubAuditorsBatch(ruleIds: readonly TRuleId[], _action: () => Promise<void> | void): Promise<void>;
  /**
   * @deprecated Prohibited under the Universal Empirical Individual Timing Contract.
   * Batch duration duplication is strictly forbidden. Measure rules individually with runSubAuditorSync or runSubAuditor.
   */
  runSubAuditorsBatchSync(ruleIds: readonly TRuleId[], _action: () => void): void;
  getRuleDuration(ruleId: TRuleId): number | undefined;
  getDurationsByRule(): ReadonlyMap<TRuleId, number>;
  private readonly executedCommandTiers;
  /**
   * Resolves the active speed ceiling (`maxSpeed`) and optional exact speed filter (`onlySpeed`)
   * from environment variables or CLI arguments.
   */
  getExecutionSpeedOptions(): {
    maxSpeed: AuditExecutionSpeed;
    onlySpeed?: AuditExecutionSpeed;
    isSpeedSpecified?: boolean;
  };
  /**
   * Resolves the effective speed ('light' | 'heavy' | 'full') for a specific ruleId in the current run,
   * or null if the rule should be skipped under the current speed ceiling or exact speed filter.
   */
  resolveRuleEffectiveSpeed(ruleId: TRuleId): AuditExecutionSpeed | null;
  /**
   * Returns the active execution tier ('light', 'heavy', 'full', 'md', 'fix', or 'post-build').
   */
  getExecutionTier(): AuditorExecutionTier;
  /**
   * Returns true when the active run is a lightweight run ('light' or 'md').
   */
  isFastMode(): boolean;
  /**
   * Checks whether a specific declared ruleId is active for the current execution tier/speed.
   */
  isRuleActiveForCurrentRun(ruleId: TRuleId): boolean;
  private isDualOrTieredProfile;
  /**
   * Resolves arguments for a tiered or dual command profile,
   * enforcing the Anti-Repetition Invariant: a command cannot be resolved in multiple tiers in the same run.
   */
  resolveCommandArgs<TArgs = readonly string[]>(profile: DualCommandProfile<TArgs> | TieredCommandProfile<TArgs> | (TArgs & readonly unknown[])): TArgs;
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
  /** Returns the on-demand diagnostic and remediation guide for a declared rule. */
  getRuleRemediation(ruleId: TRuleId): string | undefined;
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
  markRuleNotApplicable(ruleId: TRuleId, reason: string): void;
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
  logSubAudit(stepNumber: number, totalSteps: number, name: string, result: number | string, detail?: string, counts?: {
    errors?: number;
    warnings?: number;
  }, durationMs?: number, speed?: AuditExecutionSpeed): void;
  getCountsByRule(): ReadonlyMap<TRuleId, number>;
  getErrorsByRule(): ReadonlyMap<TRuleId, number>;
  getWarningsByRule(): ReadonlyMap<TRuleId, number>;
  getFixableErrorsByRule(): ReadonlyMap<TRuleId, number>;
  getFixableWarningsByRule(): ReadonlyMap<TRuleId, number>;
  getFindings(): readonly AuditFinding[];
  getFixableFindings(): readonly AuditFinding[];
  getFixableErrors(): number;
  getFixableWarnings(): number;
  static countFixableFindings(findings: readonly AuditFinding[]): FixableFindingCounts;
  static computeFixableViolations(results: readonly StandardAuditResult[], isFixMode?: boolean): FixableViolationsSummary;
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
   * Generates the canonical AuditorManifestDTO for clean and typed introspection,
   * allowing external tools and AI agents to dynamically inspect capabilities and rules.
   */
  toManifest(): AuditorManifestDTO;
  /**
   * Scans a collection of files in a single pass in memory (RAM).
   * Reads each file from disk exactly once, splits into lines, and evaluates each
   * declared rule handler while automatically measuring empirical rule durations.
   */
  scanFilesSinglePass(files: readonly string[], handlers: ReadonlyArray<{
    ruleId: TRuleId;
    scan: (file: string, content: string, lines: readonly string[], doc: AuditedDocument) => void | Promise<void>;
  }>): Promise<void>;
  private static isExecutingCli;
  static runCli(auditor: BaseAuditor<string>): Promise<void>;
  static runCliIfMain(metaUrl: string, auditor: BaseAuditor<string>): Promise<void>;
}
/**
 * Specialized File-Scanning Auditor.
 * Automates recursive file discovery, ignore filtering, reading, and line-by-line scanning dispatch.
 */
export declare abstract class FileScanAuditor<TRuleId extends string = string> extends BaseAuditor<TRuleId> {
  protected readonly declaredFileSubAuditors: Map<TRuleId, (doc: AuditedDocument) => void | Promise<void>>;
  protected readonly exemptPaths: readonly string[];
  /**
   * Primary file scanning entry point receiving an immutable AuditedDocument.
   * Automatically executes declared file sub-auditors measuring their runtimes
   * before delegating to scanFile(relPath, content, sourceFile, doc).
   */
  protected scanDocument(doc: AuditedDocument): void | Promise<void>;
  /**
   * Helper for in-memory testing of file scanning logic without touching the filesystem.
   */
  testScanFile(relPath: string, content: string, _sourceFile?: ts.SourceFile): void | Promise<void>;
  /**
   * Declares a file-scoped sub-auditor tied to a declared rule.
   * The superclass executes the handler for each audited file and empirically accumulates duration.
   */
  declareFileSubAuditor(ruleId: TRuleId, handler: (doc: AuditedDocument) => void | Promise<void>): void;
  /**
   * Declares a regex pattern sub-auditor tied to a declared rule.
   * Scans safe patterns skipping comments and strings automatically.
   */
  declarePatternSubAuditor(ruleId: TRuleId, options: {
    regex: RegExp;
    message: string | ((match: RegExpExecArray, pos: LineColumnPosition) => string);
    severity?: FindingSeverity;
    skipComments?: boolean;
    skipStrings?: boolean;
    fixable?: boolean;
    onMatch?: (match: RegExpExecArray, pos: LineColumnPosition) => boolean | void;
  }): void;
  /**
   * Overridable file scanning method for sub-auditors.
   */
  protected scanFile(_relPath: string, _content: string, _sourceFile?: ts.SourceFile, _doc?: AuditedDocument): void | Promise<void>;
  constructor(options: AuditorOptions<TRuleId>);
  /**
   * Checks whether the given relative path is exempt according to suite options.
   */
  protected isCurrentPathExempt(relPath: string): boolean;
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
    fixable?: boolean;
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
    fixable?: boolean;
  }, onMatch?: (match: RegExpExecArray, pos: LineColumnPosition) => boolean | void): void;
  /**
   * Superclass pattern scanner that executes a regex search over content or file lines,
   * skips comments, evaluates filters, records violations, and automatically measures
   * and records the empirical rule duration in the superclass.
   */
  scanPattern(content: string, lines: readonly string[], file: string, regex: RegExp, ruleId: TRuleId, filter?: (match: RegExpExecArray, line: string) => boolean, message?: string | ((match: RegExpExecArray, line: string) => string), severity?: FindingSeverity): void;
  private resolveEffectiveAst;
  private scanSingleDiscoveredFile;
  runAudit(astContext?: SharedAstContext): Promise<void>;
}
//#endregion
export { AuditedDocument, type DocumentReplacement, type LineColumnPosition, REMEDIATION_PHASE_IDS, type RemediationPhaseId, deriveCanonicalAuditorScript, isPathExempt, normalizeSpeeds, resolveEffectiveSpeed };