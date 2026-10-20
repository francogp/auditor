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
import yaml from 'yaml';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  type AuditorOptions,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig, loadAuditConfig, isSelfProviderProject } from '../../core/auditConfig.ts';
import { initAgentSkill } from '../../cli/init_agent.ts';

enableCompileCache();

export type AgentPluginRuleId =
  | 'missing-agent-plugin-registration'
  | 'skill-invalid-yaml-frontmatter';

export const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[] = [
  'missing-agent-plugin-registration',
  'skill-invalid-yaml-frontmatter'
] as const;

/** Agent registries read to verify the plugin/skills registration. */
const AGENT_REGISTRY_FILES = ['.agents/plugins.json', '.agents/skills.json'] as const;

function isPluginRegisteredInAgents(projectRoot: string): boolean {
  const pluginsJsonPath = path.join(projectRoot, '.agents/plugins.json');
  const skillsJsonPath = path.join(projectRoot, '.agents/skills.json');

  const checkFile = (filePath: string): boolean => {
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw) as { entries?: Array<{ path: string }> };
      if (!Array.isArray(data.entries)) return false;
      return data.entries.some(
        (e) =>
          e.path === 'node_modules/@francogp/auditor' ||
          e.path.endsWith('@francogp/auditor') ||
          e.path.includes('@francogp/auditor') ||
          e.path === './packages/auditor' ||
          e.path === 'packages/auditor'
      );
    } catch {
      // catch-ok: malformed or unreadable file is treated as unregistered
      return false;
    }
  };

  return checkFile(pluginsJsonPath) && checkFile(skillsJsonPath);
}

