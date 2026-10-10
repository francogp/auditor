/**
 * packages/auditor/src/cli/auditTaskFactory.ts
 *
 * Task definition construction, permission resolution, and execution filtering
 * for auditor auto-discovery.
 */

import path from 'node:path';
import {
  type AuditFamily,
  type AuditTaskDefinition,
  type AuditorCapabilities,
  resolveFamilyMetadata
} from '../core/auditContract.ts';
import { type loadAuditConfig } from '../core/auditConfig.ts';
import { GitIgnoreRegistry } from '../core/gitIgnoreRegistry.ts';
import { PackageScriptRegistry } from '../core/packageScriptRegistry.ts';
import { extractAuditorMetadataFromFile } from './auditorMetadata.ts';

const DEFAULT_TIMEOUT_MS = 0; // 0 = disabled: zero arbitrary timeouts by default

export interface DiscoveryOptions {
  baseDir?: string;
  projectRoot?: string;
  family?: string;
  task?: string;
  suites?: string[];
  preset?: string;
  fastOnly?: boolean;
  skipSimilar?: boolean;
  fixOnly?: boolean;
  lintOnly?: boolean;
  mdOnly?: boolean;
  buildOnly?: boolean;
  withBuild?: boolean;
  includeHeavy?: boolean;
}

export function getTimeoutForTask(_filename: string, configRunnerTimeout?: number): number {
  return configRunnerTimeout ?? DEFAULT_TIMEOUT_MS;
}

export const DEFAULT_PERMISSIONS = [
  '--permission',
  '--experimental-strip-types',
  '--allow-fs-read=*',
  '--allow-fs-write=*',
  '--allow-child-process',
  '--allow-addons'
] as const;

export function getPermissionsForTask(filename: string, fullPath?: string): string[] {
  const perms: string[] = [...DEFAULT_PERMISSIONS]; // no-domain: Non-domain utility collection or data structure
  if (fullPath && fullPath.endsWith('.js')) {
    const stripIdx = perms.indexOf('--experimental-strip-types');
    if (stripIdx !== -1) {
      perms.splice(stripIdx, 1);
    }
  }
  if (filename.includes('audit_project') || filename.includes('convert_assets')) {
    perms.push('--allow-worker');
  }
  return perms;
}

