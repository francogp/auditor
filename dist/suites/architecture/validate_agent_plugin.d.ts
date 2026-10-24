import { SharedAstContext } from "../../core/astContext.js";
import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
export type AgentPluginRuleId = 'missing-agent-plugin-registration' | 'skill-invalid-yaml-frontmatter' | 'skill-invalid-asset-syntax';
export declare const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[];
export declare class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
  private readonly skillsRoots;
  private readonly primaryAgentDir;
  constructor(options?: Partial<AuditorOptions<AgentPluginRuleId>>);
  private checkGating;
  private tryAutoFixPlugin;
  private reportMissingPluginViolation;
  private validateSkillFrontmatter;
  private validateSkillName;
  private validateSkillDescription;
  private validateSkillAsset;
  runAudit(astContext?: SharedAstContext): Promise<void>;
}