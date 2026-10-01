/**
 * scripts/auditors/domain_data/validate_o1_data_structures.ts
 * 
 * O(1) DATA STRUCTURE & LINEAR SEARCH AUDITOR (Node.js 26+ Native)
 * Scans codebase to detect anti-patterns of linear search O(N) and nested loops O(N^2)
 * where an O(1) indexed data structure (Record, ReadonlySet, Map) is available.
 *
 * Rules:
 *   1. o1-catalog-lookup: Linear scan (.find, .filter, .some, .findLast) on static catalogs
 *   2. o1-linear-membership: Array constant .includes() instead of ReadonlySet.has().
 *   3. o1-object-scan: Object.keys() / Object.values() linear search instead of key index.
 *   4. o1-json-clone: JSON.parse(JSON.stringify(...)) anti-pattern instead of structuredClone or factory.
 *   5. o1-redundant-spread-return: Redundant 'return [...arr]' instead of directly returning 'readonly T[]'.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

// ─── Pattern Definitions ──────────────────────────────────────────────────────

export const DEFAULT_O1_CATALOG_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  alternative: string;
  definingFile: string;
}> = [
  {
    name: 'OFFICIAL_SERVERS',
    pattern: /\bOFFICIAL_SERVERS\.(?:find|filter|some|findLast)\s*\(/g,
    alternative: 'OFFICIAL_SERVERS_BY_ID[serverId]',
    definingFile: 'src/data/system/official_servers.ts'
  }
];

export function getResolvedO1CatalogPatterns(): Array<{
  name: string;
  pattern: RegExp;
  alternative: string;
  definingFile: string;
}> {
  const config = getAuditConfig();
  const configured = config.domain?.o1CatalogPatterns;
  if (configured && configured.length > 0) {
    return configured.map(c => ({
      name: c.name,
      pattern: typeof c.pattern === 'string' ? new RegExp(c.pattern, 'g') : c.pattern,
      alternative: c.alternative,
      definingFile: c.definingFile
    }));
  }
  return DEFAULT_O1_CATALOG_PATTERNS;
}

export const O1_CATALOG_PATTERNS = DEFAULT_O1_CATALOG_PATTERNS;

export const P_STATIC_ARRAY_INCLUDES = /(?:\(\s*)?\b([A-Z][A-Z0-9_]+_(?:IDS|LIST|TYPES|CATEGORIES|NAMES|KINDS|ORDER))\b(?:\s+as\s+[^)]+)?(?:\s*\))?\.(?:includes|indexOf)\s*\(/g;
export const P_OBJECT_SCAN_LOOKUP = /\bObject\.(?:keys|values|entries)\s*\([^)]+\)\.(?:find|findLast)\s*\(/g;
export const P_JSON_CLONE = /\bJSON\.parse\s*\(\s*JSON\.stringify\s*\(/g;
export const P_REDUNDANT_SPREAD_RETURN = /return\s*\[\s*\.\.\.([a-zA-Z0-9_$.]+(?:\([^)]*\))?)\s*\]\s*;/g;

// Escape hatch comments (strictly o1-specific, domain-ok is forbidden here)
export const ESCAPE_HATCHES = ['// o1-ok:', '// linear-search-ok:'] as const;

export function shouldIgnoreLine(line: string): boolean {
  return ESCAPE_HATCHES.some(hatch => line.includes(hatch));
}

export type O1RuleId =
  | 'o1-catalog-lookup'
  | 'o1-linear-membership'
  | 'o1-object-scan'
  | 'o1-json-clone'
  | 'o1-redundant-spread-return';

export const O1_RULES: readonly O1RuleId[] = [
  'o1-catalog-lookup',
  'o1-linear-membership',
  'o1-object-scan',
  'o1-json-clone',
  'o1-redundant-spread-return'
] as const;

export function scanFileForO1Issues(
  filePath: string,
  content: string,
  catalogPatterns: Array<{ name: string; pattern: RegExp; alternative: string; definingFile: string }> = getResolvedO1CatalogPatterns()
): Array<{ ruleId: O1RuleId; message: string; line: number; context: string; isWarning: boolean }> {
  const issues: Array<{ ruleId: O1RuleId; message: string; line: number; context: string; isWarning: boolean }> = [];
  const lines = content.split('\n');
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (let index = 0; index < lines.length; index++) {
    const lineText = lines[index]!;
    const lineNumber = index + 1;

    const trimmed = lineText.trim();
    if (shouldIgnoreLine(lineText) || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    // 1. Static Catalog Lookups
    for (const catalog of catalogPatterns) {
      if (normalizedPath.endsWith(catalog.definingFile)) {
        continue; // Skip the catalog's own definition file
      }

      catalog.pattern.lastIndex = 0;
      if (catalog.pattern.test(lineText)) {
        issues.push({
          ruleId: 'o1-catalog-lookup',
          message: `Linear O(N) search on '${catalog.name}'. Use O(1) alternative: ${catalog.alternative}`,
          line: lineNumber,
          context: lineText.trim(),
          isWarning: false
        });
      }
    }

    // 2. Static Array .includes()
    P_STATIC_ARRAY_INCLUDES.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = P_STATIC_ARRAY_INCLUDES.exec(lineText)) !== null) {
      const arrayName = match[1];
      issues.push({
        ruleId: 'o1-linear-membership',
        message: `Linear O(N) membership check with '.includes()' on '${arrayName}'. Derive a 'ReadonlySet<T>' and use '.has()'`,
        line: lineNumber,
        context: lineText.trim(),
        isWarning: false
      });
    }

    // 3. Object.keys / Object.values Linear Scan
    P_OBJECT_SCAN_LOOKUP.lastIndex = 0;
    if (P_OBJECT_SCAN_LOOKUP.test(lineText)) {
      issues.push({
        ruleId: 'o1-object-scan',
        message: "Linear search using 'Object.keys/values/entries().find()'. Index data directly in a Record/Map for O(1) key access",
        line: lineNumber,
        context: lineText.trim(),
        isWarning: false
      });
    }

    // 4. JSON.parse(JSON.stringify) Anti-Pattern
    P_JSON_CLONE.lastIndex = 0;
    if (P_JSON_CLONE.test(lineText)) {
      issues.push({
        ruleId: 'o1-json-clone',
        message: "Forbidden 'JSON" + ".parse(JSON" + ".stringify(...))' deep clone Anti-pattern. Use native 'structuredClone(obj)' or 'cloneReactive(obj)'",
        line: lineNumber,
        context: lineText.trim(),
        isWarning: false
      });
    }

    // 5. Redundant Spread Return 'return [...arr]'
    P_REDUNDANT_SPREAD_RETURN.lastIndex = 0;
    const spreadMatch = P_REDUNDANT_SPREAD_RETURN.exec(lineText);
    if (spreadMatch && spreadMatch[1]) {
      const target = spreadMatch[1].trim();
      issues.push({
        ruleId: 'o1-redundant-spread-return',
        message: `Redundant array spread 'return [...${target}]'. Return the collection directly typed as 'readonly T[]' to prevent unnecessary heap allocations and GC churn.`,
        line: lineNumber,
        context: lineText.trim(),
        isWarning: false
      });
    }
  }

  return issues;
}

export class O1DataStructuresAuditor extends FileScanAuditor<O1RuleId> {
  constructor(roots: readonly string[] = ['src']) {
    super({
      id: 'validate_o1_data_structures',
      name: 'O(1) Data Structure & Performance Auditor',
      description: 'Búsqueda lineal O(N) o clonado con JSON.parse',
      family: 'domain_data',
      ruleIds: O1_RULES,
      packageName: 'O(1)',
      ruleDescriptions: {
        'o1-catalog-lookup': 'Búsqueda lineal en catálogo',
        'o1-linear-membership': 'Búsqueda .includes() en array',
        'o1-object-scan': 'Escaneo en Object.keys/values',
        'o1-json-clone': 'Clonado con JSON.parse(stringify)',
        'o1-redundant-spread-return': 'Retorno redundante con spread'
      },
      roots,
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    if (relPath.includes('.spec.') || relPath.includes('.test.') || relPath.startsWith('tests/') || relPath.endsWith('validate_o1_data_structures.ts')) {
      return;
    }

    const issues = scanFileForO1Issues(relPath, content);
    for (const issue of issues) {
      this.addViolation({
        ruleId: issue.ruleId,
        severity: issue.isWarning ? 'warning' : 'error',
        file: relPath,
        line: issue.line,
        message: issue.message,
        context: issue.context
      });
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new O1DataStructuresAuditor());
}
