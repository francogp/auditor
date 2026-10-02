/**
 * scripts/maintenance/audit_rules.ts
 *
 * Centralized audit rules and checkers for the unified audit engine.
 */
export declare const AUDIT_SEVERITIES: readonly ["error", "warning"];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];
export interface RuleDescriptor {
    readonly id: string;
    readonly name: string;
    readonly category?: string;
    readonly aliases?: readonly string[];
    readonly packageName?: string;
}
export interface AuditRule extends Partial<RuleDescriptor> {
    regex: RegExp;
    message: string | ((match: string) => string);
    fix?: (match: string) => string;
    check?: (context: string, match: RegExpExecArray, filePath?: string) => boolean;
    severity?: AuditSeverity;
    fixable?: boolean;
    addImport?: string;
    maxLines?: number;
    ignorePattern?: RegExp;
    exemptConfigFiles?: RegExp;
}
export declare function matchesRule(descriptor: RuleDescriptor | AuditRule, selectedRules: ReadonlySet<string>): boolean;
export declare const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor;
export declare const FALLOW_SUITE_DESCRIPTORS: Record<'dupes' | 'triplets' | 'security' | 'dead-code' | 'health', RuleDescriptor>;
export declare const SASS_MIGRATOR_DESCRIPTOR: RuleDescriptor;
export interface Violation {
    file: string;
    line: number;
    message: string;
    context: string;
    severity: AuditSeverity;
    fixable: boolean;
    packageName?: string;
    ruleId?: string;
    ruleDescription?: string;
}
export declare const CANONICAL_DEFAULT_Z_LAYERS: Record<string, number>;
export declare const Z_LAYERS: Record<string, number>;
export declare const Z_VALUE_MAP: {
    [k: string]: string;
};
export declare const Z_SORTED_ENTRIES: [string, number][];
export interface ZLayerResolution {
    exactKey?: string;
    nearestKey?: string;
    offset?: number;
    cssVarExpr?: string;
}
export declare function resolveZLayer(val: number): ZLayerResolution;
/**
 * Native cross-platform path resolver using node:path.
 * Produces a normalized relative POSIX path from the project root for deterministic rule evaluation.
 */
export declare function normalizeFilePath(filePath: string): string;
export declare function getLineAtMatch(content: string, matchIndex: number): {
    line: string;
    lineStartPos: number;
    lineEndPos: number;
    trimmed: string;
};
export declare function isCommentLine(trimmed: string): boolean;
export declare function isTestOrNodeModules(filePath?: string): boolean;
export declare const viewport: AuditRule;
export declare const gpuGaps: AuditRule;
export declare const legacyDates: AuditRule;
export declare const hardcodedTimezone: AuditRule;
export declare function getDomainIdFallbackRegex(): RegExp;
export declare function isDomainAuditTarget(filePath?: string, config?: import("../../index.ts").AuditEngineConfig): filePath is string;
export declare function isAuditableCodeFile(filePath?: string, config?: import("../../index.ts").AuditEngineConfig): filePath is string;
export declare function isAllowedDatabaseFile(filePath: string, config?: import("../../index.ts").AuditEngineConfig): boolean;
export declare const noDomainIdFallbacks: AuditRule;
export declare const nodePrefix: AuditRule;
export declare const esmExtensions: AuditRule;
export declare const tsIgnore: AuditRule;
export declare const noAliasConstants: AuditRule;
export declare const DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES: string[];
export declare function isConstantNameExemptFromNumericSuffixCheck(constName: string, config?: import("../../index.ts").AuditEngineConfig): boolean;
export declare const noLiteralSuffixInConstantName: AuditRule;
export declare const timersPromises: AuditRule;
export declare const explicitResource: AuditRule;
export declare const manualAnimations: AuditRule;
export declare const emptyVueTransitions: AuditRule;
export declare const manualTimersFrontend: AuditRule;
export declare const zeroTimerLogic: AuditRule;
export declare const noPlaywrightWaitForTimeout: AuditRule;
export declare const jsonStringifyInWatch: AuditRule;
export declare const intersectionObserverRoot: AuditRule;
export declare function getProhibitedTemplateDbRegex(): RegExp;
export declare const dbInTemplates: AuditRule;
export declare const functionCallsInTemplates: AuditRule;
export declare const zIndexAudit: AuditRule;
export declare const zIndexConstantDeclaration: AuditRule;
export declare const forbiddenFallbacks: AuditRule;
export declare const doxIndexIntegrity: AuditRule;
export declare const forbiddenTypeCasts: AuditRule;
/** Standard numeric identity values and HTTP status codes exempt from magic number audit */
export declare const EXEMPT_AUDIT_NUMERIC_LITERALS: ReadonlySet<number>;
export declare const magicNumbers: AuditRule;
export declare const badConstantNames: AuditRule;
export declare const noLiteralBooleanType: AuditRule;
export declare const noInlineAnonymousObjectType: AuditRule;
export declare const noFloatingPromises: AuditRule;
export declare const noLeakedGlobalState: AuditRule;
export declare const missingInteractiveId: AuditRule;
export declare const sassTraps: AuditRule;
export declare const strictDomainParamTypes: AuditRule;
export declare const noInlineTypeImports: AuditRule;
export declare const noInlineLiteralUnions: AuditRule;
export declare const noImportantOnTransforms: AuditRule;
export declare const noImportantOnFilters: AuditRule;
export declare const noRawJsonImportsOutsideData: AuditRule;
export declare const noSassAtImport: AuditRule;
export declare const noLayoutAnimationInGsap: AuditRule;
export declare function getNamedTimerConstantsRegex(): RegExp;
export declare const namedTimerConstants: AuditRule;
export declare const auditRulesConfig: {
    viewport: AuditRule;
    gpuGaps: AuditRule;
    legacyDates: AuditRule;
    hardcodedTimezone: AuditRule;
    nodePrefix: AuditRule;
    esmExtensions: AuditRule;
    tsIgnore: AuditRule;
    timersPromises: AuditRule;
    explicitResource: AuditRule;
    zIndexAudit: AuditRule;
    zIndexConstantDeclaration: AuditRule;
    manualAnimations: AuditRule;
    emptyVueTransitions: AuditRule;
    manualTimersFrontend: AuditRule;
    zeroTimerLogic: AuditRule;
    noPlaywrightWaitForTimeout: AuditRule;
    jsonStringifyInWatch: AuditRule;
    intersectionObserverRoot: AuditRule;
    dbInTemplates: AuditRule;
    functionCallsInTemplates: AuditRule;
    forbiddenFallbacks: AuditRule;
    forbiddenTypeCasts: AuditRule;
    doxIndexIntegrity: AuditRule;
    noDomainIdFallbacks: AuditRule;
    strictDomainParamTypes: AuditRule;
    noInlineTypeImports: AuditRule;
    noInlineLiteralUnions: AuditRule;
    magicNumbers: AuditRule;
    badConstantNames: AuditRule;
    noAliasConstants: AuditRule;
    noLiteralSuffixInConstantName: AuditRule;
    noLiteralBooleanType: AuditRule;
    noInlineAnonymousObjectType: AuditRule;
    noFloatingPromises: AuditRule;
    noLeakedGlobalState: AuditRule;
    missingInteractiveId: AuditRule;
    sassTraps: AuditRule;
    noImportantOnTransforms: AuditRule;
    noImportantOnFilters: AuditRule;
    noRawJsonImportsOutsideData: AuditRule;
    noSassAtImport: AuditRule;
    noLayoutAnimationInGsap: AuditRule;
    namedTimerConstants: AuditRule;
};
//# sourceMappingURL=audit_rules.d.ts.map