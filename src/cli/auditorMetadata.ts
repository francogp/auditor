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
  type GitIgnoreRequirement,
  type AuditorManifestDTO
} from '../core/auditContract.ts';
import { BaseAuditor, DEFAULT_AUDITOR_CAPABILITIES } from '../core/auditorBase.ts';

const DYNAMIC_IMPORT_TIMEOUT_MS = 2000 as const;

export interface ExtractedAuditorMetadata {
  readonly capabilities: AuditorCapabilities;
  readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  readonly icon?: string;
  readonly manifest?: AuditorManifestDTO;
  readonly description?: string;
  readonly ruleDescriptions?: Readonly<Record<string, string>>;
  readonly configKey?: string;
  readonly defaultConfig?: Readonly<Record<string, unknown>>;
}

export function extractStaticMetadataFromFile(fullPath: string): ExtractedAuditorMetadata {
  const result: { capabilities: AuditorCapabilities; gitIgnoreEntries: readonly GitIgnoreRequirement[]; icon?: string } = {
    capabilities: DEFAULT_AUDITOR_CAPABILITIES,
    gitIgnoreEntries: []
  };

  try {
    const content = fsSync.readFileSync(fullPath, 'utf-8');
    const iconMatch = content.match(/icon\s*:\s*['"]([^'"]+)['"]/);
    if (iconMatch?.[1]) {
      result.icon = iconMatch[1];
    }

    const caps: Record<string, boolean> = {};
    if (content.includes('requiresBuild: true')) caps.requiresBuild = true;
    if (content.includes('ast: true') || content.includes('requiresAst: true')) caps.ast = true;
    if (content.includes('fix: true')) caps.fix = true;
    if (content.includes('lint: true')) caps.lint = true;
    if (content.includes('md: true')) caps.md = true;
    if (content.includes('heavy: true')) caps.heavy = true;
    if (content.includes('changedSince: true')) caps.changedSince = true;
    if (content.includes('postRun: true')) caps.postRun = true;

    const descMatch = content.match(/description\s*:\s*['"]([^'"]+)['"]/);
    const configKeyMatch = content.match(/configKey\s*:\s*['"]([^'"]+)['"]/);

    if (Object.keys(caps).length > 0) {
      result.capabilities = {
        ...DEFAULT_AUDITOR_CAPABILITIES,
        ...caps
      };
    }

    return {
      ...result,
      description: descMatch?.[1],
      configKey: configKeyMatch?.[1]
    };
  } catch {
    // catch-ok: Static metadata extraction fallback
  }

  return result;
}

function extractMetadataFromAuditorInstance(
  val: new () => BaseAuditor,
  result: Record<string, unknown>
): void {
  try {
    const instance = new val();
    if (instance?.capabilities && typeof instance.capabilities === 'object') {
      result.capabilities = instance.capabilities;
    }
    if (instance?.icon && typeof instance.icon === 'string') {
      result.icon = instance.icon;
    }
    if (Array.isArray(instance?.gitIgnoreEntries)) {
      result.gitIgnoreEntries = instance.gitIgnoreEntries;
    }
    if (typeof instance?.toManifest === 'function') {
      const manifest = instance.toManifest();
      (result as { manifest?: AuditorManifestDTO }).manifest = manifest;
      (result as { description?: string }).description = manifest.description;
      (result as { ruleDescriptions?: Readonly<Record<string, string>> }).ruleDescriptions = manifest.rules;
      (result as { configKey?: string }).configKey = manifest.configKey;
      (result as { defaultConfig?: Readonly<Record<string, unknown>> }).defaultConfig = manifest.defaultConfig;
    } else if (instance?.description) {
      (result as { description?: string }).description = instance.description;
      (result as { ruleDescriptions?: Readonly<Record<string, string>> }).ruleDescriptions = instance.ruleDescriptions;
      (result as { configKey?: string }).configKey = instance.configKey;
      (result as { defaultConfig?: Readonly<Record<string, unknown>> }).defaultConfig = instance.defaultConfig;
    }
  } catch {
    // catch-ok: Sub-auditor constructor may require specific options
  }
}

function extractMetadataFromFunction(
  val: unknown,
  result: Record<string, unknown>
): void {
  if (typeof val !== 'function') return;

  const withStatic = val as {
    capabilities?: Partial<AuditorCapabilities>;
    gitIgnoreEntries?: readonly GitIgnoreRequirement[];
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

  if (val.prototype instanceof BaseAuditor) {
    extractMetadataFromAuditorInstance(val as new () => BaseAuditor, result);
  }
}

export async function extractAuditorMetadataFromFile(fullPath: string): Promise<ExtractedAuditorMetadata> {
  const result: { capabilities: AuditorCapabilities; gitIgnoreEntries: readonly GitIgnoreRequirement[]; icon?: string } = {
    capabilities: DEFAULT_AUDITOR_CAPABILITIES,
    gitIgnoreEntries: []
  };

  // Self-import guard: Never dynamically import the currently executing script to prevent circular top-level await deadlock
  const scriptArg = process.argv[1];
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
      timer = setTimeout(() => reject(new Error(`Import timeout for ${fullPath}`)), DYNAMIC_IMPORT_TIMEOUT_MS);
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
  } catch {
    // catch-ok: Dynamic import failed or timed out, fallback to static analysis
    return extractStaticMetadataFromFile(fullPath);
  } finally {
    if (timer) clearTimeout(timer);
  }

  return result;
}
