/**
 * scripts/maintenance/audit_rules.ts
 *
 * Centralized audit rules and checkers for the unified audit engine.
 */
export { AUDIT_SEVERITIES, type AuditSeverity, type RuleDescriptor, type AuditRule, type Violation, matchesRule } from '../../analyzers/auditRuleTypes.ts';
import { type RuleDescriptor, type AuditRule } from '../../analyzers/auditRuleTypes.ts';
export { Z_INDEX_CONSISTENCY_DESCRIPTOR, CANONICAL_DEFAULT_Z_LAYERS, Z_LAYERS, Z_VALUE_MAP, Z_SORTED_ENTRIES, type ZLayerResolution, resolveZLayer, zIndexAudit, zIndexConstantDeclaration } from '../../analyzers/zIndexRules.ts';
export declare const FALLOW_SUITE_DESCRIPTORS: Record<'dupes' | 'triplets' | 'security' | 'dead-code' | 'health', RuleDescriptor>;
export declare const SASS_MIGRATOR_DESCRIPTOR: RuleDescriptor;
export { normalizeFilePath, getLineAtMatch, isCommentLine, isTestOrNodeModules } from '../../analyzers/auditRuleTypes.ts';
export declare const viewport: AuditRule;
export declare const legacyDates: AuditRule;
export declare const hardcodedTimezone: AuditRule;
export declare function getDomainIdFallbackRegex(): RegExp;
export declare function isDomainAuditTarget(filePath?: string, config?: import("../../index.ts").AuditEngineConfig): filePath is string;
export declare function isAllowedDatabaseFile(filePath: string, config?: import("../../index.ts").AuditEngineConfig): boolean;
export declare const noDomainIdFallbacks: AuditRule;
export declare const nodePrefix: AuditRule;
export declare const esmExtensions: AuditRule;
export declare const tsIgnore: AuditRule;
export { isAuditableCodeFile, DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES, isConstantNameExemptFromNumericSuffixCheck, noAliasConstants, noLiteralSuffixInConstantName, badConstantNames } from '../../analyzers/constantRules.ts';
export declare const timersPromises: AuditRule;
export declare const explicitResource: AuditRule;
export declare const zeroTimerLogic: AuditRule;
export declare const jsonStringifyInWatch: AuditRule;
export declare const intersectionObserverRoot: AuditRule;
export declare const functionCallsInTemplates: AuditRule;
export declare const forbiddenFallbacks: AuditRule;
export declare const forbiddenTypeCasts: AuditRule;
export declare const noLiteralBooleanType: AuditRule;
export declare const noInlineAnonymousObjectType: AuditRule;
export declare const noFloatingPromises: AuditRule;
export declare const noLeakedGlobalState: AuditRule;
export declare const strictDomainParamTypes: AuditRule;
export declare const noInlineTypeImports: AuditRule;
export declare const noInlineLiteralUnions: AuditRule;
export declare const noRawJsonImportsOutsideData: AuditRule;
export declare const noSassAtImport: AuditRule;
export declare const auditRulesConfig: {
    viewport: AuditRule;
    hardcodedTimezone: AuditRule;
    nodePrefix: AuditRule;
    esmExtensions: AuditRule;
    timersPromises: AuditRule;
    explicitResource: AuditRule;
    zeroTimerLogic: AuditRule;
    jsonStringifyInWatch: AuditRule;
    intersectionObserverRoot: AuditRule;
    functionCallsInTemplates: AuditRule;
    forbiddenFallbacks: AuditRule;
    noDomainIdFallbacks: AuditRule;
    noInlineTypeImports: AuditRule;
    noRawJsonImportsOutsideData: AuditRule;
    noSassAtImport: AuditRule;
};
//# sourceMappingURL=audit_rules.d.ts.map