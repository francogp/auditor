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
import { isSelfProviderProject } from '../core/auditConfig.ts';

export interface InitAgentOptions {
  targetDir?: string;
  dryRun?: boolean;
}

interface AgentEntriesConfig {
  entries?: Array<{ path: string }>;
}

function loadAgentEntriesConfig(filePath: string): AgentEntriesConfig {
  if (!fs.existsSync(filePath)) return { entries: [] };
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.entries) ? parsed : { entries: [] };
  } catch {
    // catch-ok: fallback to empty entries on parse error
    return { entries: [] };
  }
}

function registerAgentEntry(
  filePath: string,
  entryPath: string,
  matchFn: (p: string) => boolean,
  dryRun?: boolean
): boolean {
  const config = loadAgentEntriesConfig(filePath);
  const alreadyRegistered = config.entries?.some(e => matchFn(e.path));
  if (alreadyRegistered) return false;

  config.entries = config.entries ?? [];
  config.entries.push({ path: entryPath });

  if (!dryRun) {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }
  return true;
}

export function initAgentSkill(options: InitAgentOptions = {}): { success: boolean; message: string; created: boolean } {
  const rawInitCwd = process.env.INIT_CWD;
  const safeInitCwd = rawInitCwd && !rawInitCwd.includes('..') ? path.resolve(rawInitCwd) : undefined;
  const targetDir = options.targetDir ? path.resolve(options.targetDir) : (safeInitCwd || process.cwd());

  if (isSelfProviderProject(targetDir)) {
    return {
      success: true,
      message: 'Repositorio proveedor @francogp/auditor detectado. Registro omitido.',
      created: false
    };
  }

  const agentsDir = path.join(targetDir, '.agents');
  if (!fs.existsSync(agentsDir) && !options.dryRun) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const pluginCreated = registerAgentEntry(
    path.join(agentsDir, 'plugins.json'),
    'node_modules/@francogp/auditor',
    p => p === 'node_modules/@francogp/auditor' || p.endsWith('@francogp/auditor'),
    options.dryRun
  );

  const skillsCreated = registerAgentEntry(
    path.join(agentsDir, 'skills.json'),
    'node_modules/@francogp/auditor/.agents/skills',
    p => p === 'node_modules/@francogp/auditor/.agents/skills' || p.includes('@francogp/auditor'),
    options.dryRun
  );

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
  const isPostinstall = process.argv.includes('--from-postinstall');

  if (!isPostinstall) {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  🤖 Antigravity Agent Skill Registrator (@francogp/auditor) │');
    console.log('└────────────────────────────────────────────────────────┘\n');
  }

  try {
    const result = initAgentSkill({ dryRun: isDryRun });

    if (result.success) {
      if (result.created || !isPostinstall) {
        console.log(`🤖 ${result.message}`);
      }
      if (!isPostinstall) {
        console.log('\nEl agente Antigravity ahora tiene acceso nativo a:');
        console.log('  - Skills: auditor y skills bundled de @francogp/auditor\n');
      }
    } else {
      if (!isPostinstall) {
        console.error(`❌ Error al registrar plugin: ${result.message}`);
        process.exit(1);
      }
    }
  } catch (err) {
    // catch-ok: In postinstall, never crash npm install / npm ci if filesystem permissions are restricted
    if (!isPostinstall) {
      console.error(err);
      process.exit(1);
    }
  }
}
