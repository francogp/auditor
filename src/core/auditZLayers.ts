/**
 * packages/auditor/src/core/auditZLayers.ts
 *
 * Z-Layers resolution helpers, TypeScript parser, and canonical default layer map.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getAuditConfig } from './auditConfigLoader.ts';

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
