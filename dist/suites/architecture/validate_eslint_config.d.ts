import { BaseAuditor } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
export type EslintConfigRuleId = 'eslint-config-missing' | 'eslint-config-any-allowed' | 'eslint-config-double-cast-allowed' | 'eslint-config-ts-ignore-allowed' | 'eslint-config-legacy-date-allowed';
export declare const ESLINT_CONFIG_RULES: readonly EslintConfigRuleId[];
export interface EslintConfigAuditOptions {
    readonly projectRoot?: string;
    readonly configFile?: string;
}
/**
 * Validates that an ESLint configuration file enforces strict /domain-type-first rules.
 */
export declare function auditEslintConfigContent(content: string, fileName: string): AuditFinding[];
export declare class ValidateEslintConfigAuditor extends BaseAuditor<EslintConfigRuleId> {
    private readonly configFilePath?;
    constructor(options?: EslintConfigAuditOptions);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_eslint_config.d.ts.map