#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/init_agent.ts
 *
 * Antigravity Agent Plugin Registrator (Node.js 26+ Native)
 * Automatically registers @francogp/auditor in .agents/plugins.json of the host project
 * so Antigravity AI agents instantly discover the official auditor-framework skill and rules.
 */
export interface InitAgentOptions {
    targetDir?: string;
    dryRun?: boolean;
}
export declare function initAgentSkill(options?: InitAgentOptions): {
    success: boolean;
    message: string;
    created: boolean;
};
//# sourceMappingURL=init_agent.d.ts.map