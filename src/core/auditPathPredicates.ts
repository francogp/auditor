/**
 * packages/auditor/src/core/auditPathPredicates.ts
 *
 * Path categorization predicates, root matchers, and Z-Layers resolution helpers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getAuditConfig } from './auditConfigLoader.ts';

/**
 * Helper to check if a normalized path matches any of the given root directories.
 */
export function matchesAnyRoot(normalizedPath: string, roots: readonly string[]): boolean {
  if (!normalizedPath || !roots || roots.length === 0) return false;
  return roots.some(root => {
    const cleanRoot = root.replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanRoot !== '' && (
      normalizedPath === cleanRoot ||
      normalizedPath.startsWith(cleanRoot + '/') ||
      normalizedPath.includes('/' + cleanRoot + '/')
    );
  });
}

/**
 * Determines whether a file path belongs to a test, spec, mock, or e2e directory
 * driven dynamically by the project's audit.config.ts configuration.
 */
export function isTestPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const base = norm.split('/').pop() || '';

  if (base.includes('.test.') || base.includes('.spec.')) {
    return true;
  }

  const config = getAuditConfig();
  const customTestPatterns = config?.paths?.testFilePatterns ?? [];
  if (customTestPatterns.some(pat => base.includes(pat.toLowerCase()))) {
    return true;
  }

  const configuredRoots = [
    ...(config.paths.testRoots ?? []),
    ...(config.paths.e2eRoots ?? []),
    ...(config.paths.integrationRoots ?? [])
  ];

  if (matchesAnyRoot(norm, configuredRoots)) {
    return true;
  }

  if (configuredRoots.length === 0 && (norm.startsWith('tests/') || norm.includes('/tests/'))) {
    return true;
  }

  return false;
}

/**
 * Determines whether a file path belongs to a data catalog directory (e.g. static game data,
 * catalogs, domain fixtures) configured in paths.dataRoots.
 */
export function isDataPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const config = getAuditConfig();
  const dataRoots = config?.paths?.dataRoots ?? ['src/data'];

  return matchesAnyRoot(norm, dataRoots);
}

/**
 * Determines whether a file path belongs to a demo/showcase/mock directory
 * configured in paths.demoRoots.
 */
export function isDemoPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const config = getAuditConfig();
  const demoRoots = config?.paths?.demoRoots ?? [];

  return matchesAnyRoot(norm, demoRoots);
}

/**
 * Determines whether a file path belongs to a constants definition directory or module
 * configured in paths.constantsRoots or located within a /constants/ directory.
 */
export function isConstantsPath(filePath: string): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  if (norm.includes('/constants/') || norm.startsWith('constants/')) {
    return true;
  }

  const config = getAuditConfig();
  const constantsRoots = config?.paths?.constantsRoots ?? ['src/constants'];

  return matchesAnyRoot(norm, constantsRoots);
}

/**
 * Checks whether a file path belongs to an explicitly exempt file in paths.exemptFiles.
 */
export function isExemptFile(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const exemptFiles = config?.paths?.exemptFiles ?? [];
  return exemptFiles.some(f => {
    const clean = f.replace(/^\/+|\/+$/g, '').toLowerCase();
    return norm === clean || norm.endsWith('/' + clean);
  });
}

/**
 * Determines whether a file path belongs to codeRoots configured for general code audits,
 * dynamically respecting whether test directories are included or excluded.
 */
export function isInCodeRoots(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  if (norm.includes('node_modules')) return false;

  const codeRoots = config?.paths?.codeRoots ?? ['src', 'scripts'];
  if (!matchesAnyRoot(norm, codeRoots)) return false;

  const includesTests = config?.paths?.includeTestsInCodeAudit === true ||
    (config?.paths?.testRoots ?? []).some(tr => codeRoots.includes(tr));

  if (!includesTests && isTestPath(filePath)) {
    return false;
  }

  return true;
}

/**
 * Determines whether the specified project root is the @francogp/auditor provider repository itself.
 */
