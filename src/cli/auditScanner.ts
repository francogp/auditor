/**
 * packages/auditor/src/cli/auditScanner.ts
 * 
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  type AuditFamily,
  type AuditTaskDefinition,
  type AuditorCapabilities,
  type GitIgnoreRequirement,
  getActiveFamilies,
  FALLBACK_FAMILY_ORDER
} from '../core/auditContract.ts';
import { loadAuditConfig } from '../core/auditConfig.ts';
import { GitIgnoreRegistry } from '../core/gitIgnoreRegistry.ts';

const BUILTIN_SUITES_DIR = path.resolve(import.meta.dirname, '../suites');

export const AUDIT_PRESETS: Record<string, readonly string[]> = {};

export type AuditPresetName = 'lint' | 'md' | 'build' | (string & {}); // domain-ok: Open user-defined or plugin preset identifier

export {
  type DiscoveryOptions,
  getTimeoutForTask,
  DEFAULT_PERMISSIONS,
  getPermissionsForTask,
  formatTaskTitle,
  shouldSkipTaskByFilters,
  shouldSkipTaskByCapabilities,
  buildTaskCliArguments,
  createAuditTaskDefinition
} from './auditTaskFactory.ts';
import {
  type DiscoveryOptions,
  createAuditTaskDefinition
} from './auditTaskFactory.ts';

export {
  type ExtractedAuditorMetadata,
  extractStaticMetadataFromFile,
  extractAuditorMetadataFromFile
} from './auditorMetadata.ts';
import { extractAuditorMetadataFromFile } from './auditorMetadata.ts';

export async function extractCapabilitiesFromFile(fullPath: string): Promise<AuditorCapabilities> {
  return (await extractAuditorMetadataFromFile(fullPath)).capabilities;
}

export async function extractGitIgnoreRequirementsFromFile(fullPath: string): Promise<readonly GitIgnoreRequirement[]> {
  return (await extractAuditorMetadataFromFile(fullPath)).gitIgnoreEntries;
}

function resolveTargetSuiteIds(
  options: DiscoveryOptions,
  combinedPresets: Record<string, readonly string[]>
): Set<string> | null {
  let targetSuiteIds: Set<string> | null = null;
  if (options.preset && options.preset !== 'lint' && options.preset !== 'md' && options.preset in combinedPresets) {
    targetSuiteIds = new Set(combinedPresets[options.preset]);
  }
  if (options.suites && options.suites.length > 0) {
    targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...options.suites]);
  } else if (options.task && options.task.includes(',')) {
    const list = options.task.split(',').map(s => s.trim()).filter(Boolean);
    targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...list]);
  }
  return targetSuiteIds;
}

function inferFamilyFromRelPath(relPath: string, activeFamilies: readonly AuditFamily[]): AuditFamily {
  const segments = relPath.split('/');
  const firstSegment = segments[0];
  if (segments.length > 1 && firstSegment && (activeFamilies as readonly string[]).includes(firstSegment)) { // no-domain: Non-domain utility collection or data structure
    return firstSegment as AuditFamily;
  }
  return 'architecture';
}

function isIgnoredFileEntry(entry: string): boolean {
  if (entry.startsWith('_')) return true;
  if (!entry.endsWith('.ts') && !entry.endsWith('.js')) return true;
  if (entry.endsWith('.d.ts') || entry.endsWith('.d.ts.map') || entry.endsWith('.js.map')) return true;
  return (
    entry.includes('.spec.') ||
    entry.includes('.test.') ||
    entry.startsWith('report_') ||
    entry === 'audit_rules.ts' ||
    entry === 'audit_rules.js' ||
    entry.endsWith('Plugin.ts') ||
    entry.endsWith('Plugin.js')
  );
}

interface DirectoryScanParams {
  currentDir: string;
  rootDir: string;
  config: Awaited<ReturnType<typeof loadAuditConfig>>;
  options: DiscoveryOptions;
  activeFamilies: readonly AuditFamily[];
  targetSuiteIds: Set<string> | null;
  discovered: AuditTaskDefinition[];
  isBuiltin?: boolean;
}

async function scanSuiteDirectory(params: DirectoryScanParams): Promise<void> {
  let entries: string[]; // no-domain: Non-domain utility collection or data structure
  try {
    entries = await fs.readdir(params.currentDir);
  } catch {
    // catch-ok: directory may not exist or not be accessible in custom options
    return;
  }

  const isBuiltin = params.isBuiltin ?? true;

  for (const entry of entries) {
    const fullPath = path.join(params.currentDir, entry);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      if (!entry.startsWith('_') && entry !== 'node_modules' && entry !== 'lib') {
        await scanSuiteDirectory({ ...params, currentDir: fullPath, isBuiltin });
      }
    } else if (stat.isFile() && !isIgnoredFileEntry(entry)) {
      const relPath = path.relative(params.rootDir, fullPath).replace(/\\/g, '/');
      const family = inferFamilyFromRelPath(relPath, params.activeFamilies);
      const filename = path.basename(entry, path.extname(entry));
      const task = await createAuditTaskDefinition(
        fullPath,
        filename,
        family,
        params.config,
        params.options,
        isBuiltin,
        params.targetSuiteIds
      );
      if (task) params.discovered.push(task);
    }
  }
}

interface ExtensionScanParams {
  extensions: readonly string[];
  config: Awaited<ReturnType<typeof loadAuditConfig>>;
  options: DiscoveryOptions;
  activeFamilies: readonly AuditFamily[];
  targetSuiteIds: Set<string> | null;
  discovered: AuditTaskDefinition[];
}

function detectExtensionFamily(extPath: string, activeFamilies: readonly AuditFamily[]): AuditFamily {
  const normalized = extPath.replace(/\\/g, '/');
  for (const fam of activeFamilies) {
    if (normalized.includes(`/${fam}/`)) {
      return fam;
    }
  }
  return 'domain_data';
}

async function scanSingleExtensionFile(fullPath: string, extPath: string, params: ExtensionScanParams): Promise<void> {
  const filename = path.basename(extPath, path.extname(extPath));
  const family = detectExtensionFamily(extPath, params.activeFamilies);

  const task = await createAuditTaskDefinition(
    fullPath,
    filename,
    family,
    params.config,
    params.options,
    false,
    params.targetSuiteIds
  );
  if (task) params.discovered.push(task);
}

async function scanConfigExtensionEntry(extPath: string, params: ExtensionScanParams): Promise<void> {
  const rootDir = params.options.projectRoot || process.cwd();
  const fullPath = path.resolve(rootDir, extPath);
  if (!fsSync.existsSync(fullPath)) return;
  const stat = await fs.stat(fullPath);

  if (stat.isDirectory()) {
    await scanSuiteDirectory({
      currentDir: fullPath,
      rootDir: fullPath,
      config: params.config,
      options: params.options,
      activeFamilies: params.activeFamilies,
      targetSuiteIds: params.targetSuiteIds,
      discovered: params.discovered,
      isBuiltin: false
    });
  } else if (stat.isFile() && (extPath.endsWith('.ts') || extPath.endsWith('.js'))) {
    await scanSingleExtensionFile(fullPath, extPath, params);
  }
}

async function scanConfigExtensions(params: ExtensionScanParams): Promise<void> {
  for (const extPath of params.extensions) {
    await scanConfigExtensionEntry(extPath, params);
  }
}

export async function discoverAuditors(options: DiscoveryOptions = {}): Promise<AuditTaskDefinition[]> {
  const config = await loadAuditConfig(options.projectRoot);
  const activeFamilies = getActiveFamilies(config.customFamilies);
  const discovered: AuditTaskDefinition[] = [];

  const combinedPresets = {
    ...AUDIT_PRESETS,
    ...(config.presets ?? {})
  };

  const targetSuiteIds = resolveTargetSuiteIds(options, combinedPresets);
  const scanDir = options.baseDir ?? BUILTIN_SUITES_DIR;

  await scanSuiteDirectory({
    currentDir: scanDir,
    rootDir: scanDir,
    config,
    options,
    activeFamilies,
    targetSuiteIds,
    discovered
  });

  if ((!options.baseDir || options.baseDir === BUILTIN_SUITES_DIR) && config.extensions && config.extensions.length > 0) {
    await scanConfigExtensions({
      extensions: config.extensions,
      config,
      options,
      activeFamilies,
      targetSuiteIds,
      discovered
    });
  }

  discovered.sort((a, b) => {
    const familyDiff = (a.order ?? FALLBACK_FAMILY_ORDER) - (b.order ?? FALLBACK_FAMILY_ORDER);
    if (familyDiff !== 0) return familyDiff;
    return a.id.localeCompare(b.id);
  });

  return discovered;
}

/**
 * Dynamically collects gitignore requirements from all discovered subauditors,
 * registered extensions, and audit.config.ts, guaranteeing that zero rules are hardcoded.
 */
export async function collectAllGitIgnoreRequirements(
  projectRoot: string = process.cwd(),
  config?: Awaited<ReturnType<typeof loadAuditConfig>>
): Promise<GitIgnoreRequirement[]> {
  const effectiveConfig = config ?? await loadAuditConfig(projectRoot);
  await discoverAuditors({ projectRoot });

  const customEntries = effectiveConfig.gitIgnore?.extraRequiredEntries ?? [];
  for (const entry of customEntries) {
    if (typeof entry === 'string') {
      GitIgnoreRegistry.register({
        id: entry,
        pattern: entry,
        reason: `Entrada requerida configurada en audit.config.ts (${entry})`
      });
    } else if (entry && typeof entry === 'object' && entry.id && entry.pattern) {
      GitIgnoreRegistry.register(entry);
    }
  }

  return GitIgnoreRegistry.getRequirements();
}

