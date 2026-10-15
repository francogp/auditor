import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_agent_plugin.d.ts
export type AgentPluginRuleId = 'missing-agent-plugin-registration';
export declare const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[];
export declare class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
  constructor(options?: Partial<AuditorOptions<AgentPluginRuleId>>);
  private checkGating;
  private tryAutoFixPlugin;
  private reportMissingPluginViolation;
  runAudit(): Promise<void>;
}
//#endregion