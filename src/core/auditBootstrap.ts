/**
 * src/core/auditBootstrap.ts
 *
 * ZERO-SETUP PRE-FLIGHT AUTO-BOOTSTRAP ENGINE (Node.js 26+ Native)
 *
 * Ensures that any host repository executing @francogp/auditor:
 *   1. Has a valid .auditor/audit.config.ts initialized with 100% of discovered
 *      sub-auditors and extension sections populated with their canonical defaults.
 *   2. Automatically detects missing configuration sections when @francogp/auditor
 *      is updated or new suites/extensions are added, injecting them via TypeScript AST.
 *   3. Automatically registers the auditor plugin and skills in .agents/plugins.json
 *      and .agents/skills.json so Antigravity AI agents immediately discover capabilities.
 *   4. Ensures required .gitignore entries exist (scratch/, .auditor/audit-baseline.json).
 *   5. Ensures .npmrc contains allow-git=all so plain `npm install` and `npm update` resolve Git-hosted dependencies on npm 12+.
 *
 * Runs transparently during pre-flight in local environments while strictly
 * respecting CI environments (never mutating files unexpectedly during CI runs).
 */

import fs from 'node:fs';
import path from 'node:path';

import { discoverAuditors, collectAllGitIgnoreRequirements } from '../cli/auditScanner.ts';
import { initAgentSkill } from '../cli/init_agent.ts';
import { migrateLegacyAuditConfig } from '../cli/migrateAuditConfig.ts';
import {
  createDefaultAuditConfigContent,
  collectMissingSections,
  syncAuditorVersionInConfigFile,
  enforceCriticalConfigurations
} from '../suites/architecture/validate_audit_config.ts';
import {
  AUDIT_CONFIG_FILE,
  AUDIT_CONFIG_JSON_FILE,
  LEGACY_ROOT_CONFIG_FILES,
  loadAuditConfig,
  resetAuditConfig,
  isSelfProviderProject
} from './auditConfig.ts';
import { appendMissingSectionsToConfigFile } from './auditConfigAst.ts';
import type { AuditTaskDefinition } from './auditContract.ts';
import { findMissingGitIgnoreRequirements, appendGitIgnoreEntries } from './gitignoreMatcher.ts';
import { ensureNpmrcAllowGit } from './npmrcAllowGit.ts';
import { getPackageJson } from './packageJson.ts';
import { tryOrNull, tryCatchSync, tryOrNullAsync, tryOrUndefinedAsync } from './safeUtils.ts';
import { AUDITOR_VERSION } from './version.ts';
import { repairVitePlusProject } from './vitePlusConfigSync.ts';

export interface BootstrapResult {
  readonly configCreated: boolean;
  readonly configUpdated: boolean;
  readonly versionUpdated: boolean;
  readonly previousVersion?: string;
  readonly currentVersion: string;
  readonly agentsRegistered: boolean;
  readonly gitIgnoreUpdated: boolean;
  readonly sectionsInjected: readonly string[];
}

export interface BootstrapOptions {
  readonly projectRoot?: string;
  readonly force?: boolean;
}

const EMPTY_BOOTSTRAP_RESULT: BootstrapResult = {
  configCreated: false,
  configUpdated: false,
  versionUpdated: false,
  currentVersion: AUDITOR_VERSION,
  agentsRegistered: false,
  gitIgnoreUpdated: false,
  sectionsInjected: []
};

function handleLegacyConfigMigration(projectRoot: string): void {
  const legacyFile = LEGACY_ROOT_CONFIG_FILES.find((f) =>
    fs.existsSync(path.resolve(projectRoot, f))
  );
  if (!legacyFile) return;

  tryCatchSync(() => {
    migrateLegacyAuditConfig(projectRoot);
  });
}

async function safeDiscoverAuditors(projectRoot: string): Promise<readonly AuditTaskDefinition[]> {
  return discoverAuditors({ projectRoot }).catch(() => []);
}

function resolvePackageName(projectRoot: string): string {
  const pkg = tryOrNull(() => getPackageJson(projectRoot));
  return pkg?.name ?? 'Project';
}

function ensureVirginConfigScaffolded(
  projectRoot: string,
  tasks: readonly AuditTaskDefinition[]
): boolean {
  const pkgName = resolvePackageName(projectRoot);
  const content = createDefaultAuditConfigContent(pkgName, tasks);
  const targetConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);

  fs.mkdirSync(path.dirname(targetConfigPath), { recursive: true });
  fs.writeFileSync(targetConfigPath, content, 'utf-8');
  resetAuditConfig();
  return true;
}

