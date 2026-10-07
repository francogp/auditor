/**
 * src/suites/architecture/validate_agent_plugin.ts
 *
 * AGENT PLUGIN & SKILL INTEGRATION AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the host project has properly integrated the official @francogp/auditor
 * AI agent plugin in `.agents/plugins.json` (via `auditor-init-agent` / `npm run init-agent`).
 * In --fix mode, automatically registers the plugin into `.agents/plugins.json`.
 */
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
export type AgentPluginRuleId = 'missing-agent-plugin-registration';
export declare const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[];
export declare class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
    constructor(options?: Partial<AuditorOptions<AgentPluginRuleId>>);
    private checkGating;
    private tryAutoFixPlugin;
    private reportMissingPluginViolation;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_agent_plugin.d.ts.map