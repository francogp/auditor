/**
 * src/suites/architecture/validate_environment_engines.ts
 *
 * SSoT ENVIRONMENT ENGINES & RUNTIME AUDITOR (Node.js 26+ Native)
 *
 * Verifies that package.json declares engines.node and engines.npm satisfying or
 * exceeding the @francogp/auditor engine floor, and that the active runtime matches.
 * In --fix mode, automatically repairs package.json engines or invokes the canonical
 * setup script (setup-windows.ps1 / setup-linux.sh) to align the environment.
 */
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
export declare const ENVIRONMENT_ENGINES_RULES: readonly ["environment-engines-missing", "environment-engines-below-floor", "environment-runtime-mismatch"];
export type EnvironmentEnginesRuleId = (typeof ENVIRONMENT_ENGINES_RULES)[number];
export interface EnvironmentEnginesConfig {
    readonly enabled?: boolean;
}
export declare function detectNpmVersion(): string;
export declare function extractBaseNodeVersion(engineStr: string): string;
export declare function syncNvmrc(projectRoot: string, targetNodeEngine: string): boolean;
export declare class ValidateEnvironmentEnginesAuditor extends BaseAuditor<EnvironmentEnginesRuleId> {
    constructor(options?: Partial<AuditorOptions<EnvironmentEnginesRuleId>>);
    private validatePackageJson;
    private auditMissingEngines;
    private auditEnginesBelowFloor;
    private auditRuntimeMismatch;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_environment_engines.d.ts.map