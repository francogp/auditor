/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */

import path from 'node:path';

import type { SharedAstContext } from './astContext.ts';
import {
  getAuditConfig,
  DEFAULT_MAX_AUDIT_STALENESS_MINUTES,
  type CustomAuditFamilyConfig,
  type AuditEngineConfig
} from './auditConfig.ts';
import {
  type RemediationPhaseId,
  REMEDIATION_PHASE_IDS,
  REMEDIATION_PHASES,
  getRemediationPhaseMetadata,
  isRemediationPhaseId,
  type RemediationPhaseMetadata
} from './remediationPhases.ts';

export {
  type RemediationPhaseId,
  REMEDIATION_PHASE_IDS,
  REMEDIATION_PHASES,
  getRemediationPhaseMetadata,
  isRemediationPhaseId,
  type RemediationPhaseMetadata
};

export const BUILTIN_AUDIT_FAMILIES = [
  'architecture',
  'domain_data',
  'persistence',
  'performance',
  'security',
  'documentation'
] as const;

export type BuiltinAuditFamily = (typeof BUILTIN_AUDIT_FAMILIES)[number];
export type AuditFamily = BuiltinAuditFamily | (string & { readonly __brand?: 'AuditFamily' });

export interface FamilyMetadata {
  key: string;
  title: string;
  order: number;
  icon: string;
  description: string;
}

export const FAMILY_METADATA: Record<string, FamilyMetadata> = {
  architecture: {
    key: 'architecture',
    title: 'STATIC STANDARDS, AST & ARCHITECTURE',
    order: 1,
    icon: '📁',
    description: 'Code quality rules, AST, Fallow intelligence, and dependencies.'
  },
  domain_data: {
    key: 'domain_data',
    title: 'DOMAIN TYPES & CANONICAL DATABASES',
    order: 2,
    icon: '🔒',
    description: 'Strict domain type validation (/domain-type-first), catalogs, and formulas.'
  },
  persistence: {
    key: 'persistence',
    title: 'PERSISTENCE, SQL & MIGRATIONS',
    order: 3,
    icon: '💾',
    description: 'Syntactic integrity of PostgreSQL/Supabase/SQLite migrations and RLS policies.'
  },
  performance: {
    key: 'performance',
    title: 'WEB PERFORMANCE, LATENCY & DATABASE',
    order: 4,
    icon: '⚡',
    description: 'Core Web Vitals, SQL query optimization, and rendering efficiency.'
  },
  security: {
    key: 'security',
    title: 'SECURITY, HARDENING & ACCESS CONTROL',
    order: 5,
    icon: '🛡️',
    description: 'OWASP Top 10 vulnerabilities, SSRF prevention, injections, and ReDoS.'
  },
  documentation: {
    key: 'documentation',
    title: 'DOCUMENTATION & DOX STRUCTURE',
    order: 6,
    icon: '📚',
    description: 'Relative link integrity in markdown and DOX indices (AGENTS.md).'
  }
};

export const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
export const FALLBACK_FAMILY_ORDER = 99;

export function resolveFamilyMetadata(
  familyKey: string,
  customFamilies?: readonly CustomAuditFamilyConfig[]
): FamilyMetadata {
  if (FAMILY_METADATA[familyKey]) {
    return FAMILY_METADATA[familyKey];
  }
  const custom = customFamilies?.find((f) => f.key === familyKey);
  if (custom) {
    return {
      key: custom.key,
      title: custom.title,
      order: custom.order ?? DEFAULT_CUSTOM_FAMILY_ORDER,
      icon: custom.icon ?? '⚙️',
      description: custom.description ?? `Specific checks for family ${custom.key}.`
    };
  }
  return {
    key: familyKey,
    title: familyKey.toUpperCase(),
    order: FALLBACK_FAMILY_ORDER,
    icon: '⚙️',
    description: `Audit family ${familyKey}.`
  };
}

export function getActiveFamilies(
  customFamilies?: readonly CustomAuditFamilyConfig[]
): readonly string[] {
  const customKeys = (customFamilies ?? []).map((f) => f.key);
  return Array.from(new Set([...BUILTIN_AUDIT_FAMILIES, ...customKeys]));
}

export const FINDING_SEVERITIES = ['error', 'warning', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export interface AuditFinding {
  severity: FindingSeverity;
  message: string;
  file?: string;
  line?: number;
  col?: number;
  ruleId?: string;
  ruleDescription?: string;
  suiteId?: string;
  suiteName?: string;
  context?: string;
  fixable?: boolean;
  remediation?: string;
  remediationPhase?: RemediationPhaseId;
}

export const AUDIT_STATUSES = ['passed', 'failed', 'skipped'] as const;
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];
export const AUDIT_EXECUTION_SPEEDS = ['light', 'heavy', 'full'] as const;
/**
 * Ordered execution speed / weight scale:
 * - 'light' (🐇): Fast/instant checks (used in auditor:lint, auditor, and auditor:full).
 * - 'heavy' (🐢): Medium/heavy checks (used in default auditor and auditor:full; skipped in auditor:lint).
 * - 'full'  (🐘): Exhaustive pre-commit/release checks (used in auditor:full; skipped in auditor:lint and default auditor).
 */
