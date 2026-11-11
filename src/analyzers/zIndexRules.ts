/**
 * packages/auditor/src/analyzers/zIndexRules.ts
 *
 * Z-Index Design System Parity and isolated constant rules.
 */

import {
  getAuditConfig,
  getEffectiveZLayers,
  isExemptFile,
  Z_LAYERS
} from '../core/auditConfig.ts';
import { CANONICAL_Z_LAYERS } from '../modals/modalZLayers.ts';
import { type RuleDescriptor, type AuditRule, normalizeFilePath } from './auditRuleTypes.ts';

export { Z_LAYERS, CANONICAL_Z_LAYERS };

export const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor = {
  id: 'z-index-parity',
  name: 'Z-Index Parity (Design System Layers)',
  category: 'Z-Index outside standard',
  aliases: ['z-index', 'zindex', 'visuals', 'parity', 'z-index-parity']
};

export const ACTIVE_Z_LAYERS: Record<string, number> = getEffectiveZLayers();

// Invert ACTIVE_Z_LAYERS for lookup
export const Z_VALUE_MAP = Object.fromEntries(
  Object.entries(ACTIVE_Z_LAYERS).map(([key, value]) => [value, key])
);

// Sorted values for nearest search
export const Z_SORTED_ENTRIES = Object.entries(ACTIVE_Z_LAYERS).sort((a, b) => a[1] - b[1]);

export interface ZLayerResolution {
  exactKey?: string;
  nearestKey?: string;
  offset?: number;
  cssVarExpr?: string;
}

interface PrecomputedZLayerIndex {
  readonly exactByValue: ReadonlyMap<number, string>;
  readonly sortedLayers: readonly (readonly [string, number])[];
}

const zLayerIndexCache = new WeakMap<object, PrecomputedZLayerIndex>();

function getZLayerIndex(layers: Readonly<Record<string, number>>): PrecomputedZLayerIndex {
  const cached = zLayerIndexCache.get(layers);
  if (cached) {
    return cached;
  }

  const allEntries = Object.entries(layers);
  const layerEntries = allEntries.filter(([key]) => key !== 'MODAL_STEP');
  const effectiveEntries = layerEntries.length > 0 ? layerEntries : allEntries;

  // Forward insertion so consumer overrides (e.g. MAP_FLOOR: 10, MAP_SPAWNS: 50) win over earlier keys
  const exactByValue = new Map<number, string>();
  for (const [key, value] of effectiveEntries) {
    exactByValue.set(value, key);
  }
  const sortedLayers = [...effectiveEntries].sort((a, b) => a[1] - b[1]);
  const built: PrecomputedZLayerIndex = { exactByValue, sortedLayers };
  zLayerIndexCache.set(layers, built);
  return built;
}

export function resolveZLayer(
  val: number,
  layers: Readonly<Record<string, number>> = getEffectiveZLayers()
): ZLayerResolution {
  const index = getZLayerIndex(layers);
  const exactEntry = index.exactByValue.get(val);
  if (exactEntry) {
    const key = exactEntry.toLowerCase().replace(/_/g, '-');
    return { exactKey: exactEntry, cssVarExpr: `var(--z-${key})` };
  }

  let nearestKey = '';
  let nearestVal = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (const [key, zVal] of index.sortedLayers) {
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

export function fixZIndexLiteral(
  match: string,
  layers: Readonly<Record<string, number>> = getEffectiveZLayers()
): string {
  const valMatch = match.match(/-?\d+/);
  if (!valMatch || !valMatch[0]) return match;
  const val = parseInt(valMatch[0], 10);
  const { cssVarExpr } = resolveZLayer(val, layers);
  if (!cssVarExpr) return match;

  const isJsProp = match.startsWith('zIndex');
  const propName = isJsProp ? 'zIndex' : 'z-index';
  return isJsProp ? `${propName}: '${cssVarExpr}'` : `${propName}: ${cssVarExpr}`;
}

export const zIndexAudit: AuditRule = {
  id: 'zIndexAudit',
  name: 'Z-Index Audit',
  category: 'Z-Index outside standard',
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
