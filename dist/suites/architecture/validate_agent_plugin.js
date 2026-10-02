/**
 * src/suites/architecture/validate_agent_plugin.ts
 *
 * AGENT PLUGIN & SKILL INTEGRATION AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the host project has properly integrated the official @francogp/auditor
 * AI agent plugin in `.agents/plugins.json` (via `npx auditor-init-agent`).
 * In --fix mode, automatically registers the plugin into `.agents/plugins.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, loadAuditConfig } from "../../core/auditConfig.js";
import { initAgentSkill } from "../../cli/init_agent.js";
enableCompileCache();
export const AGENT_PLUGIN_RULES = [
    'missing-agent-plugin-registration'
];
function isSelfProviderProject(projectRoot) {
    const hostPkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(hostPkgPath))
        return false;
    try {
        const pkgData = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8'));
        if (pkgData.name === '@francogp/auditor') {
            const hasPluginJson = fs.existsSync(path.join(projectRoot, 'plugin.json'));
            const hasSkillMd = fs.existsSync(path.join(projectRoot, 'skills/auditor/SKILL.md')) ||
                fs.existsSync(path.join(projectRoot, 'skills/auditor-framework/SKILL.md'));
            return hasPluginJson && hasSkillMd;
        }
    }
    catch {
        // catch-ok: Fallback to checking host registration below
    }
    return false;
}
function isPluginRegisteredInAgents(projectRoot) {
    const pluginsJsonPath = path.join(projectRoot, '.agents/plugins.json');
    if (!fs.existsSync(pluginsJsonPath))
        return false;
    try {
        const raw = fs.readFileSync(pluginsJsonPath, 'utf8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data.entries))
            return false;
        return data.entries.some(e => e.path === 'node_modules/@francogp/auditor' ||
            e.path.endsWith('@francogp/auditor') ||
            e.path === './packages/auditor' ||
            e.path === 'packages/auditor');
    }
    catch {
        // catch-ok: malformed or unreadable plugins.json is treated as unregistered
        return false;
    }
}
export class AgentPluginAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            id: 'validate_agent_plugin',
            name: 'Agent Plugin & Skill Integration Validator',
            description: 'Verifica registro del plugin de auditoría para agentes',
            family: 'architecture',
            ruleIds: AGENT_PLUGIN_RULES,
            packageName: 'Agente',
            ruleDescriptions: {
                'missing-agent-plugin-registration': 'Plugin no registrado en .agents'
            },
            ...options
        });
    }
    async runAudit() {
        this.context.logStep(1, 1, 'Verificando integración de plugin y skill oficial para agentes...');
        this.filesScannedCount = 1;
        if (isSelfProviderProject(this.projectRoot)) {
            this.context.setMetric('Agent Plugin Status', 'Provider Validated');
            return;
        }
        const config = this.projectRoot !== process.cwd()
            ? await loadAuditConfig(this.projectRoot)
            : getAuditConfig();
        if (config.agentPlugin?.enabled === false) {
            this.context.logStep(1, 1, 'Validación de plugin para agentes omitida (agentPlugin.enabled: false).');
            this.context.setMetric('Agent Plugin Status', 'Disabled');
            return;
        }
        const isRegistered = isPluginRegisteredInAgents(this.projectRoot);
        if (!isRegistered) {
            const isFixMode = process.argv.includes('--fix') || process.argv.includes('fix');
            if (isFixMode) {
                this.context.logProgress('Auto-fixing missing agent plugin registration...');
                const result = initAgentSkill({ targetDir: this.projectRoot });
                if (result.success) {
                    this.context.logProgress(`✅ ${result.message}`);
                    this.context.setMetric('Agent Plugin Status', 'Auto-Fixed');
                    return;
                }
            }
            this.addViolation({
                ruleId: 'missing-agent-plugin-registration',
                severity: 'error',
                file: '.agents/plugins.json',
                line: 1,
                message: 'El plugin de auditoría para agentes de IA no está registrado en .agents/plugins.json. Ejecuta: npx auditor-init-agent',
                context: 'npx auditor-init-agent'
            });
            this.context.setMetric('Agent Plugin Status', 'Missing');
        }
        else {
            this.context.setMetric('Agent Plugin Status', 'Registered');
        }
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
//# sourceMappingURL=validate_agent_plugin.js.map