export type AuditExecutionSpeed = (typeof AUDIT_EXECUTION_SPEEDS)[number];

export const SPEED_RANK: Readonly<Record<AuditExecutionSpeed, number>> = Object.freeze({
  light: 1,
  heavy: 2,
  full: 3
});

export const AUDIT_EXECUTION_PHASES = ['setup', 'normal', 'post-run', 'post-build'] as const;
/**
 * Mutually exclusive execution phase:
 * - 'setup': Project configuration, dependencies, package.json scripts, and runtime environment. Must be resolved first before application code.
 * - 'normal': Standard concurrent execution on source code.
 * - 'post-run': Sequential execution after all other suites finish (e.g., validate_audit_coverage).
 * - 'post-build': Exclusive execution on compiled artifacts in dist/ (auditor:post-build).
 */
export type AuditExecutionPhase = (typeof AUDIT_EXECUTION_PHASES)[number];

export const AUDIT_FIX_CAPABILITIES = ['none', 'normal', 'priority'] as const;
/**
 * Mutually exclusive auto-fix capability:
 * - 'none': No automated repair.
 * - 'normal': Standard code/rule auto-repair.
 * - 'priority': Phase-0 bootstrap auto-repair (environment, package.json, .gitignore, audit.config.ts).
 */
export type AuditFixCapability = (typeof AUDIT_FIX_CAPABILITIES)[number];

/**
 * Context provided to an executable auto-repair function.
 */
