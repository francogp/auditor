/**
 * src/suites/architecture/validate_dependency_minimums.ts
 *
 * CONDITIONAL MINIMUM LIBRARY VERSION AUDITOR (Node.js 26+ Native)
 *
 * For every library listed in the `peerDependencies` of @francogp/auditor, if the host
 * project declares it (dependencies / devDependencies / optionalDependencies), both the
 * declared range floor and the version locked in package-lock.json must be >= the
 * auditor floor. Libraries the host does not declare are ignored. Lint-only: never mutates.
 */
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
export { findDeclaredDependency, type DeclaredDependency } from '../../core/auditorMinimums.ts';
export declare const DEPENDENCY_MINIMUMS_RULES: readonly ["dependency-below-minimum-range", "dependency-below-minimum-installed"];
export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];
export declare class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
    constructor(options?: Partial<AuditorOptions<DependencyMinimumsRuleId>>);
    private readInstalledVersions;
    private installCommand;
    private auditDeclaredRange;
    private auditInstalledVersion;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_dependency_minimums.d.ts.map