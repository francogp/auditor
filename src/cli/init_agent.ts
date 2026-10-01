/**
 * src/cli/init_agent.ts
 *
 * Antigravity Agent Plugin Registrator (Node.js 26+ Native)
 * Automatically registers @fgp/auditor in .agents/plugins.json of the host project
 * so Antigravity AI agents instantly discover the official auditor-framework skill and rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InitAgentOptions {
  targetDir?: string;
  dryRun?: boolean;
}

export function initAgentSkill(options: InitAgentOptions = {}): { success: boolean; message: string; created: boolean } {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const agentsDir = path.join(targetDir, '.agents');
  const pluginsJsonPath = path.join(agentsDir, 'plugins.json');

  const relativePluginEntry = 'node_modules/@fgp/auditor';

  if (!fs.existsSync(agentsDir)) {
    if (!options.dryRun) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
  }

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

  const alreadyRegistered = pluginsConfig.entries?.some(
    e => e.path === relativePluginEntry || e.path.endsWith('@fgp/auditor')
  );

  if (alreadyRegistered) {
    return {
      success: true,
      message: `El plugin @fgp/auditor ya se encuentra registrado en ${pluginsJsonPath}`,
      created: false
    };
  }

  pluginsConfig.entries?.push({ path: relativePluginEntry });

  if (!options.dryRun) {
    fs.writeFileSync(pluginsJsonPath, JSON.stringify(pluginsConfig, null, 2) + '\n', 'utf8');
  }

  return {
    success: true,
    message: `Registrado exitosamente @fgp/auditor en ${pluginsJsonPath}`,
    created: true
  };
}

// CLI entrypoint
const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectCli) {
  const isDryRun = process.argv.includes('--dry-run');
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│  🤖 Antigravity Agent Skill Registrator (@fgp/auditor) │');
  console.log('└────────────────────────────────────────────────────────┘\n');

  const result = initAgentSkill({ dryRun: isDryRun });

  if (result.success) {
    console.log(`✅ ${result.message}`);
    console.log('\nEl agente Antigravity ahora tiene acceso nativo a:');
    console.log('  - Skill: auditor-framework');
    console.log('  - Reglas: rules/AGENTS.md\n');
  } else {
    console.error(`❌ Error al registrar plugin: ${result.message}`);
    process.exit(1);
  }
}