export interface RuleFixContext<TRuleId extends string = string> {
  readonly projectRoot: string;
  readonly ruleId: TRuleId;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Universal auto-repair function callback contract.
 */
export type AnyRuleFixerFn = (
  context: RuleFixContext<never>
) => Promise<boolean | void> | boolean | void;

/**
 * Executable auto-repair function for a given rule.
 * Returns true or void if repaired, false if skipped/unrepairable.
 */
export type RuleFixerFn<TRuleId extends string = string> = (
  context: RuleFixContext<TRuleId>
) => Promise<boolean | void> | boolean | void;

/**
 * Map of executable auto-repair functions by ruleId.
 */
export type RuleFixersMap<TRuleId extends string = string> = Partial<
  Record<TRuleId, RuleFixerFn<TRuleId> | AnyRuleFixerFn>
>;

/**
 * Orthogonal 6-field rule capability contract eliminating overlapping boolean flags.
 * Fix capability is strictly derived dynamically by BaseAuditor and MUST NOT be declared here.
 */
export interface AuditorRuleCapabilities {
  /** Execution speed level(s): 'light' (🐇), 'heavy' (🐢), or 'full' (🐘), or a tuple of supported levels e.g. ['light', 'full'] */
  readonly speed: AuditExecutionSpeed | readonly AuditExecutionSpeed[];
  /** Mutually exclusive execution phase: 'normal', 'post-run', or 'post-build' */
  readonly phase: AuditExecutionPhase;
  /** Whether the rule participates in markdown/documentation runs (preset=md / npm run auditor:md) */
  readonly md: boolean;
  /** Whether the rule requires the shared in-memory TypeScript AST context */
  readonly ast: boolean;
  /** Whether the rule supports incremental git diff scoping via --changed-since / changed-only mode */
  readonly changedOnly: boolean;
  /** Whether the rule is critical for code correctness, typing, and syntax (bypasses speed ceiling in lint) */
  readonly critical: boolean;
}

/**
 * Derived execution capabilities including dynamically resolved auto-fix classification.
 */
export interface AuditorComputedCapabilities extends AuditorRuleCapabilities {
  /** Mutually exclusive auto-fix capability derived by BaseAuditor: 'none', 'normal', or 'priority' */
  readonly fix: AuditFixCapability;
}

export type AuditorCapabilities = AuditorComputedCapabilities;

export function normalizeSpeeds(
  speed: AuditExecutionSpeed | readonly AuditExecutionSpeed[] | undefined
): readonly AuditExecutionSpeed[] {
  if (!speed) return [];
  return Array.isArray(speed)
    ? (speed as readonly AuditExecutionSpeed[])
    : [speed as AuditExecutionSpeed];
}

/**
 * Resolves the effective speed to run for a given capability under:
 * - Ceiling mode (`maxSpeed`): picks the highest/slowest available speed <= maxSpeed. Returns null if none <= maxSpeed.
 * - Exact mode (`onlySpeed`): returns onlySpeed if explicitly declared in `declaredSpeed`, else null.
 */
export function resolveEffectiveSpeed(
  declaredSpeed: AuditExecutionSpeed | readonly AuditExecutionSpeed[] | undefined,
  options: { maxSpeed?: AuditExecutionSpeed; onlySpeed?: AuditExecutionSpeed } = {}
): AuditExecutionSpeed | null {
  const speeds = normalizeSpeeds(declaredSpeed);
  if (speeds.length === 0) return null;

  if (options.onlySpeed) {
    return speeds.includes(options.onlySpeed) ? options.onlySpeed : null;
  }

  const ceiling = options.maxSpeed ?? 'heavy';
  const maxRank = SPEED_RANK[ceiling];
  let best: AuditExecutionSpeed | null = null;
  for (const s of speeds) {
    const rank = SPEED_RANK[s];
    if (rank !== undefined && rank <= maxRank) {
      if (!best || rank > SPEED_RANK[best]) {
        best = s;
      }
    }
  }
  return best;
}

export type AuditorExecutionTier = AuditExecutionSpeed | 'fix' | 'md' | 'post-build';

/**
 * Multi-tier command profile contract allowing sub-auditors and extensions to define
 * explicit arguments per execution speed ('light', 'heavy', 'full', 'fix', etc.).
 */
export interface TieredCommandProfile<TArgs = readonly string[]> {
  /** Canonical command identifier or binary name */
  readonly command: string;
  /** Specific argument profiles per execution speed or tier */
  readonly profiles: Partial<Record<AuditorExecutionTier, TArgs>>;
  /** Fallback arguments if the active tier is not explicitly declared in profiles */
  readonly defaultArgs: TArgs;
}

/**
 * Standard contract for commands with fast/light and heavy profiles.
 */
export interface DualCommandProfile<TArgs = readonly string[]> {
  /** Canonical command identifier or binary name */
  readonly command: string;
  /** Arguments for the light/lint execution tier */
  readonly fastArgs: TArgs;
  /** Arguments for the heavy/full execution tier */
  readonly heavyArgs: TArgs;
}

export interface SubAuditorStep {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities?: AuditorRuleCapabilities;
  readonly durationMs?: number;
}

export const SUB_AUDITOR_STATUSES = ['passed', 'warning', 'failed'] as const;
export type SubAuditorStatus = (typeof SUB_AUDITOR_STATUSES)[number];

export interface SubAuditorReport {
  readonly id: string;
  readonly name: string;
  readonly status: SubAuditorStatus;
  readonly count: number;
  readonly errorsCount?: number;
  readonly warningsCount?: number;
  readonly durationMs?: number;
  readonly detail?: string;
  readonly capabilities?: AuditorRuleCapabilities;
  readonly speed: AuditExecutionSpeed;
}

export interface ICompositeAuditor {
  getSubAuditors(): readonly SubAuditorStep[];
}

export interface AuditorExecutable {
  audit(astContext?: SharedAstContext): Promise<StandardAuditResult>;
  fix(astContext?: SharedAstContext): Promise<StandardAuditResult>;
}

export interface StandardAuditResult {
  id: string;
  name: string;
  description: string;
  family: AuditFamily;
  status: AuditExecutionStatus;
  durationMs: number;
  metrics: Record<string, number | string>;
  findings: AuditFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    fixableErrors?: number;
    fixableWarnings?: number;
    totalFilesScanned?: number;
  };
  subAuditors?: readonly SubAuditorReport[];
  isBuiltin?: boolean;
  icon?: string;
  packageName?: string;
}

export const COVERAGE_SOURCES = ['runtime', 'declared-only'] as const;
/**
 * - `runtime`: the suite records every file it actually analyzed (`recordScanned`).
 * - `declared-only`: the suite delegates to an external engine that cannot report its analyzed file list;
 *   coverage trusts the declared `include`/`exclude` globs instead.
 */
export type CoverageSource = (typeof COVERAGE_SOURCES)[number];

/**
 * Static declaration of the files a suite is responsible for.
 * Globs are POSIX, relative to the project root, evaluated with native `path.matchesGlob`.
 */
export interface AuditorCoverageDeclaration {
  readonly include: readonly string[];
  readonly exclude?: readonly string[];
  readonly source?: CoverageSource;
}

/**
 * Per-suite coverage ledger persisted at the end of every orchestrated run
 * (`scratch/audits/coverage/<suiteId>.json`) and consumed by `validate_audit_coverage`.
 */
export interface CoverageLedger {
  readonly runId: string;
  readonly suiteId: string;
  readonly skipped: boolean;
  readonly declared: AuditorCoverageDeclaration;
  readonly source: CoverageSource;
  /** POSIX relative paths actually analyzed (empty for `declared-only`). */
  readonly scanned: readonly string[];
  /** Full rule catalog the suite is expected to evaluate. */
  readonly ruleIds: readonly string[];
  /** Number of evaluations per rule (file-level gate passed, or tool invocation). */
  readonly ruleEvaluations: Readonly<Record<string, number>>;
  /** Rules explicitly declared non-applicable during this run, with their justification. */
  readonly notApplicable: Readonly<Record<string, string>>;
}

