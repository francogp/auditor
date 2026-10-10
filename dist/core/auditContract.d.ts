/**
 * packages/auditor/src/core/auditContract.ts
 *
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */
import { type CustomAuditFamilyConfig, type AuditEngineConfig } from './auditConfig.ts';
export declare const BUILTIN_AUDIT_FAMILIES: readonly ["architecture", "domain_data", "persistence", "documentation"];
export type BuiltinAuditFamily = (typeof BUILTIN_AUDIT_FAMILIES)[number];
export type AuditFamily = BuiltinAuditFamily | (string & {});
export interface FamilyMetadata {
    key: string;
    title: string;
    order: number;
    icon: string;
    description: string;
}
export declare const FAMILY_METADATA: Record<string, FamilyMetadata>;
export declare const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
export declare const FALLBACK_FAMILY_ORDER = 99;
export declare function resolveFamilyMetadata(familyKey: string, customFamilies?: readonly CustomAuditFamilyConfig[]): FamilyMetadata;
export declare function getActiveFamilies(customFamilies?: readonly CustomAuditFamilyConfig[]): readonly string[];
export declare const FINDING_SEVERITIES: readonly ["error", "warning", "info"];
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
}
export declare const AUDIT_STATUSES: readonly ["passed", "failed", "skipped"];
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];
export interface SubAuditorStep {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
}
export declare const SUB_AUDITOR_STATUSES: readonly ["passed", "warning", "failed"];
export type SubAuditorStatus = (typeof SUB_AUDITOR_STATUSES)[number];
export interface SubAuditorReport {
    readonly id: string;
    readonly name: string;
    readonly status: SubAuditorStatus;
    readonly count: number;
    readonly errorsCount?: number;
    readonly warningsCount?: number;
    readonly detail?: string;
}
export interface ICompositeAuditor {
    getSubAuditors(): readonly SubAuditorStep[];
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
export interface AuditorCapabilities {
    /** Whether the sub-auditor implements automated repairs when invoked with --fix */
    readonly fix: boolean;
    /** Whether the sub-auditor bootstraps environment or auditor configuration and must run FIRST in fix mode */
    readonly fixPriority: boolean;
    /** Whether the sub-auditor participates in the fast lint preset runs (preset=lint / npm run auditor:lint) */
    readonly lint: boolean;
    /** Whether the sub-auditor participates in the markdown/documentation preset runs (preset=md / npm run auditor:md) */
    readonly md: boolean;
    /** Whether the sub-auditor requires the shared in-memory TypeScript AST context */
    readonly ast: boolean;
    /** Whether the sub-auditor supports incremental git diff scoping via --changed-since */
    readonly changedSince: boolean;
    /** Whether the sub-auditor is computationally heavy or resource-intensive (e.g. vector ML, type check) */
    readonly heavy: boolean;
    /** Whether the sub-auditor requires pre-compiled production artifacts in dist/ */
    readonly requiresBuild: boolean;
    /** Whether the sub-auditor must run AFTER every other suite of the run (e.g. coverage verification over their ledgers) */
    readonly postRun: boolean;
}
export declare const COVERAGE_SOURCES: readonly ["runtime", "declared-only"];
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
    readonly customMissingMessage?: string | ((context: AuditorConfigFixContext, file: string) => string);
    /** Optional custom file path to report on violations (e.g. legacy file name instead of primary) */
    readonly customMissingFile?: (context: AuditorConfigFixContext, defaultFile: string) => string;
}
/**
 * DTO Canónico del Manifiesto de un Sub-Auditor.
 * Contrato inmutable mínimo y estructurado para que herramientas,
 * CLIs y agentes de IA conozcan el propósito y ejecución del auditor.
 */
export interface AuditorManifestDTO {
    /** Identificador único de la suite (ej: 'validate_accessibility') */
    readonly id: string;
    /** Nombre formal legible (ej: 'Web & Vue Accessibility Standards') */
    readonly name: string;
    /** Familia canónica del auditor ('architecture', 'domain_data', 'persistence', 'documentation', etc.) */
    readonly family: string;
    /** Emoji temático obligatorio */
    readonly icon: string;
    /**
     * Resumen conciso y obligatorio de para qué sirve y qué valida (máx 60 caracteres).
     * Obligatorio, directo y sin paredes de texto.
     */
    readonly description: string;
    /** Flags / capacidades de ejecución soportadas */
    readonly capabilities: {
        readonly fix: boolean;
        readonly lint: boolean;
        readonly md: boolean;
        readonly ast: boolean;
        readonly changedSince: boolean;
        readonly heavy: boolean;
        readonly requiresBuild: boolean;
        readonly postRun: boolean;
    };
    /** Catálogo de reglas evaluadas con su descripción concisa en español */
    readonly rules: Readonly<Record<string, string>>;
    /** Lista de ruleIds que esta suite puede reparar mecánicamente de forma automática */
    readonly fixableRules: readonly string[];
    /**
     * Clave o sección de configuración en .auditor/audit.config.ts si la utiliza de forma específica.
     * Conciso (ej: 'styles.baseScssFile', 'fallow.security', 'testCoverage.thresholds', 'paths', 'core').
     */
    readonly configKey: string;
    /**
     * Configuración por defecto obligatoria declarada por el auditor para su inyección dinámica en audit.config.ts.
     */
    readonly defaultConfig: Readonly<Record<string, unknown>>;
    /**
     * Configuración crítica e invariantes inmutables declaradas por el auditor (obligatorio por contrato, puede ser objeto vacío {}).
     */
    readonly criticalConfig: {
        readonly rationale?: string;
        readonly requiredMinimums?: Readonly<Record<string, readonly (string | number)[]>>;
        readonly forbiddenOverrides?: Readonly<Record<string, readonly unknown[]>>;
    };
    /**
     * Contrato obligatorio de comandos de ejecución y scripts en package.json expuestos por este auditor.
     */
    readonly scripts: readonly AuditorPackageScriptRequirement[];
}
/**
 * Contrato de configuración crítica e invariantes inmutables de un auditor.
 */
