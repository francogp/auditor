/**
 * packages/auditor/src/analyzers/constantRules.ts
 *
 * Architecture rules for constant naming hygiene, numeric suffixes, and redundant aliases.
 */

import { getAuditConfig, isInCodeRoots, isExemptFile } from '../core/auditConfig.ts';
import {
  type AuditRule,
  isTestOrNodeModules,
  normalizeFilePath
} from './auditRuleTypes.ts';

export function isAuditableCodeFile(filePath?: string, config = getAuditConfig()): filePath is string {
  if (!filePath) return false;
  return isInCodeRoots(filePath, config) && !isExemptFile(filePath, config);
}

export const DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES = [
  'GEN_', 'ISO_', 'UTF_8', 'BASE_64', 'RGB_', 'RGBA_', 'WASM_', 'HTML_5', 'CSS_3', 'HTTP_', 'D3_'
] as const;

export function isConstantNameExemptFromNumericSuffixCheck(constName: string, config = getAuditConfig()): boolean {
  if (!constName || /^\d/.test(constName)) return true;
  const domainPrefixes = config.domain?.allowedNumericConstantPrefixes?.length
    ? config.domain.allowedNumericConstantPrefixes
    : DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES;
  const prefixes = [
    ...domainPrefixes,
    ...(config.constants?.allowedNumericPrefixes ?? [])
  ];
  return prefixes.some(prefix => constName.startsWith(prefix) || constName.includes(prefix));
}

export const noAliasConstants: AuditRule = {
  regex: /\bconst\s+([A-Z0-9_]{3,})(?:\s*:\s*(?:[^\s=;][^=;\r\n]*)?\S)?\s*=\s*([A-Z0-9_]+(?:\.[A-Z0-9_]+)*)(?:\s+as\s+[^\s;]+(?:\s+[^\s;]+)*)?\s*(?:;\s*)?$/gm,
  message: (match: string) => `Alias de constante detectado: '${match.trim()}'. Está PROHIBIDO inicializar una constante con otra constante o propiedad de constante existente para crear un alias duplicado/intermedio. Usa la constante canónica de origen de forma directa.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const norm = normalizeFilePath(filePath);
    if (norm.includes('node_modules')) return false;
    const constA = match[1];
    const constB = match[2];
    if (!constA || !constB || constA === constB) return false;
    const afterMatch = content.substring(match.index + match[0].length);
    if (afterMatch.trimStart().startsWith('.') || afterMatch.trimStart().startsWith('(')) return false;
    if (/^[\d_]+$/.test(constB) || /^\d/.test(constB)) return false;
    return true;
  }
};

export const noLiteralSuffixInConstantName: AuditRule = {
  regex: /\b([A-Z0-9_]+_(\d{2,}))\b/g,
  message: (match: string) => `Constante con sufijo numérico crudo detectada: '${match}'. Está PROHIBIDO incluir literales numéricos al final de los nombres de constantes (ej: _100, _600, _10000). Usa nombres semánticos descriptivos.`,
  severity: 'error',
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (isTestOrNodeModules(filePath)) return false;
    const constName = match[1] || '';
    return !isConstantNameExemptFromNumericSuffixCheck(constName);
  }
};

export const badConstantNames: AuditRule = {
  regex: /^\s*(?:export\s+)?const\s+([A-Z0-9_]+?_\d+)\b/gm,
  message: (match: string) => `Nombre de constante antipatrón detectado en declaración: '${match.trim()}'. Está PROHIBIDO incluir el valor numérico en el nombre de la constante (ej: usa MAX_RETRY_COUNT en lugar de MAX_RETRY_COUNT_LIMIT). Describe el propósito semántico o la intención de dominio.`,
  severity: 'error',
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (isTestOrNodeModules(filePath)) return false;
    const constName = match[1] || '';
    return !isConstantNameExemptFromNumericSuffixCheck(constName);
  },
  fixable: false
};
