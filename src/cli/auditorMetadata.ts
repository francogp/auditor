/**
 * packages/auditor/src/cli/auditorMetadata.ts
 *
 * Dedicated metadata extractor for auditor suites and tasks.
 */

import path from 'node:path';
import fsSync from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  type AuditorCapabilities,
  type AuditExecutionSpeed,
  type GitIgnoreRequirement,
  type AuditorPackageScriptRequirement,
  type AuditorManifestDTO,
  type AuditorCriticalConfig
} from '../core/auditContract.ts';
import { BaseAuditor, DEFAULT_AUDITOR_CAPABILITIES } from '../core/auditorBase.ts';
import { getProcessExecutedScript } from '../core/cli/cittyHarness.ts';
import { tryOrDefault, tryCatchSync } from '../core/safeUtils.ts';

const DYNAMIC_IMPORT_TIMEOUT_MS = 2000 as const;

export interface ExtractedAuditorMetadata {
  readonly capabilities: AuditorCapabilities;
  readonly ruleCapabilities?: Readonly<Record<string, AuditorCapabilities>>;
  readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  readonly defaultIgnoredDirs?: readonly string[];
  readonly defaultIgnoreGlobs?: readonly string[];
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly icon?: string;
  readonly manifest?: AuditorManifestDTO;
  readonly description?: string;
  readonly ruleDescriptions?: Readonly<Record<string, string>>;
  readonly ruleRemediations?: Readonly<Record<string, string>>;
  readonly configKey?: string;
  readonly defaultConfig?: Readonly<Record<string, unknown>>;
  readonly criticalConfig?: AuditorCriticalConfig;
}
type MutableExtractedAuditorMetadata = {
  -readonly [K in keyof ExtractedAuditorMetadata]: ExtractedAuditorMetadata[K];
};

export function extractStaticMetadataFromFile(fullPath: string): ExtractedAuditorMetadata {
  const result: {
    capabilities: AuditorCapabilities;
    gitIgnoreEntries: readonly GitIgnoreRequirement[];
    icon?: string;
  } = {
    capabilities: DEFAULT_AUDITOR_CAPABILITIES,
    gitIgnoreEntries: []
  };

  return tryOrDefault(() => {
    const content = fsSync.readFileSync(fullPath, 'utf-8');
    const iconMatch = content.match(/icon\s*:\s*['"]([^'"]+)['"]/);
    if (iconMatch?.[1]) {
      result.icon = iconMatch[1];
    }

    const hasLight = content.includes("speed: 'light'") || content.includes("['light'");
    const hasHeavy = content.includes("speed: 'heavy'") || content.includes("'heavy'");
    const hasFull = content.includes("speed: 'full'") || content.includes("'full']");
    const speeds: AuditExecutionSpeed[] = [];
    if (hasLight) speeds.push('light');
    if (hasHeavy) speeds.push('heavy');
    if (hasFull) speeds.push('full');

    const speed = speeds.length > 1 ? speeds : (speeds[0] ?? 'light');
    const phase = content.includes("phase: 'post-build'")
      ? 'post-build'
      : content.includes("phase: 'post-run'")
        ? 'post-run'
        : 'normal';
    const fix = content.includes("fix: 'priority'")
      ? 'priority'
      : content.includes("fix: 'normal'")
        ? 'normal'
        : 'none';

    result.capabilities = {
      speed,
      phase,
      fix,
      md: content.includes('md: true'),
      ast:
        content.includes('ast: true') ||
        content.includes('requiresAst: true') ||
        content.includes('AST_RULE_CAPABILITIES'),
      changedOnly: content.includes('changedOnly: true'),
      critical: content.includes('critical: true')
    };

    const descMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);
    const configKeyMatch = content.match(/configKey\s*[:=]\s*['"]([^'"]+)['"]/);
    const hasDefaultConfig = /defaultConfig\s*[:=]/.test(content);
    let staticDefaultConfig: Record<string, unknown> | undefined;
    if (hasDefaultConfig) {
      staticDefaultConfig = content.includes('enabled: true') ? { enabled: true } : {};
    }

    return {
      ...result,
      description: descMatch?.[1],
      configKey: configKeyMatch?.[1],
      defaultConfig: staticDefaultConfig
    };
  }, result);
}

function buildCacheGitIgnoreEntries(
  cachePaths: readonly string[],
  ownerId: string,
  reason: string
): GitIgnoreRequirement[] {
  return cachePaths.map((cp: string) => {
    const trimmed = cp.endsWith('/') ? cp.slice(0, -1) : cp;
    const normPattern = cp.endsWith('/') || !cp.includes('.') ? `${trimmed}/` : cp;
    return {
      id: `${ownerId}-${cp}`,
      pattern: normPattern,
      reason
    };
  });
}

