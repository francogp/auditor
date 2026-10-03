#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/init_agent.ts
 *
 * Antigravity Agent Plugin Registrator (Node.js 26+ Native)
 * Automatically registers @francogp/auditor in .agents/plugins.json of the host project
 * so Antigravity AI agents instantly discover the official auditor skill and rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from './cliUtils.ts';

export interface InitAgentOptions {
  targetDir?: string;
  dryRun?: boolean;
}

export function initAgentSkill(options: InitAgentOptions = {}): { success: boolean; message: string; created: boolean } {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const agentsDir = path.join(targetDir, '.agents');
  const pluginsJsonPath = path.join(agentsDir, 'plugins.json');
  const skillsJsonPath = path.join(agentsDir, 'skills.json');

  const relativePluginEntry = 'node_modules/@francogp/auditor';
  const relativeSkillsEntry = 'node_modules/@francogp/auditor/.agents/skills';

  if (!fs.existsSync(agentsDir)) {
    if (!options.dryRun) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
  }

  // 1. Manage .agents/plugins.json
  let pluginsConfig: { entries?: Array<{ path: string }> } = { entries: [] };
  if (fs.existsSync(pluginsJsonPath)) {
    try {
      const raw = fs.readFileSync(pluginsJsonPath, 'utf8');
      pluginsConfig = JSON.parse(raw);
      if (!Array.isArray(pluginsConfig.entries)) {
        pluginsConfig.entries = [];
      }
    } catch {
      pluginsConfig = { entries: [] };
    }
  }

  const pluginAlreadyRegistered = pluginsConfig.entries?.some(
    e => e.path === relativePluginEntry || e.path.endsWith('@francogp/auditor')
  );

  let pluginCreated = false;
  if (!pluginAlreadyRegistered) {
    pluginsConfig.entries?.push({ path: relativePluginEntry });
    if (!options.dryRun) {
      fs.writeFileSync(pluginsJsonPath, JSON.stringify(pluginsConfig, null, 2) + '\n', 'utf8');
    }
    pluginCreated = true;
  }

  // 2. Manage .agents/skills.json
  let skillsConfig: { entries?: Array<{ path: string }> } = { entries: [] };
  if (fs.existsSync(skillsJsonPath)) {
    try {
      const raw = fs.readFileSync(skillsJsonPath, 'utf8');
      skillsConfig = JSON.parse(raw);
      if (!Array.isArray(skillsConfig.entries)) {
        skillsConfig.entries = [];
      }
    } catch {
      skillsConfig = { entries: [] };
    }
  }

  const skillsAlreadyRegistered = skillsConfig.entries?.some(
    e => e.path === relativeSkillsEntry || e.path.includes('@francogp/auditor')
  );

  let skillsCreated = false;
  if (!skillsAlreadyRegistered) {
    skillsConfig.entries?.push({ path: relativeSkillsEntry });
    if (!options.dryRun) {
      fs.writeFileSync(skillsJsonPath, JSON.stringify(skillsConfig, null, 2) + '\n', 'utf8');
    }
    skillsCreated = true;
  }

  const anyCreated = pluginCreated || skillsCreated;
  const message = anyCreated
    ? `Registrado exitosamente @francogp/auditor en .agents/plugins.json y .agents/skills.json`
    : `El plugin y las skills de @francogp/auditor ya se encuentran registrados en .agents`;

  return {
    success: true,
    message,
    created: anyCreated
  };
}

// CLI entrypoint
if (isMainModule(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│  🤖 Antigravity Agent Skill Registrator (@francogp/auditor) │');
  console.log('└────────────────────────────────────────────────────────┘\n');

  const result = initAgentSkill({ dryRun: isDryRun });

  if (result.success) {
    console.log(`✅ ${result.message}`);
    console.log('\nEl agente Antigravity ahora tiene acceso nativo a:');
    console.log('  - Skills: auditor y skills bundled de @francogp/auditor\n');
  } else {
    console.error(`❌ Error al registrar plugin: ${result.message}`);
    process.exit(1);
  }
}
