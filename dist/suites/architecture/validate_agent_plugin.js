/**
 * src/suites/architecture/validate_agent_plugin.ts
 *
 * AGENT PLUGIN & SKILL INTEGRATION AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the host project has properly integrated the official @francogp/auditor
 * AI agent plugin in `.agents/plugins.json` (via `auditor-init-agent` / `npm run init-agent`).
 * In --fix mode, automatically registers the plugin into `.agents/plugins.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, loadAuditConfig, isSelfProviderProject } from "../../core/auditConfig.js";
import { initAgentSkill } from "../../cli/init_agent.js";
enableCompileCache();
export const AGENT_PLUGIN_RULES = [
    'missing-agent-plugin-registration'
];
/** Agent registries read to verify the plugin/skills registration. */
const AGENT_REGISTRY_FILES = ['.agents/plugins.json', '.agents/skills.json'];
function isPluginRegisteredInAgents(projectRoot) {
    const pluginsJsonPath = path.join(projectRoot, '.agents/plugins.json');
    const skillsJsonPath = path.join(projectRoot, '.agents/skills.json');
    const checkFile = (filePath) => {
        if (!fs.existsSync(filePath))
            return false;
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (!Array.isArray(data.entries))
                return false;
            return data.entries.some(e => e.path === 'node_modules/@francogp/auditor' ||
                e.path.endsWith('@francogp/auditor') ||
                e.path.includes('@francogp/auditor') ||
                e.path === './packages/auditor' ||
                e.path === 'packages/auditor');
        }
        catch {
            // catch-ok: malformed or unreadable file is treated as unregistered
            return false;
        }
    };
    return checkFile(pluginsJsonPath) && checkFile(skillsJsonPath);
}
export class AgentPluginAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            capabilities: {
                fix: true,
                fixPriority: true,
                lint: false,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            fixableRuleIds: ['missing-agent-plugin-registration'],
            id: 'validate_agent_plugin',
            name: 'Agent Plugin & Skill Integration Validator',
            description: 'Verifica registro del plugin de auditoría para agentes',
            family: 'architecture',
            ruleIds: AGENT_PLUGIN_RULES,
            packageName: 'Agente',
            configKey: 'agentPlugin.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '🤖',
            ruleDescriptions: {
                'missing-agent-plugin-registration': 'Plugin/skills no registrados en .agents'
            },
            coverage: { include: [...AGENT_REGISTRY_FILES] },
            ...options
        });
    }
    async checkGating() {
        if (isSelfProviderProject(this.projectRoot)) {
            this.context.setMetric('Agent Plugin Status', 'Provider Validated');
            this.markRuleNotApplicable('missing-agent-plugin-registration', 'Proyecto proveedor de @francogp/auditor (auto-registro)');
            return true;
        }
        const config = this.projectRoot !== process.cwd()
            ? await loadAuditConfig(this.projectRoot)
            : getAuditConfig();
        if (config.agentPlugin?.enabled === false) {
            this.context.setMetric('Agent Plugin Status', 'Disabled');
            this.markRuleNotApplicable('missing-agent-plugin-registration', 'config.agentPlugin.enabled = false');
            return true;
        }
        return false;
    }
    tryAutoFixPlugin() {
        const isFixMode = process.argv.includes('--fix') || process.argv.includes('fix');
        if (!isFixMode)
            return false;
        this.context.logProgress('Auto-fixing missing agent plugin registration...');
        const result = initAgentSkill({ targetDir: this.projectRoot });
        if (result.success) {
            this.context.logProgress(`✅ ${result.message}`);
            this.context.setMetric('Agent Plugin Status', 'Auto-Fixed');
            return true;
        }
        return false;
    }
    reportMissingPluginViolation() {
        const pluginsJsonPath = path.join(this.projectRoot, '.agents/plugins.json');
        const skillsJsonPath = path.join(this.projectRoot, '.agents/skills.json');
        const missingFiles = [];
        if (!fs.existsSync(pluginsJsonPath))
            missingFiles.push('.agents/plugins.json');
        if (!fs.existsSync(skillsJsonPath))
            missingFiles.push('.agents/skills.json');
        const targetFile = missingFiles[0] || '.agents/plugins.json';
        this.addViolation({
            ruleId: 'missing-agent-plugin-registration',
            severity: 'error',
            file: targetFile,
            line: 1,
            message: 'El plugin y/o skills de auditoría para agentes no están registrados en .agents/plugins.json y .agents/skills.json. Ejecuta: npm run auditor:init-agent',
            context: 'auditor:init-agent'
        });
        this.context.setMetric('Agent Plugin Status', 'Missing');
    }
    async runAudit() {
        if (await this.checkGating())
            return;
        for (const registryFile of AGENT_REGISTRY_FILES) {
            if (fs.existsSync(path.join(this.projectRoot, registryFile)))
                this.recordScanned(registryFile);
        }
        this.markRuleEvaluated('missing-agent-plugin-registration');
        if (isPluginRegisteredInAgents(this.projectRoot)) {
            this.context.setMetric('Agent Plugin Status', 'Registered');
            return;
        }
        if (this.tryAutoFixPlugin())
            return;
        this.reportMissingPluginViolation();
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
//# sourceMappingURL=validate_agent_plugin.js.map