export interface GitIgnoreRequirement {
  readonly id: string;
  readonly pattern: string;
  readonly samplePath?: string;
  readonly reason: string;
  readonly isApplicable?: (config: AuditEngineConfig) => boolean;
}

/**
 * Requirement declaration for package.json scripts exposed by the auditor framework or sub-auditors.
 */
export interface AuditorPackageScriptRequirement {
  /** Unique script key in package.json (e.g. 'version:bump', 'audit:valibot', 'audit:package-hygiene') */
  readonly name: string;
  /** Canonical command to execute (e.g. 'auditor-version bump', 'auditor task=validate_valibot_parity') */
  readonly command: string;
  /** Human-readable description of what this command executes */
  readonly description: string;
  /** Logical category (e.g. 'core', 'versioning', 'reporting', 'suite', 'fallow', 'family', 'env', 'aliases') */
  readonly category?: string;
  /** Node.js 26 permissions required by this script (e.g. ['--allow-addons', '--allow-child-process']) */
  readonly permissions?: readonly string[];
  /** Optional source identifier registering this requirement (e.g. 'framework:core', 'suite:validate_oxlint') */
  readonly sourceId?: string;
  /** Optional predicate determining if this script is applicable in the current project */
  readonly isApplicable?: (config: AuditEngineConfig, projectRoot: string) => boolean;
}

/**
 * Context provided to configuration fix generators when auto-repairing or scaffolding files.
 */
export interface AuditorConfigFixContext {
  readonly projectRoot: string;
  readonly packageName: string;
  readonly config: AuditEngineConfig;
}

/**
 * Unified interface for sub-auditors and extensions to declare their configuration file requirements and auto-fixes.
 */
export interface AuditorConfigFileRequirement<TRuleId extends string = string> {
  /** Unique requirement identifier (e.g. 'eslint-config', 'fallow-config', 'audit-config') */
  readonly id: string;
  /** Primary canonical file path relative to projectRoot (e.g. 'eslint.config.js', '.fallowrc.json') */
  readonly file: string;
  /** Optional alternative candidate filenames if multiple naming schemes are accepted (e.g. ['eslint.config.js', 'eslint.config.mjs']) */
  readonly candidateFiles?: readonly string[];
  /** Human-readable description of what this configuration governs */
  readonly description: string;
  /** The ruleId to report as a violation if the configuration file is missing and fix mode is inactive */
  readonly ruleId: TRuleId;
  /** Function generating the canonical default/minimal configuration content when auto-repair runs */
  readonly generateDefaultContent: (context: AuditorConfigFixContext) => string | Promise<string>;
  /** Optional predicate determining if this configuration is applicable in the current project */
  readonly isApplicable?: (config: AuditEngineConfig, projectRoot: string) => boolean;
  /** Optional custom missing message or factory to tailor diagnostics (e.g. legacy migrations) */
  readonly customMissingMessage?:
    | string
    | ((context: AuditorConfigFixContext, file: string) => string);
  /** Optional custom file path to report on violations (e.g. legacy file name instead of primary) */
  readonly customMissingFile?: (context: AuditorConfigFixContext, defaultFile: string) => string;
}

/**
 * Canonical Auditor Manifest DTO.
 * Minimal and structured immutable contract for tools,
 * CLIs, and AI agents to understand auditor purpose and execution.
 */