export class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
  constructor(options: Partial<AuditorOptions<AgentPluginRuleId>> = {}) {
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        AGENT_PLUGIN_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['missing-agent-plugin-registration']
      ),
      fixableRuleIds: ['missing-agent-plugin-registration'],
      id: 'validate_agent_plugin',
      name: 'Agent Plugin & Skill Integration Validator',
      description: 'Verifica registro del plugin de auditoría para agentes',
      family: 'architecture',
      ruleIds: AGENT_PLUGIN_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(AGENT_PLUGIN_RULES, 'behavior'),
      packageName: 'Agente',
      configKey: 'agentPlugin.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🤖',
      ruleDescriptions: {
        'missing-agent-plugin-registration': 'Plugin/skills no registrados en .agents',
        'skill-invalid-yaml-frontmatter': 'Frontmatter YAML inválido en SKILL.md'
      },
      ruleRemediations: {
        'missing-agent-plugin-registration':
          '📖 GUÍA DE REMEDIACIÓN: missing-agent-plugin-registration\n' +
          '1. Causa Raíz: El proyecto host no tiene registrado el plugin de auditoría `@francogp/auditor` en `.agents/plugins.json` o carece del catálogo de skills correspondientes en `.agents/skills/`.\n' +
          '2. Diagnóstico: Comprueba si existe `.agents/plugins.json` y si contiene la referencia al plugin del auditor.\n' +
          '3. Solución Canónica:\n' +
          '   a) Ejecuta el auto-fix canónico: `npm run auditor:fix` o `auditor fix` para registrar automáticamente el plugin y sincronizar los skills.\n' +
          '   b) O ejecuta `auditor-init` en el proyecto host.\n' +
          '4. Ejemplo:\n' +
          '   - Comando de solución: `npm run auditor:fix`',
        'skill-invalid-yaml-frontmatter':
          '📖 GUÍA DE REMEDIACIÓN: skill-invalid-yaml-frontmatter\n' +
          '1. Causa Raíz: El archivo `SKILL.md` contiene errores de sintaxis en su frontmatter YAML (comúnmente dos puntos `: ` sin entrecomillar o sin formato escalar `>-`), o carece de los campos requeridos `name` y `description`.\n' +
          '2. Diagnóstico: Ejecuta `npm run auditor:agent-plugin` para identificar el skill específico y el mensaje exacto emitido por el parser YAML.\n' +
          '3. Solución Canónica: Utiliza el bloque escalar plegado `description: >-` para descripciones de múltiples líneas o con caracteres especiales. Asegúrate de incluir `name: <nombre>` coincidiendo con la carpeta del skill.\n' +
          '4. Ejemplo:\n' +
          '   - Antes (Inválido): description: Regla: descripción\n' +
          '   - Después (Canónico): description: >-\n' +
          '       Regla: descripción'
      },
      coverage: { include: [...AGENT_REGISTRY_FILES, '.agents/skills/**/SKILL.md'] },
      ...options
    });
  }

  private async checkGating(): Promise<boolean> {
    const config =
      this.projectRoot !== process.cwd()
        ? await loadAuditConfig(this.projectRoot)
        : getAuditConfig();
    if (config.agentPlugin?.enabled === false) {
      this.context.setMetric('Agent Plugin Status', 'Disabled');
      this.markRuleNotApplicable(
        'missing-agent-plugin-registration',
        'config.agentPlugin.enabled = false'
      );
      this.markRuleNotApplicable(
        'skill-invalid-yaml-frontmatter',
        'config.agentPlugin.enabled = false'
      );
      return true;
    }
    return false;
  }

  private tryAutoFixPlugin(): boolean {
    if (!this.isFixActive()) return false;
    this.context.logProgress('Auto-fixing missing agent plugin registration...');
    const result = initAgentSkill({ targetDir: this.projectRoot });
    if (result.success) {
      this.context.logProgress(`✅ ${result.message}`);
      this.context.setMetric('Agent Plugin Status', 'Auto-Fixed');
      return true;
    }
    return false;
  }

  private reportMissingPluginViolation(): void {
    const pluginsJsonPath = path.join(this.projectRoot, '.agents/plugins.json');
    const skillsJsonPath = path.join(this.projectRoot, '.agents/skills.json');
    const missingFiles: string[] = [];
    if (!fs.existsSync(pluginsJsonPath)) missingFiles.push('.agents/plugins.json');
    if (!fs.existsSync(skillsJsonPath)) missingFiles.push('.agents/skills.json');
    const targetFile = missingFiles[0] || '.agents/plugins.json';

    this.addViolation({
      ruleId: 'missing-agent-plugin-registration',
      severity: 'error',
      file: targetFile,
      line: 1,
      message:
        'El plugin y/o skills de auditoría para agentes no están registrados en .agents/plugins.json y .agents/skills.json. Ejecuta: npm run auditor:init-agent',
      context: 'auditor:init-agent',
      fixable: true
    });
    this.context.setMetric('Agent Plugin Status', 'Missing');
  }

  public override async runAudit(): Promise<void> {
    if (await this.checkGating()) return;

    for (const registryFile of AGENT_REGISTRY_FILES) {
      if (fs.existsSync(path.join(this.projectRoot, registryFile)))
        this.recordScanned(registryFile);
    }

    if (isSelfProviderProject(this.projectRoot)) {
      this.context.setMetric('Agent Plugin Status', 'Provider Validated');
      this.markRuleNotApplicable(
        'missing-agent-plugin-registration',
        'Proyecto proveedor de @francogp/auditor (auto-registro)'
      );
    } else {
      this.runSubAuditorSync('missing-agent-plugin-registration', () => {
        if (isPluginRegisteredInAgents(this.projectRoot)) {
          this.context.setMetric('Agent Plugin Status', 'Registered');
          return;
        }

        if (this.tryAutoFixPlugin()) return;

        this.reportMissingPluginViolation();
      });
    }

    this.runSubAuditorSync('skill-invalid-yaml-frontmatter', () => {
      const skillsDir = path.join(this.projectRoot, '.agents/skills');
      if (!fs.existsSync(skillsDir)) return;

      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillName = entry.name;
        const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;

        this.recordScanned(path.relative(this.projectRoot, skillMdPath));
        const content = fs.readFileSync(skillMdPath, 'utf8');

        if (!content.startsWith('---')) {
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `El archivo ${skillName}/SKILL.md no contiene frontmatter delimitado por '---'`,
            context: skillName
          });
          continue;
        }

        const parts = content.split('---');
        if (parts.length < 3) {
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `El frontmatter de ${skillName}/SKILL.md no tiene cierre con '---'`,
            context: skillName
          });
          continue;
        }

        const frontmatterRaw = parts[1]!;
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = yaml.parse(frontmatterRaw);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `Error de sintaxis YAML en frontmatter de ${skillName}/SKILL.md: ${errMsg.split('\n')[0]}`,
            context: skillName
          });
          continue;
        }

        if (!parsed || typeof parsed !== 'object') {
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `El frontmatter de ${skillName}/SKILL.md no es un objeto YAML válido`,
            context: skillName
          });
          continue;
        }

        if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `Falta el campo 'name' en el frontmatter de ${skillName}/SKILL.md`,
            context: skillName
          });
        }

        if (!parsed.description || typeof parsed.description !== 'string' || !parsed.description.trim()) {
          this.addViolation({
            ruleId: 'skill-invalid-yaml-frontmatter',
            severity: 'error',
            file: path.relative(this.projectRoot, skillMdPath),
            line: 1,
            message: `Falta el campo 'description' en el frontmatter de ${skillName}/SKILL.md`,
            context: skillName
          });
        }
      }
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
