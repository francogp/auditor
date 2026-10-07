import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export declare const PACKAGE_HYGIENE_RULES: readonly ["package-unused-dependency", "package-unlisted-dependency", "package-unused-binary", "package-lockfile-integrity"];
export type PackageHygieneRuleId = (typeof PACKAGE_HYGIENE_RULES)[number];
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
/**
 * Validates package-lock.json integrity, version standards, and absence of insecure HTTP registries.
 */
export declare function verifyLockfileIntegrity(projectRoot: string): AuditFinding[];
export declare class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
    });
    runAudit(): Promise<void>;
    private readFallowConfigData;
    private buildEphemeralKnipConfig;
    private executeKnip;
    private processKnipFindings;
}
//# sourceMappingURL=validate_package_hygiene.d.ts.map