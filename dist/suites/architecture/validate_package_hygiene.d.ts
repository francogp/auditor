import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export type PackageHygieneRuleId = 'package-unused-dependency' | 'package-unlisted-dependency' | 'package-unused-binary';
export declare const PACKAGE_HYGIENE_RULES: readonly PackageHygieneRuleId[];
export interface KnipIssueItem {
    readonly name: string;
    readonly line?: number;
    readonly col?: number;
    readonly pos?: number;
}
export interface KnipFileIssues {
    readonly file: string;
    readonly dependencies?: readonly KnipIssueItem[];
    readonly devDependencies?: readonly KnipIssueItem[];
    readonly optionalPeerDependencies?: readonly KnipIssueItem[];
    readonly unlisted?: readonly KnipIssueItem[];
    readonly binaries?: readonly KnipIssueItem[];
    readonly unresolved?: readonly KnipIssueItem[];
}
export interface KnipReport {
    readonly issues?: readonly KnipFileIssues[];
}
export declare function extractReferencedScriptDependencies(projectRoot: string): Set<string>;
/**
 * Parses raw JSON output from Knip into canonical AuditFindings.
 */
export declare function parseKnipIssues(report: KnipReport | readonly KnipFileIssues[], projectRoot?: string, isPathIgnored?: (relPath: string) => boolean): AuditFinding[];
export declare class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
    private readonly fixMode;
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
    });
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_package_hygiene.d.ts.map