export function isSelfProviderProject(projectRoot: string): boolean {
  const hostPkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(hostPkgPath)) return false;
  try {
    const pkgData = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as { name?: string };
    if (pkgData.name === '@francogp/auditor') {
      const hasPluginJson = fs.existsSync(path.join(projectRoot, 'plugin.json'));
      const hasSkillMd =
        fs.existsSync(path.join(projectRoot, '.agents/skills/auditor/SKILL.md')) ||
        fs.existsSync(path.join(projectRoot, 'skills/auditor/SKILL.md')) ||
        fs.existsSync(path.join(projectRoot, 'skills/auditor-framework/SKILL.md'));
      return hasPluginJson && hasSkillMd;
    }
  } catch {
    // catch-ok: Fallback to false
  }
  return false;
}

/**
 * Checks whether a file path belongs to scriptsRoots.
 */
export function isScriptPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const scriptsRoots = config?.paths?.scriptsRoots ?? ['scripts'];
  return matchesAnyRoot(norm, scriptsRoots);
}

/**
 * Checks whether a file path belongs to srcRoots.
 */
export function isSrcPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const srcRoots = config?.paths?.srcRoots ?? ['src'];
  return matchesAnyRoot(norm, srcRoots);
}

/**
 * Checks whether a file path belongs to cliRoots.
 */
export function isCliPath(filePath: string, config = getAuditConfig()): boolean {
  if (!filePath) return false;
  const norm = filePath.split('\\').join('/').toLowerCase();
  const cliRoots = config?.paths?.cliRoots ?? ['src/cli'];
  return matchesAnyRoot(norm, cliRoots);
}

/**
 * Resolves the primary SCSS file path for Z-Layers from config or stylesRoots.
 */
export function resolveZLayersScssPath(projectRoot: string = process.cwd()): string | undefined {
  const config = getAuditConfig(projectRoot);
  const rawTarget = config.styles?.zLayersScssFile ?? config.styles?.baseScssFile;
  if (rawTarget) {
    const configuredPath = path.resolve(projectRoot, rawTarget);
    if (fs.existsSync(configuredPath)) return configuredPath;
  }

  const stylesRoots = config.paths?.stylesRoots ?? ['src/styles'];
  const baseNames = ['_base.scss', 'core/_base.scss', 'base.scss', 'main.scss', 'index.scss'];
  for (const r of stylesRoots) {
    for (const b of baseNames) {
      const candidate = path.resolve(projectRoot, r, b);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

/**
 * Canonical fallback Z-Layers scale matching framework standards.
 */
export const Z_LAYERS: Readonly<Record<string, number>> = Object.freeze({
  BASE: 0,
  LOW: 50,
  CONTENT: 100,
  HEADER: 500,
  SIDEBAR: 800,
  HUD: 1000,
  NAVIGATION: 5000,
  DROPDOWN: 7000,
  OVERLAY: 10000,
  MODAL: 11000,
  MODAL_STEP: 10,
  TOOLTIP: 15000,
  TOAST: 20000,
  MAX: 100000,
  CRITICAL: 999999
});

function parseZLayersFromTs(tsPath: string): Record<string, number> | null {
  if (!fs.existsSync(tsPath)) return null;
  try {
    const content = fs.readFileSync(tsPath, 'utf-8');
    const objMatch = content.match(/(?:export\s+)?const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}(?:\s*as\s+const)?\s*;/);
    if (!objMatch?.[1]) return null;

    const parsed: Record<string, number> = {};
    for (const line of objMatch[1].split('\n')) {
      const propMatch = line.match(/^\s*(\w+)\s*:\s*(-?\d+)/);
      if (propMatch?.[1] && propMatch[2]) {
        parsed[propMatch[1]] = parseInt(propMatch[2], 10);
      }
    }
    return Object.keys(parsed).length > 0 ? parsed : null;
  } catch {
    // catch-ok: Fallback to default on read or parse failure
    return null;
  }
}

/**
 * Resolves the effective Z-Layers dictionary from config.styles.zLayers,
 * or by parsing the TypeScript file defined in config.styles.zLayersTsFile or config.domain.zLayersFile,
 * or falls back to the default Z_LAYERS.
 */
export function getEffectiveZLayers(projectRoot: string = process.cwd()): Record<string, number> {
  const config = getAuditConfig(projectRoot);
  if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) {
    return config.styles.zLayers;
  }

  const rawTsTarget = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
  if (rawTsTarget) {
    const parsed = parseZLayersFromTs(path.resolve(projectRoot, rawTsTarget));
    if (parsed) return parsed;
  }

  return Z_LAYERS;
}
