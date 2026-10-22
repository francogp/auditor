/**
 * packages/auditor/src/analyzers/zIndexRules.ts
 *
 * Z-Index Design System Parity and isolated constant rules.
 */

import path from 'node:path';
import { safeReadFileSync } from '../core/safeUtils.ts';
import { getAuditConfig, isExemptFile, Z_LAYERS } from '../core/auditConfig.ts';
import { type RuleDescriptor, type AuditRule, normalizeFilePath } from './auditRuleTypes.ts';

export { Z_LAYERS };

export const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor = {
  id: 'z-index-parity',
  name: 'Z-Index Parity (Design System Layers)',
  category: 'Z-Index fuera de estándar',
  aliases: ['z-index', 'zindex', 'visuals', 'parity', 'z-index-parity']
};

export const CANONICAL_DEFAULT_Z_LAYERS: Record<string, number> = {
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
};

function parseZLayersFromContent(content: string): Record<string, number> | null {
  const match = content.match(/export\s+const\s+Z_LAYERS\s*=\s*\{([\s\S]*?)\}\s*(?:as\s+const)?;/);
  if (!match?.[1]) return null;

  const result: Record<string, number> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/([A-Z_]\w*)\s*:\s*(-?\d+)/i);
    if (m?.[1] && m?.[2]) {
      result[m[1]] = parseInt(m[2], 10);
    }
  }
  return result;
}

function tryReadZLayersFile(relFile: string): Record<string, number> | null {
  const absPath = path.resolve(process.cwd(), relFile);
  const content = safeReadFileSync(absPath);
  return content ? parseZLayersFromContent(content) : null;
}

function loadZLayers(): Record<string, number> {
  const config = getAuditConfig();
  if (config.styles?.zLayers && Object.keys(config.styles.zLayers).length > 0) {
    return { ...config.styles.zLayers };
  }
  const relFile = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
  if (relFile) {
    const parsed = tryReadZLayersFile(relFile);
    if (parsed) return parsed;
  }
  return CANONICAL_DEFAULT_Z_LAYERS;
}

export const ACTIVE_Z_LAYERS: Record<string, number> = loadZLayers();

// Invert ACTIVE_Z_LAYERS for lookup
export const Z_VALUE_MAP = Object.fromEntries(
  Object.entries(ACTIVE_Z_LAYERS).map(([key, value]) => [value, key])
);

// Sorted values for nearest search
export const Z_SORTED_ENTRIES = Object.entries(ACTIVE_Z_LAYERS).sort((a, b) => a[1] - b[1]);
/** Sentinel: initial minDiff larger than any possible difference between Z layer values. */
const Z_LAYERS_DIFF_SENTINEL = Z_SORTED_ENTRIES.length + 1;

export interface ZLayerResolution {
  exactKey?: string;
  nearestKey?: string;
  offset?: number;
  cssVarExpr?: string;
}

export function resolveZLayer(val: number): ZLayerResolution {
  const entry = Z_VALUE_MAP[val];
  if (entry) {
    const key = entry.toLowerCase().replace(/_/g, '-');
    return { exactKey: entry, cssVarExpr: `var(--z-${key})` };
  }

  let nearestKey = '';
  let nearestVal = 0;
  let minDiff = Z_LAYERS_DIFF_SENTINEL;
  for (const [key, zVal] of Z_SORTED_ENTRIES) {
    const diff = Math.abs(val - zVal);
    if (diff < minDiff) {
      minDiff = diff;
      nearestKey = key;
      nearestVal = zVal;
    }
  }

  if (nearestKey) {
    const key = nearestKey.toLowerCase().replace(/_/g, '-');
    const offset = val - nearestVal;
    const sign = offset >= 0 ? '+' : '-';
    return {
      nearestKey,
      offset,
      cssVarExpr: `calc(var(--z-${key}) ${sign} ${Math.abs(offset)})`
    };
  }

  return {};
}

export function fixZIndexLiteral(match: string): string {
  const valMatch = match.match(/-?\d+/);
  if (!valMatch || !valMatch[0]) return match;
  const val = parseInt(valMatch[0], 10);
  const { cssVarExpr } = resolveZLayer(val);
  if (!cssVarExpr) return match;

  const isJsProp = match.startsWith('zIndex');
  const propName = isJsProp ? 'zIndex' : 'z-index';
  return isJsProp ? `${propName}: '${cssVarExpr}'` : `${propName}: ${cssVarExpr}`;
}

export const zIndexAudit: AuditRule = {
  id: 'zIndexAudit',
  name: 'Z-Index Audit',
  category: 'Z-Index fuera de estándar',
  aliases: ['z-index', 'zindex', 'z_index'],
  // Matches both CSS `z-index: N` and JS inline-style `zIndex: N`
  regex: /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi,
  message: (match: string) => {
    const numMatch = match.match(/-?\d+/);
    if (!numMatch || !numMatch[0])
      return `Hardcoded z-index detected: '${match}'. Use 'var(--z-layer)'.`;
    const val = parseInt(numMatch[0], 10);
    const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(val);

    if (exactKey && cssVarExpr) {
      return `Hardcoded z-index detected: '${match}'. Corresponds to Z_LAYERS.${exactKey}. Use '${cssVarExpr}'.`;
    }

    if (nearestKey && cssVarExpr) {
      return `Relative z-index detected: '${match}'. Near Z_LAYERS.${nearestKey}. Use '${cssVarExpr}'.`;
    }

    const zFile = getAuditConfig().styles?.zLayersTsFile ?? getAuditConfig().domain?.zLayersFile;
    const targetMsg = zFile ? `in '${zFile}'` : 'in styles configuration';
    return `Hardcoded non-standard z-index: '${match}'. Define a new layer ${targetMsg} or use an existing one.`;
  },
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    const config = getAuditConfig();
    if (config.styles?.zLayersEnabled === false) return false;
    if (filePath && isExemptFile(filePath)) return false;
    return true;
  },
  fix: fixZIndexLiteral,
  fixable: true
};

export const zIndexConstantDeclaration: AuditRule = {
  regex: /const\s+(\w*Z_INDEX\w*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi,
  message: (match: string) => {
    const zFile = getAuditConfig().styles?.zLayersTsFile ?? getAuditConfig().domain?.zLayersFile;
    const targetDesc = zFile ? `'${zFile}' (Z_LAYERS)` : 'the canonical Z_LAYERS configuration';
    return `Isolated z-index constant declaration detected: '${match}'. Declaring z-index constants outside of ${targetDesc} is PROHIBITED. Register the layer in Z_LAYERS or consume 'Z_LAYERS.<LAYER>'.`;
  },
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    const config = getAuditConfig();
    if (config.styles?.zLayersEnabled === false) return false;
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    const zFile = config.styles?.zLayersTsFile ?? config.domain?.zLayersFile;
    if (zFile && norm.includes(normalizeFilePath(zFile))) return false;
    return !norm.includes('node_modules');
  },
  fixable: false
};