export interface AuditorManifestDTO {
  /** Unique suite identifier (e.g. 'validate_accessibility') */
  readonly id: string;
  /** Formal human-readable name (e.g. 'Web & Vue Accessibility Standards') */
  readonly name: string;
  /** Canonical auditor family ('architecture', 'domain_data', 'persistence', 'documentation', etc.) */
  readonly family: string;
  /** Mandatory thematic emoji */
  readonly icon: string;
  /**
   * Concise and mandatory summary of purpose and validations (max 60 characters).
   * Mandatory, direct, no walls of text.
   */
  readonly description: string;
  /** Supported execution capabilities */
  readonly capabilities: AuditorCapabilities;
  /** Catalog of evaluated rules with concise description */
  readonly rules: Readonly<Record<string, string>>;
  /** Catalog of on-demand diagnostic and remediation guides for each rule */
  readonly remediations?: Readonly<Record<string, string>>;
  /** Catalog of strategic remediation phases for each rule */
  readonly remediationPhases?: Readonly<Record<string, RemediationPhaseId>>;
  /** Individual capabilities declared by each sub-auditor / rule */
  readonly ruleCapabilities?: Readonly<Record<string, AuditorCapabilities>>;
  /** List of ruleIds that this suite can mechanically repair automatically */
  readonly fixableRules: readonly string[];
  /**
   * Configuration key or section in .auditor/audit.config.ts if specifically used.
   * Concise (e.g. 'styles.baseScssFile', 'fallow.security', 'testCoverage.thresholds', 'paths', 'core').
   */
  readonly configKey: string;
  /**
   * Mandatory default configuration declared by the auditor for dynamic injection into audit.config.ts.
   */
  readonly defaultConfig: Readonly<Record<string, unknown>>;
  /**
   * Critical configuration and immutable invariants declared by the auditor (mandatory by contract, can be empty object {}).
   */
  readonly criticalConfig: {
    readonly rationale?: string;
    readonly requiredMinimums?: Readonly<Record<string, readonly (string | number)[]>>;
    readonly forbiddenOverrides?: Readonly<Record<string, readonly unknown[]>>;
  };
  /**
   * Whether this suite relies on third-party binary/tool execution.
   */
  readonly usesThirdPartyTool?: boolean;
  /**
   * Declared failure policy when a third-party tool errors or its output cannot be parsed.
   */
  readonly thirdPartyToolPolicy?: ThirdPartyToolFailurePolicy;
  /**
   * Mandatory contract of package.json execution commands and scripts exposed by this auditor.
   */
  readonly scripts: readonly AuditorPackageScriptRequirement[];
}

/**
 * Contract of critical configuration and immutable invariants for an auditor.
 */
export interface AuditorCriticalConfig<TConfig = unknown> {
  /**
   * Technical and architectural rationale explaining why this minimum baseline is mandatory and non-negotiable.
   * Mandatory when critical constraints are defined.
   */
  readonly rationale?: string;

  /**
   * Dictionary of properties or lists acting as mandatory minimum baseline.
   * Host project may add more items (additive), but omitting any of these fails.
   * Example: { 'strictProperties': ['/color$/', 'font-size', 'z-index'] }
   */
  readonly requiredMinimums?: Readonly<Record<string, readonly (string | number)[]>>;

  /**
   * Strictly forbidden values or overrides.
   * Maps property paths to unauthorized values (e.g. false, 'off', 0, null).
   * Example: { 'enabled': [false], 'rules.@typescript-eslint/no-explicit-any': ['off', 0] }
   */
  readonly forbiddenOverrides?: Readonly<Record<string, readonly unknown[]>>;

  /**
   * Custom semantic validator for complex or multi-dimensional invariants.
   * Returns violation reason string if invalid, or null/undefined if valid.
   */
  readonly validate?: (config: TConfig, projectRoot: string) => string | null | undefined;

  /**
   * Optional mechanical repair generator to re-inject minimums into the corresponding file.
   */
  readonly repair?: (currentConfig: TConfig, projectRoot: string) => TConfig | Promise<TConfig>;
}

/**
 * Declared failure policy when a sub-auditor or extension delegates to third-party tools or binaries.
 */
export interface ThirdPartyToolFailurePolicy<TRuleId extends string = string> {
  /** Canonical name of the third-party binary/tool (e.g. 'ESLint', 'Stylelint', 'html-validate', 'Fallow', 'TypeScript', 'knip') */
  readonly toolName: string;
  /**
   * Action to execute when the tool crashes, returns non-zero unexpectedly, or produces unparseable output:
   * - 'throw': Immediately throws a loud Error halting the suite (fail-loud).
   * - 'violation': Adds a canonical AuditFinding with severity 'error' under fallbackRuleId.
   */
  readonly fallbackBehavior: 'throw' | 'violation';
  /**
   * Designated ruleId to assign the failure finding when fallbackBehavior is 'violation'.
   * Mandatory when fallbackBehavior === 'violation'. Must be in the suite's ruleIds catalog.
   */
  readonly fallbackRuleId?: TRuleId;
}

/**
 * Derives the canonical package.json script requirement for any auditor by convention.
 */
export function deriveCanonicalAuditorScript(
  id: string,
  description: string,
  overrides?: Partial<AuditorPackageScriptRequirement>
): AuditorPackageScriptRequirement {
  const shortId = id
    .replace(/\.(ts|js)$/, '')
    .replace(/^(validate_|audit_)/, '')
    .replace(/_/g, '-');
  return {
    name: overrides?.name ?? `auditor:${shortId}`, // Script requirement identifier convention
    command: overrides?.command ?? `auditor task=${id}`,
    description: overrides?.description ?? description,
    category: overrides?.category ?? 'suite',
    permissions: overrides?.permissions ?? [],
    ...(overrides?.isApplicable ? { isApplicable: overrides.isApplicable } : {})
  };
}

