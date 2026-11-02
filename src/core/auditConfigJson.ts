/**
 * src/core/auditConfigJson.ts
 * Pure JSON parsing, merging, and serialization helpers for audit.config.json.
 */
import fs from 'node:fs';

import { safeJsonParse, safeReadFileSync, tryCatchSync } from './safeUtils.ts';

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMergeMissingJson(
  target: Record<string, unknown>,
  missing: Record<string, unknown>
): boolean {
  let modified = false;
  for (const [key, val] of Object.entries(missing)) {
    if (val === undefined) continue;
    const curr = target[key];
    if (curr === undefined) {
      target[key] = val;
      modified = true;
    } else if (isPlainRecord(curr) && isPlainRecord(val) && deepMergeMissingJson(curr, val)) {
      modified = true;
    }
  }
  return modified;
}

export function appendMissingSectionsToJsonFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>>
): void {
  const code = safeReadFileSync(configFilePath);
  if (!code) return;
  const json = safeJsonParse<Record<string, unknown>>(code);
  if (!isPlainRecord(json)) return;
  if (deepMergeMissingJson(json, sectionsToInsert)) {
    tryCatchSync(() => {
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    });
  }
}
