import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
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