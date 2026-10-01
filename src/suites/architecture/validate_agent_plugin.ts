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
import { BaseAuditor, type AuditorOptions } from '../../core/auditorBase.ts';
import { initAgentSkill } from '../../cli/init_agent.ts';

enableCompileCache();

export type AgentPluginRuleId = 'missing-agent-plugin-registration';

export const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[] = [
  'missing-agent-plugin-registration'
] as const;

export class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
  constructor(options: Partial<AuditorOptions<AgentPluginRuleId>> = {}) {
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

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 1, 'Verificando integración de plugin y skill oficial para agentes...');
    this.filesScannedCount = 1;

    const hostPkgPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(hostPkgPath)) {
      try {
        const pkgData = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as { name?: string };
        // If the project being audited is @francogp/auditor itself, it is the provider of the plugin and skill
        if (pkgData.name === '@francogp/auditor') {
          const hasPluginJson = fs.existsSync(path.join(this.projectRoot, 'plugin.json'));
          const hasSkillMd = fs.existsSync(path.join(this.projectRoot, 'skills/auditor-framework/SKILL.md'));
          if (hasPluginJson && hasSkillMd) {
            this.context.setMetric('Agent Plugin Status', 'Provider Validated');
            return;
          }
        }
      } catch {
        // Fallback to checking host registration below
      }
    }

    const pluginsJsonPath = path.join(this.projectRoot, '.agents/plugins.json');
    let isRegistered = false;

    if (fs.existsSync(pluginsJsonPath)) {
      try {
        const raw = fs.readFileSync(pluginsJsonPath, 'utf8');
        const data = JSON.parse(raw) as { entries?: Array<{ path: string }> };
        if (Array.isArray(data.entries)) {
          isRegistered = data.entries.some(
            e => e.path === 'node_modules/@francogp/auditor' || e.path.endsWith('@francogp/auditor')
          );
        }
      } catch {
        isRegistered = false;
      }
    }

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
    } else {
      this.context.setMetric('Agent Plugin Status', 'Registered');
    }
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new AgentPluginAuditor());
}
