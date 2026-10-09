/**
 * src/suites/architecture/validate_git_config.ts
 *
 * SSoT GIT CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the local Git repository (.git/config) enforces standard repository
 * settings: core.filemode = false, core.autocrlf = input, and core.eol = lf.
 * In --fix mode, automatically configures these settings locally via git config.
 */
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
export declare const GIT_CONFIG_RULES: readonly ["git-config-filemode", "git-config-autocrlf", "git-config-eol"];
export type GitConfigRuleId = (typeof GIT_CONFIG_RULES)[number];
export interface GitConfigSetting {
    readonly key: string;
    readonly expected: string;
    readonly ruleId: GitConfigRuleId;
}
export declare const REQUIRED_GIT_CONFIGS: readonly GitConfigSetting[];
export declare function getLocalGitConfig(key: string, projectRoot: string): string | null;
export declare function setLocalGitConfig(key: string, value: string, projectRoot: string): boolean;
export declare class ValidateGitConfigAuditor extends BaseAuditor<GitConfigRuleId> {
    constructor(options?: Partial<AuditorOptions<GitConfigRuleId>>);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_git_config.d.ts.map