/**
 * packages/auditor/src/analyzers/auditRuleTypes.ts
 *
 * Core rule descriptors, violation schemas, and matching primitives
 * for architectural audits.
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
    appliesTo?: (filePath: string) => boolean;
    check?: (context: string, match: RegExpExecArray, filePath?: string) => boolean;
    severity?: AuditSeverity;
    fixable?: boolean;
    addImport?: string;
    maxLines?: number;
    ignorePattern?: RegExp;
    exemptConfigFiles?: RegExp;
}
export interface Violation {
    file: string;
    line: number;
    message: string;
    context?: string;
    severity: AuditSeverity;
    fixable?: boolean;
    packageName?: string;
    ruleId?: string;
    ruleDescription?: string;
}
export declare function matchesRule(descriptor: RuleDescriptor | AuditRule, selectedRules: ReadonlySet<string>): boolean;
export declare function normalizeFilePath(filePath: string): string;
export declare function getLineAtMatch(content: string, matchIndex: number): {
    line: string;
    lineStartPos: number;
    lineEndPos: number;
    trimmed: string;
};
export declare function isCommentLine(trimmed: string): boolean;
export declare function isTestOrNodeModules(filePath?: string): boolean;
//# sourceMappingURL=auditRuleTypes.d.ts.map