/** Convert snake_case or kebab-case filename to Title Case */
export function formatTaskTitle(filename: string): string {
  if (filename === 'audit_project' || filename === 'audit_project.ts' || filename === 'audit_project.js') {
    return 'Project Architecture & Style Rules';
  }
  if (filename === 'validate_stylelint' || filename === 'validate_stylelint.ts' || filename === 'validate_stylelint.js') {
    return 'CSS & SCSS Stylelint Hygiene';
  }
  const base = filename.replace(/\.(ts|js)$/, '').replace(/^(validate_|audit_)/, '');
  return base
    .split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function shouldSkipTaskByFilters(
  id: string,
  filename: string,
  family: AuditFamily,
  isFast: boolean,
  options: DiscoveryOptions,
  targetSuiteIds: Set<string> | null
): boolean {
  if (options.skipSimilar && (id === 'validate_similar_code' || filename.includes('validate_similar_code'))) {
    return true;
  }
  if (targetSuiteIds && !targetSuiteIds.has(id)) return true;
  if (options.family && options.family !== family) return true;
  if (options.task && !options.task.includes(',') && options.task !== id && !filename.includes(options.task)) return true;
  if (options.fastOnly && !isFast) return true;
  return false;
}

export function shouldSkipTaskByCapabilities(
  capabilities: Partial<AuditorCapabilities> | undefined,
  options: DiscoveryOptions
): boolean {
  const isBuildPreset = Boolean(options.preset === 'build' || options.buildOnly);
  if (isBuildPreset) {
    return !capabilities?.requiresBuild;
  }
  if (options.fixOnly) {
    return !capabilities?.fix;
  }
  if (options.lintOnly || options.preset === 'lint') {
    return !capabilities?.lint;
  }
  if (options.mdOnly || options.preset === 'md') {
    return !capabilities?.md;
  }
  if (options.includeHeavy === false && capabilities?.heavy) {
    return true;
  }
  const isTargeted = Boolean(options.withBuild || options.task || options.suites);
  if (!isTargeted && capabilities?.requiresBuild) {
    return true;
  }
  return false;
}

export function buildTaskCliArguments(
  filename: string,
  fullPath: string,
  id: string,
  isBuiltin: boolean,
  options: DiscoveryOptions
): string[] {
  const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
  const scriptArg = (relScriptPath.startsWith('..') || path.isAbsolute(relScriptPath))
    ? path.resolve(fullPath).replace(/\\/g, '/')
    : relScriptPath;
  const taskPermissions = getPermissionsForTask(filename, fullPath);
  const taskArgs = [...taskPermissions, scriptArg, '--json'];

  if (isBuiltin && id === 'audit_project') {
    if (options.preset === 'lint' || options.lintOnly) {
      taskArgs.push('--rule', 'fallow');
    } else if (options.preset === 'md' || options.mdOnly) {
      taskArgs.push('--rule', 'dox');
    }
  }
  return taskArgs;
}

function resolveTaskConfigKey(metadata: Awaited<ReturnType<typeof extractAuditorMetadataFromFile>>, taskId: string): string {
  if (metadata.configKey) return metadata.configKey;
  if (metadata.manifest?.configKey) return metadata.manifest.configKey;
  throw new Error(`[Auditor Contract Violation] Suite/task [${taskId}] must define a mandatory 'configKey'. Silent fallbacks are strictly prohibited.`);
}

function resolveTaskDefaultConfig(metadata: Awaited<ReturnType<typeof extractAuditorMetadataFromFile>>, taskId: string): Readonly<Record<string, unknown>> {
  if (metadata.defaultConfig) return metadata.defaultConfig;
  if (metadata.manifest?.defaultConfig) return metadata.manifest.defaultConfig;
  throw new Error(`[Auditor Contract Violation] Suite/task [${taskId}] must define a mandatory 'defaultConfig'. Silent fallbacks are strictly prohibited.`);
}

function resolveTaskRuleDescriptions(metadata: Awaited<ReturnType<typeof extractAuditorMetadataFromFile>>): Record<string, string> | undefined {
  if (metadata.ruleDescriptions) return metadata.ruleDescriptions;
  return metadata.manifest?.rules;
}

function resolveTaskDescription(metadata: Awaited<ReturnType<typeof extractAuditorMetadataFromFile>>): string | undefined {
  if (metadata.description) return metadata.description;
  return metadata.manifest?.description;
}

export async function createAuditTaskDefinition(
  fullPath: string,
  filename: string,
  family: AuditFamily,
  config: Awaited<ReturnType<typeof loadAuditConfig>>,
  options: DiscoveryOptions,
  isBuiltin: boolean,
  targetSuiteIds: Set<string> | null
): Promise<AuditTaskDefinition | null> {
  const id = filename;
  const isFast = family === 'architecture' || filename.includes('domain_types');

  if (shouldSkipTaskByFilters(id, filename, family, isFast, options, targetSuiteIds)) {
    return null;
  }

  const metadata = await extractAuditorMetadataFromFile(fullPath);
  const capabilities = metadata.capabilities;
  const gitIgnoreEntries = metadata.gitIgnoreEntries;
  if (gitIgnoreEntries.length > 0) {
    GitIgnoreRegistry.registerMany(gitIgnoreEntries);
  }
  const scripts = metadata.scripts;
  if (scripts && scripts.length > 0) {
    PackageScriptRegistry.registerMany(scripts, id);
  }

  if (shouldSkipTaskByCapabilities(capabilities, options)) {
    return null;
  }

  const taskArgs = buildTaskCliArguments(filename, fullPath, id, isBuiltin, options);
  const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
  const effectiveScriptPath = (relScriptPath.startsWith('..') || path.isAbsolute(relScriptPath))
    ? path.resolve(fullPath).replace(/\\/g, '/')
    : relScriptPath;
  const familyMeta = resolveFamilyMetadata(family, config.customFamilies);
  const effectiveIcon = metadata.icon ?? (isBuiltin ? familyMeta.icon : '🧩');

  return {
    id,
    name: formatTaskTitle(filename),
    description: resolveTaskDescription(metadata),
    family,
    scriptPath: effectiveScriptPath,
    command: 'node',
    args: taskArgs,
    fast: isFast,
    timeoutMs: getTimeoutForTask(filename, config.runner?.timeoutMs),
    order: familyMeta.order,
    requiresAst: Boolean(capabilities?.ast),
    isBuiltin,
    icon: effectiveIcon,
    capabilities: capabilities ?? undefined,
    gitIgnoreEntries: gitIgnoreEntries.length > 0 ? gitIgnoreEntries : undefined,
    scripts: scripts && scripts.length > 0 ? scripts : undefined,
    manifest: metadata.manifest,
    configKey: resolveTaskConfigKey(metadata, id),
    defaultConfig: resolveTaskDefaultConfig(metadata, id),
    criticalConfig: metadata.criticalConfig,
    ruleDescriptions: resolveTaskRuleDescriptions(metadata)
  };
}
