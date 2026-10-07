import { type Message } from 'publint';
import { formatMessage } from 'publint/utils';
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export declare const PACKAGE_DISTRIBUTION_RULES: readonly ["pkg-distribution-invalid-exports", "pkg-distribution-missing-types", "pkg-distribution-dual-package-hazard"];
export type PackageDistributionRuleId = (typeof PACKAGE_DISTRIBUTION_RULES)[number];
export type PublintMessageLike = Message;
/**
 * Maps a publint message code to a canonical PackageDistributionRuleId.
 */
export declare function mapPublintCodeToRuleId(code: string): PackageDistributionRuleId;
export type PublintPkg = Parameters<typeof formatMessage>[1];
/**
 * Parses publint messages into canonical AuditFindings.
 */
export declare function parsePublintMessages(messages: readonly PublintMessageLike[], pkg: PublintPkg, _projectRoot?: string): AuditFinding[];
export declare class ValidatePackageDistributionAuditor extends BaseAuditor<PackageDistributionRuleId> {
    constructor(options?: {
        projectRoot?: string;
    });
    runAudit(): Promise<void>;
    private readTargetPackageJson;
    private runPublintAnalysis;
}
//# sourceMappingURL=validate_package_distribution.d.ts.map