async function ensureMissingSectionsInjected(
  projectRoot: string,
  configPath: string,
  jsonConfigPath: string,
  tasks: readonly AuditTaskDefinition[]
): Promise<string[]> {
  // no-domain: Dynamic list of injected configuration section keys
  const injectedKeys: string[] = [];

  const activeConfig = await tryOrNullAsync(() => loadAuditConfig(projectRoot));
  if (!activeConfig) return injectedKeys;

  const rawConfig = (activeConfig._rawConfig ?? {}) as Record<string, unknown>;
  const missing = collectMissingSections(tasks, rawConfig);

  if (missing.size === 0) return injectedKeys;

  const targetPath = fs.existsSync(configPath) ? configPath : jsonConfigPath;
  const sectionsToInsert: Record<string, Record<string, unknown>> = {};

  for (const [rootKey, entry] of missing.entries()) {
    sectionsToInsert[rootKey] =
      Object.keys(entry.defaultConfig).length > 0 ? entry.defaultConfig : { enabled: true };
    injectedKeys.push(rootKey);
  }

  appendMissingSectionsToConfigFile(targetPath, sectionsToInsert);
  resetAuditConfig();

  return injectedKeys;
}

function ensureAgentSkillRegistered(projectRoot: string): boolean {
  const agentResult = tryOrNull(() => initAgentSkill({ targetDir: projectRoot }));
  return agentResult?.created ?? false;
}

async function ensureGitIgnoreSynchronized(projectRoot: string): Promise<boolean> {
  const result = await tryOrNull(async () => {
    const gitignorePath = path.resolve(projectRoot, '.gitignore');
    const requirements = await collectAllGitIgnoreRequirements(projectRoot);
    const activeConfig = await tryOrUndefinedAsync(() => loadAuditConfig(projectRoot));

    const applicable = requirements.filter((req) => {
      if (!req.isApplicable) return true;
      return activeConfig ? req.isApplicable(activeConfig) : true;
    });

    if (applicable.length === 0) return false;

    const missing = findMissingGitIgnoreRequirements(projectRoot, gitignorePath, applicable);
    if (missing.length === 0) return false;

    appendGitIgnoreEntries(
      gitignorePath,
      missing.map((e) => e.pattern)
    );
    return true;
  });
  return result ?? false;
}

export async function ensureProjectBootstrapped(
  options: BootstrapOptions = {}
): Promise<BootstrapResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const isCi = process.env.CI === 'true';

  if (isCi || (isSelfProviderProject(projectRoot) && !options.force)) {
    return EMPTY_BOOTSTRAP_RESULT;
  }

  handleLegacyConfigMigration(projectRoot);

  const configPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);
  const jsonConfigPath = path.resolve(projectRoot, AUDIT_CONFIG_JSON_FILE);
  const targetConfigPath = fs.existsSync(configPath) ? configPath : jsonConfigPath;
  const hasExistingConfig = fs.existsSync(configPath) || fs.existsSync(jsonConfigPath);

  const tasks = await safeDiscoverAuditors(projectRoot);

  let configCreated = false;
  let versionUpdated = false;
  let previousVersion: string | undefined;
  let sectionsInjected: readonly string[] = []; // no-domain: Injected configuration sections

  if (!hasExistingConfig) {
    configCreated = ensureVirginConfigScaffolded(projectRoot, tasks);
    versionUpdated = true;
  } else {
    const activeConfig = await tryOrUndefinedAsync(() => loadAuditConfig(projectRoot));
    const rawConfig = (activeConfig?._rawConfig ?? {}) as Record<string, unknown>;
    previousVersion =
      typeof rawConfig.auditorVersion === 'string' ? rawConfig.auditorVersion : undefined;

    const versionDiverged = previousVersion !== AUDITOR_VERSION;

    sectionsInjected = await ensureMissingSectionsInjected(
      projectRoot,
      configPath,
      jsonConfigPath,
      tasks
    );

    // Enforce critical mandatory configurations without altering non-violating existing settings
    await enforceCriticalConfigurations(projectRoot, tasks);

    if (versionDiverged) {
      const versionSynced = syncAuditorVersionInConfigFile(targetConfigPath, AUDITOR_VERSION);
      if (versionSynced) {
        versionUpdated = true;
        resetAuditConfig();
      }
    }
  }

  ensureNpmrcAllowGit(projectRoot);
  repairVitePlusProject(projectRoot);
  const agentsRegistered = ensureAgentSkillRegistered(projectRoot);
  const gitIgnoreUpdated = await ensureGitIgnoreSynchronized(projectRoot);

  return {
    configCreated,
    configUpdated: sectionsInjected.length > 0 || versionUpdated,
    versionUpdated,
    previousVersion,
    currentVersion: AUDITOR_VERSION,
    agentsRegistered,
    gitIgnoreUpdated,
    sectionsInjected
  };
}
