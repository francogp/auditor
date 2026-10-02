/**
 * scripts/auditors/architecture/validate_build_tools.ts
 *
 * Verifies native build tools and binaries (e.g. css-checker-kit).
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare function findCssCheckerBinary(): boolean;
export type BuildToolsRuleId = 'build-tools-binary-missing';
export declare const BUILD_TOOLS_RULES: readonly BuildToolsRuleId[];
export declare class BuildToolsAuditor extends BaseAuditor<BuildToolsRuleId> {
    constructor();
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_build_tools.d.ts.map