export interface AuditTaskDefinition {
  id: string;
  name: string;
  description?: string;
  family: AuditFamily;
  scriptPath: string;
  command: string;
  args: string[];
  fast?: boolean;
  order?: number;
  timeoutMs?: number;
  shell?: boolean;
  requiresAst?: boolean;
  isBuiltin?: boolean;
  icon?: string;
  capabilities?: AuditorCapabilities;
  ruleCapabilities?: Readonly<Record<string, AuditorCapabilities>>;
  gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  configFiles?: readonly AuditorConfigFileRequirement[];
  scripts?: readonly AuditorPackageScriptRequirement[];
  manifest?: AuditorManifestDTO;
  configKey?: string;
  defaultConfig?: Readonly<Record<string, unknown>>;
  criticalConfig?: AuditorCriticalConfig;
  ruleDescriptions?: Readonly<Record<string, string>>;
  ruleRemediations?: Readonly<Record<string, string>>;
}

export interface AuditTaskDescriptor {
  id?: string;
  name?: string;
  family?: AuditFamily;
  fast?: boolean;
  order?: number;
  timeoutMs?: number;
  permissions?: string[];
  extraArgs?: string[];
  requiresAst?: boolean;
  capabilities?: AuditorCapabilities;
  gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  configFiles?: readonly AuditorConfigFileRequirement[];
  scripts?: readonly AuditorPackageScriptRequirement[];
}

export type AuditRunMode = 'full' | 'preset' | 'family' | 'suites' | 'single';

export const RATCHET_STATUSES = ['passed', 'failed', 'initialized'] as const;
export type RatchetStatus = (typeof RATCHET_STATUSES)[number];

export interface AuditRunMetadata {
  version: string;
  timestamp: string;
  isFullAudit: boolean;
  runMode: AuditRunMode;
  preset: string | null;
  targetFamily: string | null;
  totalDiscoveredSuites: number;
  executedSuiteCount: number;
  executedSuites: string[];
  omittedSuites: string[];
  skipSimilar?: boolean;
  /** Whether the run is currently blocked by setup-phase errors, postponing application findings. */
  setupBlocking?: boolean;
  /** Total errors detected in setup suites. */
  setupErrors?: number;
  /** Total application errors postponed due to setup blocking. */
  postponedAppErrors?: number;
  /** Warning ratchet verdict (only on full default runs with `ratchet.enabled`). */
  ratchet?: {
    status: RatchetStatus;
    productionRef: string;
    newWarnings: number;
    resolvedWarnings: number;
    baselineUpdated: boolean;
    error?: string;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
  };
}

export interface AuditFileSummary {
  file: string;
  errors: number;
  warnings: number;
  findings: AuditFinding[];
}

export interface AuditByFileReport {
  meta: AuditRunMetadata;
  status: AuditExecutionStatus;
  summary: ConsolidatedAuditReport['summary'];
  totalAffectedFiles: number;
  files: Record<string, AuditFileSummary>;
}

export interface ConsolidatedAuditReport {
  meta: AuditRunMetadata;
  status: AuditExecutionStatus;
  summary: {
    totalViolations: number;
    errors: number;
    warnings: number;
    suitesTotal: number;
    suitesPassed: number;
    suitesFailed: number;
    durationMs: number;
    fixableErrors?: number;
    fixableWarnings?: number;
    autoFixRecommended?: boolean;
    autoFixCommand?: string;
  };
  families: Partial<
    Record<
      AuditFamily,
      {
        title: string;
        suites: StandardAuditResult[];
      }
    >
  >;
  allFindings: AuditFinding[];
  findingsByFile?: Record<string, AuditFinding[]>;
  remediationPhases?: Partial<
    Record<
      RemediationPhaseId,
      {
        title: string;
        order: number;
        errors: number;
        warnings: number;
        violations: number;
      }
    >
  >;
}

/**
 * Normalizes a file path from an AuditFinding into a clean relative POSIX path.
 */
export function normalizeFindingPath(filePath?: string, cwd: string = process.cwd()): string {
  if (!filePath) return 'General';
  const rel = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  const posix = rel.replaceAll(path.win32.sep, path.posix.sep);
  const clean = posix.startsWith('./') ? posix.slice(2) : posix;
  return clean || 'General';
}

/**
 * Stably sorts an array of AuditFinding instances by:
 * 1. Normalized relative file path (case-insensitive ASC)
 * 2. Line number (ASC, missing/undefined at top = 0)
 * 3. Column number (ASC)
 * 4. Severity ('error' first, then 'warning')
 * 5. Rule ID (ASC)
 */
export function sortFindingsByFileAndLine(
  findings: readonly AuditFinding[],
  cwd: string = process.cwd()
): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const fileA = normalizeFindingPath(a.file, cwd).toLowerCase();
    const fileB = normalizeFindingPath(b.file, cwd).toLowerCase();
    if (fileA !== fileB) {
      return fileA.localeCompare(fileB);
    }
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) {
      return lineA - lineB;
    }
    const colA = a.col ?? 0;
    const colB = b.col ?? 0;
    if (colA !== colB) {
      return colA - colB;
    }
    const sevScoreA = a.severity === 'error' ? 0 : 1;
    const sevScoreB = b.severity === 'error' ? 0 : 1;
    if (sevScoreA !== sevScoreB) {
      return sevScoreA - sevScoreB;
    }
    return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
  });
}

