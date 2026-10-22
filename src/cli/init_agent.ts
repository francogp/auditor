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
import { safeReadFileSync, safeJsonParse } from '../core/safeUtils.ts';
import { isMainModule } from './cliUtils.ts';
import { isSelfProviderProject } from '../core/auditConfig.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';

export interface InitAgentOptions {
  targetDir?: string;
  dryRun?: boolean;
}

interface AgentEntriesConfig {
  entries?: Array<{ path: string }>;
}

function loadAgentEntriesConfig(filePath: string): AgentEntriesConfig {
  const raw = safeReadFileSync(filePath);
  if (!raw) return { entries: [] };
  const parsed = safeJsonParse<AgentEntriesConfig>(raw);
  return Array.isArray(parsed?.entries) ? parsed : { entries: [] };
}

function registerAgentEntry(
  filePath: string,
  entryPath: string,
  matchFn: (p: string) => boolean,
  dryRun?: boolean
): boolean {
  const config = loadAgentEntriesConfig(filePath);
  const alreadyRegistered = config.entries?.some((e) => matchFn(e.path));
  if (alreadyRegistered) return false;

  config.entries = config.entries ?? [];
  config.entries.push({ path: entryPath });

  if (!dryRun) {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }
  return true;
}

export function initAgentSkill(options: InitAgentOptions = {}): {
  success: boolean;
  message: string;
  created: boolean;
} {
  const rawInitCwd = process.env.INIT_CWD;
  const safeInitCwd = rawInitCwd ? path.resolve(rawInitCwd) : undefined;
  const targetDir = options.targetDir
    ? path.resolve(options.targetDir)
    : safeInitCwd || process.cwd();

  if (isSelfProviderProject(targetDir)) {
    return {
      success: true,
      message: 'Provider repository @francogp/auditor detected. Registration skipped.',
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
    (p) => p === 'node_modules/@francogp/auditor' || p.endsWith('@francogp/auditor'),
    options.dryRun
  );

  const skillsCreated = registerAgentEntry(
    path.join(agentsDir, 'skills.json'),
    'node_modules/@francogp/auditor/.agents/skills',
    (p) => p === 'node_modules/@francogp/auditor/.agents/skills' || p.includes('@francogp/auditor'),
    options.dryRun
  );

  const anyCreated = pluginCreated || skillsCreated;
  const message = anyCreated
    ? `Successfully registered @francogp/auditor in .agents/plugins.json and .agents/skills.json`
    : `@francogp/auditor plugin and skills are already registered in .agents`;

  return {
    success: true,
    message,
    created: anyCreated
  };
}

const INIT_AGENT_ARGS = {
  ...COMMON_CLI_ARGS,
  'dry-run': { type: 'boolean', default: false, description: 'Preview registration without writing' },
  'from-postinstall': { type: 'boolean', default: false, description: 'Invoked from npm postinstall hook' }
} as const satisfies CittyArgsDef;

// CLI entrypoint
if (isMainModule(import.meta.url)) {
  const parsed = parseCittyArgs(INIT_AGENT_ARGS, getProcessCliArgs());
  const isDryRun = Boolean(parsed['dry-run']);
  const isPostinstall = Boolean(parsed['from-postinstall']);

  if (!isPostinstall) {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  Antigravity Agent Skill Registrator (@francogp/auditor) │');
    console.log('└────────────────────────────────────────────────────────┘\n');
  }

  try {
    const result = initAgentSkill({ dryRun: isDryRun });

    if (result.success) {
      if (result.created || !isPostinstall) {
        console.log(`[OK] ${result.message}`);
      }
      if (!isPostinstall) {
        console.log('\nAntigravity agent now has native access to:');
        console.log('  - Skills: auditor and bundled skills from @francogp/auditor\n');
      }
    } else {
      if (!isPostinstall) {
        console.error(`[Error] Failed to register plugin: ${result.message}`);
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