function extractMetadataFromAuditorInstance(
  val: new () => BaseAuditor,
  result: MutableExtractedAuditorMetadata
): void {
  tryCatchSync(() => {
    const instance = new val();
    if (instance?.capabilities && typeof instance.capabilities === 'object') {
      result.capabilities = instance.capabilities;
    }
    if (instance?.ruleCapabilities && typeof instance.ruleCapabilities === 'object') {
      result.ruleCapabilities = instance.ruleCapabilities;
    }
    if (instance?.icon && typeof instance.icon === 'string') {
      result.icon = instance.icon;
    }
    if (Array.isArray(instance?.gitIgnoreEntries)) {
      result.gitIgnoreEntries = instance.gitIgnoreEntries;
    }
    if (Array.isArray(instance?.cachePaths)) {
      const owner = instance.id ?? 'auditor';
      const cacheEntries = buildCacheGitIgnoreEntries(
        instance.cachePaths,
        owner,
        `Cache or temporary artifacts generated by [${owner}]`
      );
      result.gitIgnoreEntries = [...result.gitIgnoreEntries, ...cacheEntries];
    }
    if (Array.isArray(instance?.scripts)) {
      result.scripts = instance.scripts;
    }
    if (typeof instance?.toManifest === 'function') {
      const manifest = instance.toManifest();
      result.manifest = manifest;
      result.description = manifest.description;
      result.ruleDescriptions = manifest.rules;
      result.ruleRemediations = manifest.remediations ?? instance.ruleRemediations;
      result.configKey = manifest.configKey;
      result.defaultConfig = manifest.defaultConfig;
    } else if (instance?.description) {
      result.description = instance.description;
      result.ruleDescriptions = instance.ruleDescriptions;
      result.ruleRemediations = instance.ruleRemediations;
      result.configKey = instance.configKey;
      result.defaultConfig = instance.defaultConfig;
    }
    if (instance?.criticalConfig) {
      result.criticalConfig = instance.criticalConfig;
    }
  });
}

function extractMetadataFromFunction(val: unknown, result: MutableExtractedAuditorMetadata): void {
  if (typeof val !== 'function') return;

  const withStatic = val as {
    capabilities?: Partial<AuditorCapabilities>;
    gitIgnoreEntries?: readonly GitIgnoreRequirement[];
    cachePaths?: readonly string[];
    scripts?: readonly AuditorPackageScriptRequirement[];
    icon?: string;
  };

  if (withStatic.capabilities && typeof withStatic.capabilities === 'object') {
    result.capabilities = {
      ...DEFAULT_AUDITOR_CAPABILITIES,
      ...withStatic.capabilities
    };
  }
  if (typeof withStatic.icon === 'string') {
    result.icon = withStatic.icon;
  }
  if (Array.isArray(withStatic.gitIgnoreEntries)) {
    result.gitIgnoreEntries = withStatic.gitIgnoreEntries;
  }
  if (Array.isArray(withStatic.cachePaths)) {
    const cacheEntries = buildCacheGitIgnoreEntries(
      withStatic.cachePaths,
      'static',
      'Cache or temporary artifacts generated by auditor suite'
    );
    result.gitIgnoreEntries = [...result.gitIgnoreEntries, ...cacheEntries];
  }
  if (Array.isArray(withStatic.scripts)) {
    result.scripts = withStatic.scripts;
  }

  if (val.prototype instanceof BaseAuditor) {
    extractMetadataFromAuditorInstance(val as new () => BaseAuditor, result);
  }
}

const metadataCache = new Map<string, ExtractedAuditorMetadata>();

export function clearMetadataCache(): void {
  metadataCache.clear();
}

export async function extractAuditorMetadataFromFile(
  fullPath: string
): Promise<ExtractedAuditorMetadata> {
  const cached = metadataCache.get(fullPath);
  if (cached) return cached;

  const result: MutableExtractedAuditorMetadata = {
    capabilities: DEFAULT_AUDITOR_CAPABILITIES,
    gitIgnoreEntries: []
  };

  // Self-import guard: Never dynamically import the currently executing script to prevent circular top-level await deadlock
  const scriptArg = getProcessExecutedScript();
  if (scriptArg) {
    const currentScriptBase = path.basename(scriptArg, path.extname(scriptArg)).toLowerCase();
    const targetScriptBase = path.basename(fullPath, path.extname(fullPath)).toLowerCase();
    if (currentScriptBase === targetScriptBase) {
      return extractStaticMetadataFromFile(fullPath);
    }
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    const fileUrl = pathToFileURL(fullPath).href;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Import timeout for ${fullPath}`)),
        DYNAMIC_IMPORT_TIMEOUT_MS
      );
      if (timer.unref) timer.unref();
    });
    const mod = (await Promise.race([import(fileUrl), timeoutPromise])) as Record<string, unknown>; // open-record: Generic dynamic ESM module namespace object

    if (typeof mod.icon === 'string') {
      result.icon = mod.icon;
    }
    if (Array.isArray(mod.gitIgnoreEntries)) {
      result.gitIgnoreEntries = mod.gitIgnoreEntries as readonly GitIgnoreRequirement[];
    } else if (Array.isArray(mod.GITIGNORE_ENTRIES)) {
      result.gitIgnoreEntries = mod.GITIGNORE_ENTRIES as readonly GitIgnoreRequirement[];
    }

    for (const val of Object.values(mod)) {
      extractMetadataFromFunction(val, result);
    }

    const staticMeta = extractStaticMetadataFromFile(fullPath);
    if (!result.configKey && staticMeta.configKey) {
      result.configKey = staticMeta.configKey;
    }
    if (!result.defaultConfig && staticMeta.defaultConfig) {
      result.defaultConfig = staticMeta.defaultConfig;
    }
    if (!result.description && staticMeta.description) {
      result.description = staticMeta.description;
    }
    if (!result.icon && staticMeta.icon) {
      result.icon = staticMeta.icon;
    }
  } catch {
    // Dynamic import failed or timed out, fallback to static analysis
    return extractStaticMetadataFromFile(fullPath);
  } finally {
    if (timer) clearTimeout(timer);
  }

  metadataCache.set(fullPath, result);
  return result;
}