/**
 * Groups an array of AuditFindings into a map indexed by normalized relative file path,
 * where findings within each file are guaranteed sorted by line number ascending.
 */
export function groupFindingsByFileMap(
  findings: readonly AuditFinding[],
  cwd: string = process.cwd()
): Record<string, AuditFileSummary> {
  const sorted = sortFindingsByFileAndLine(findings, cwd);
  const map: Record<string, AuditFileSummary> = {};
  for (const f of sorted) {
    const norm = normalizeFindingPath(f.file, cwd);
    if (!map[norm]) {
      map[norm] = {
        file: norm,
        errors: 0,
        warnings: 0,
        findings: []
      };
    }
    if (f.severity === 'error') {
      map[norm].errors++;
    } else {
      map[norm].warnings++;
    }
    map[norm].findings.push(f);
  }
  return map;
}

export const ONE_MINUTE_MS = 60000;
export const MAX_AUDIT_STALENESS_MS = DEFAULT_MAX_AUDIT_STALENESS_MINUTES * ONE_MINUTE_MS;

export interface AssertAuditorOptions {
  maxAgeMs?: number;
  allowStale?: boolean;
  projectRoot?: string;
}

function assertAuditFreshness(
  meta: ConsolidatedAuditReport['meta'],
  consumerName: string,
  options: AssertAuditorOptions
): void {
  if (options.allowStale) return;
  const config = getAuditConfig(options.projectRoot);
  const configuredMinutes =
    config.runner?.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES;
  const maxAge = options.maxAgeMs ?? configuredMinutes * ONE_MINUTE_MS;
  try {
    const auditInstant = Temporal.Instant.from(meta.timestamp);
    const now = Temporal.Now.instant();
    const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
    if (elapsedMs > maxAge) {
      const elapsedMins = Math.max(
        1,
        Math.round(now.since(auditInstant).total({ unit: 'minute' }))
      );
      const limitMins = Math.round(maxAge / ONE_MINUTE_MS);
      throw new Error(
        `[${consumerName}] scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min). ` +
          `El código fuente puede haber cambiado desde la última auditoría. 👉 DEBES ejecutar 'npm run auditor' para refrescar el reporte.`
      );
    }
  } catch (err) {
    if ((err as Error).message.includes('OBSOLETO')) throw err;
    throw new Error(
      `[${consumerName}] scratch/audits/latest_audit.json contiene un timestamp inválido ('${meta.timestamp}'). Ejecuta 'npm run auditor' para regenerarlo.`,
      { cause: err }
    );
  }
}

function assertAuditSuiteExecuted(
  meta: ConsolidatedAuditReport['meta'],
  requiredSuiteId: string,
  consumerName: string
): void {
  const wasExecuted =
    Array.isArray(meta.executedSuites) && meta.executedSuites.includes(requiredSuiteId);
  const wasOmitted =
    Array.isArray(meta.omittedSuites) && meta.omittedSuites.includes(requiredSuiteId);

  if (!wasExecuted || wasOmitted) {
    const modeDesc =
      meta.runMode === 'preset'
        ? `preset=${meta.preset}`
        : meta.runMode === 'family'
          ? `family=${meta.targetFamily}`
          : meta.runMode;
    throw new Error(
      `[${consumerName}] La suite requerida '${requiredSuiteId}' NO fue ejecutada en la última auditoría. ` +
        `latest_audit.json fue generado por una corrida PARCIAL (${modeDesc}, ${meta.executedSuiteCount}/${meta.totalDiscoveredSuites} suites ejecutadas). ` +
        `👉 DEBES ejecutar 'npm run auditor' (completo) o 'npm run auditor task=${requiredSuiteId}' para obtener datos válidos.`
    );
  }
}

/**
 * Asserts that a required auditor was executed in the consolidated audit report
 * and that the report is fresh (generated within the last 5 minutes).
 * Throws a fatal descriptive error if the audit is partial, the suite was omitted,
 * or the report is stale.
 */
export function assertAuditorExecuted(
  report: Partial<ConsolidatedAuditReport> | null | undefined,
  requiredSuiteId: string,
  consumerName: string,
  options: AssertAuditorOptions = {}
): void {
  if (!report || !report.meta) {
    throw new Error(
      `[${consumerName}] scratch/audits/latest_audit.json no contiene la cabecera de metadatos 'meta'. ` +
        `Es posible que provenga de una versión obsoleta o esté corrupto. Ejecuta 'npm run auditor' para regenerarlo.`
    );
  }

  assertAuditFreshness(report.meta, consumerName, options);
  assertAuditSuiteExecuted(report.meta, requiredSuiteId, consumerName);
}