export interface AuditorCriticalConfig<TConfig = unknown> {
    /**
     * Justificación técnica y arquitectónica que explica por qué este piso mínimo es obligatorio y no negociable.
     * Obligatorio cuando se definen restricciones críticas.
     */
    readonly rationale?: string;
    /**
     * Diccionario de propiedades o listas que actúan como piso mínimo obligatorio.
     * El proyecto anfitrión puede agregar más elementos (aditivo), pero si omite alguno de estos, falla.
     * Ejemplo: { 'strictProperties': ['/color$/', 'font-size', 'z-index'] }
     */
    readonly requiredMinimums?: Readonly<Record<string, readonly (string | number)[]>>;
    /**
     * Valores o anulaciones estrictamente prohibidas.
     * Mapea rutas de propiedades a los valores desautorizados (e.g. false, 'off', 0, null).
     * Ejemplo: { 'enabled': [false], 'rules.@typescript-eslint/no-explicit-any': ['off', 0] }
     */
    readonly forbiddenOverrides?: Readonly<Record<string, readonly unknown[]>>;
    /**
     * Validador semántico personalizado para invariantes complejas o multidimensionales.
     * Retorna un string con el motivo de violación si no cumple, o null/undefined si es válido.
     */
    readonly validate?: (config: TConfig, projectRoot: string) => string | null | undefined;
    /**
     * Generador opcional de reparación mecánica para re-inyectar los mínimos en el archivo correspondiente.
     */
    readonly repair?: (currentConfig: TConfig, projectRoot: string) => TConfig | Promise<TConfig>;
}
/**
 * Derives the canonical package.json script requirement for any auditor by convention.
 */
export declare function deriveCanonicalAuditorScript(id: string, description: string, overrides?: Partial<AuditorPackageScriptRequirement>): AuditorPackageScriptRequirement;
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
    gitIgnoreEntries?: readonly GitIgnoreRequirement[];
    configFiles?: readonly AuditorConfigFileRequirement<string>[];
    scripts?: readonly AuditorPackageScriptRequirement[];
    manifest?: AuditorManifestDTO;
    configKey?: string;
    defaultConfig?: Readonly<Record<string, unknown>>;
    criticalConfig?: AuditorCriticalConfig;
    ruleDescriptions?: Readonly<Record<string, string>>;
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
    configFiles?: readonly AuditorConfigFileRequirement<string>[];
    scripts?: readonly AuditorPackageScriptRequirement[];
}
export type AuditRunMode = 'full' | 'preset' | 'family' | 'suites' | 'single';
export declare const RATCHET_STATUSES: readonly ["passed", "failed", "initialized"];
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
    families: Partial<Record<AuditFamily, {
        title: string;
        suites: StandardAuditResult[];
    }>>;
    allFindings: AuditFinding[];
    findingsByFile?: Record<string, AuditFinding[]>;
}
/**
 * Normalizes a file path from an AuditFinding into a clean relative POSIX path.
 */
export declare function normalizeFindingPath(filePath?: string, cwd?: string): string;
/**
 * Stably sorts an array of AuditFinding instances by:
 * 1. Normalized relative file path (case-insensitive ASC)
 * 2. Line number (ASC, missing/undefined at top = 0)
 * 3. Column number (ASC)
 * 4. Severity ('error' first, then 'warning')
 * 5. Rule ID (ASC)
 */
export declare function sortFindingsByFileAndLine(findings: readonly AuditFinding[], cwd?: string): AuditFinding[];
/**
 * Groups an array of AuditFindings into a map indexed by normalized relative file path,
 * where findings within each file are guaranteed sorted by line number ascending.
 */
export declare function groupFindingsByFileMap(findings: readonly AuditFinding[], cwd?: string): Record<string, AuditFileSummary>;
export declare const ONE_MINUTE_MS = 60000;
export declare const MAX_AUDIT_STALENESS_MS: number;
export interface AssertAuditorOptions {
    maxAgeMs?: number;
    allowStale?: boolean;
    projectRoot?: string;
}
/**
 * Asserts that a required auditor was executed in the consolidated audit report
 * and that the report is fresh (generated within the last 5 minutes).
 * Throws a fatal descriptive error if the audit is partial, the suite was omitted,
 * or the report is stale.
 */
export declare function assertAuditorExecuted(report: Partial<ConsolidatedAuditReport> | null | undefined, requiredSuiteId: string, consumerName: string, options?: AssertAuditorOptions): void;
export declare function groupResultsByFamily(results: readonly StandardAuditResult[], initialFamilies?: readonly AuditFamily[]): Map<AuditFamily, StandardAuditResult[]>;
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
export declare function countFixableFindings(findings: readonly AuditFinding[]): FixableFindingCounts;
export interface FixableViolationsSummary {
    readonly fixableErrors: number;
    readonly fixableWarnings: number;
    readonly autoFixRecommended: boolean;
}
/**
 * Universal coordinator helper to evaluate fixable violations across all suite results.
 * Respects the Post-Fix Invariant: when isFixMode is true, fixableErrors is strictly 0.
 */
export declare function computeResultsFixableViolations(results: readonly StandardAuditResult[], isFixMode?: boolean): FixableViolationsSummary;
//# sourceMappingURL=auditContract.d.ts.map