export function groupResultsByFamily(
  results: readonly StandardAuditResult[],
  initialFamilies?: readonly AuditFamily[]
): Map<AuditFamily, StandardAuditResult[]> {
  const byFamily = new Map<AuditFamily, StandardAuditResult[]>();
  if (initialFamilies) {
    for (const f of initialFamilies) byFamily.set(f, []);
  }
  for (const r of results) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family)!.push(r);
  }
  return byFamily;
}

export interface FixableFindingCounts {
  readonly fixableErrors: number;
  readonly fixableWarnings: number;
  readonly totalFixable: number;
}

/**
 * Single Source of Truth for counting fixable findings.
 * Conforms to the Zero False-Fix Mandate: only findings explicitly marked `fixable === true`
 * are counted as mechanically fixable.
 */
export function countFixableFindings(findings: readonly AuditFinding[]): FixableFindingCounts {
  let fixableErrors = 0;
  let fixableWarnings = 0;
  for (const f of findings) {
    if (f.fixable === true) {
      if (f.severity === 'error') {
        fixableErrors++;
      } else if (f.severity === 'warning') {
        fixableWarnings++;
      }
    }
  }
  return {
    fixableErrors,
    fixableWarnings,
    totalFixable: fixableErrors + fixableWarnings
  };
}

export interface FixableViolationsSummary {
  readonly fixableErrors: number;
  readonly fixableWarnings: number;
  readonly autoFixRecommended: boolean;
}

/**
 * Universal coordinator helper to evaluate fixable violations across all suite results.
 * Respects the Post-Fix Invariant: when isFixMode is true, fixableErrors is strictly 0.
 */
export function computeResultsFixableViolations(
  results: readonly StandardAuditResult[],
  isFixMode = false
): FixableViolationsSummary {
  if (isFixMode) {
    return { fixableErrors: 0, fixableWarnings: 0, autoFixRecommended: false };
  }

  let fixableErrors = 0;
  let fixableWarnings = 0;

  for (const res of results) {
    if (res.summary.fixableErrors !== undefined && res.summary.fixableWarnings !== undefined) {
      fixableErrors += res.summary.fixableErrors;
      fixableWarnings += res.summary.fixableWarnings;
    } else {
      const counts = countFixableFindings(res.findings);
      fixableErrors += counts.fixableErrors;
      fixableWarnings += counts.fixableWarnings;
    }
  }

  return {
    fixableErrors,
    fixableWarnings,
    autoFixRecommended: fixableErrors > 0 || fixableWarnings > 0
  };
}

/* ========================================================================= */
/* CANONICAL ZERO-IGNORE SEMANTIC DATA TYPES (Domain-Type-First Standard)    */
/* ========================================================================= */

/**
 * Flavored branding helper for compile-time domain safety and ergonomic assignability.
 */
export type Brand<T, B extends string> = T & { readonly __brand?: B };

/**
 * Open, human-readable display text, UI labels, narratives, or user-facing strings.
 * Use instead of raw `string` in component props, UI interfaces, and message models.
 */
export type DisplayText = Brand<string, 'DisplayText'>;

/**
 * Localized multi-language string dictionary or translated message token.
 */
export type LocalizedText = Brand<string, 'LocalizedText'>;

/**
 * Strict CSS hexadecimal color code string (e.g. '#fff', '#1e293b', '#38bdf880').
 */
export type HexColor = Brand<string, 'HexColor'>;

/**
 * Static asset relative URI, public URL, or SVG icon identifier.
 */
export type AssetUri = Brand<string, 'AssetUri'>;

/**
 * ISO 8601 extended date-time string (e.g. '2026-10-21T18:30:00.000Z').
 */
export type IsoDateString = Brand<string, 'IsoDateString'>;

/**
 * CSS class name, BEM block/element/modifier token, or Tailwind/scoped style token.
 */
export type CssClassName = Brand<string, 'CssClassName'>;

/**
 * DOM element identifier string or testing locator selector ID (e.g. 'submit-btn').
 */
export type DomElementId = Brand<string, 'DomElementId'>;

/**
 * Canonical RFC 4122 UUID string (e.g. user IDs, session IDs, database records).
 */
export type UserUuid = Brand<string, 'UserUuid'>;

/**
 * JSON primitive scalar values.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Recursive JSON value representation.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Generic dynamic JSON key-value dictionary container for serialization boundaries.
 * Use at external JSON API, file storage, or IPC boundaries instead of raw open `Record<string, unknown>`.
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Generic JSON array.
 */
export type JsonArray = JsonValue[];

/**
 * Canonical operation result container for loud, explicit error handling without silent catches.
 */
export type OperationResult<T, E = string> = {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: E;
  readonly message?: string;
};
