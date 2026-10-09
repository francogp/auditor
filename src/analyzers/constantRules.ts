/**
 * packages/auditor/src/analyzers/constantRules.ts
 *
 * Rules and heuristics for magic numbers, constant names, numeric suffixes, and aliases.
 */

import path from 'node:path';
import {
  getAuditConfig,
  isDataPath,
  isDemoPath,
  isConstantsPath,
  isInCodeRoots,
  isExemptFile
} from '../core/auditConfig.ts';
import { isPathIgnored, matchesSinglePattern } from '../core/auditorBase.ts';
import { toPosixRelative } from '../core/safePath.ts';
import { stripComments } from '../core/scannerUtils.ts';
import {
  type AuditRule,
  getLineAtMatch,
  isCommentLine,
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

export function isMagicNumberExemptFile(filePath?: string, projectRoot = process.cwd()): boolean {
  if (!isAuditableCodeFile(filePath)) return true;
  const norm = normalizeFilePath(filePath!);
  const relPath = path.isAbsolute(filePath!)
    ? toPosixRelative(projectRoot, filePath!)
    : norm;
  const config = getAuditConfig(projectRoot);
  const exemptGlobs = config.constants?.exemptGlobs ?? [];
  for (const glob of exemptGlobs) {
    if (matchesSinglePattern(relPath, glob) || matchesSinglePattern(norm, glob)) {
      return true;
    }
  }
  return (
    isPathIgnored(relPath, [], [], projectRoot) ||
    isDataPath(filePath!) ||
    isDemoPath(filePath!) ||
    isConstantsPath(filePath!) ||
    norm.endsWith('config.ts') ||
    norm.endsWith('.scss') ||
    norm.endsWith('.css')
  );
}

function isInsideStringOrComment(content: string, matchIndex: number, lineStartPos: number, line: string, trimmed: string): boolean {
  if (isCommentLine(trimmed)) return true;
  const inlineCommentIdx = line.indexOf('//');
  if (inlineCommentIdx !== -1 && (matchIndex - lineStartPos) > inlineCommentIdx) return true;

  const lineIncludingMatch = content.substring(lineStartPos, matchIndex + 1);
  const singleQuotes = (lineIncludingMatch.match(/(?<!\\)'/g) || []).length;
  const doubleQuotes = (lineIncludingMatch.match(/(?<!\\)"/g) || []).length;
  const lineBackticks = (lineIncludingMatch.match(/(?<!\\)\x60/g) || []).length;
  if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || lineBackticks % 2 === 1) return true;

  const contentBefore = content.substring(0, matchIndex);
  const contentWithoutComments = stripComments(contentBefore);
  const totalBackticks = (contentWithoutComments.match(/(?<!\\)\x60/g) || []).length;
  if (totalBackticks % 2 === 1) {
    const lastBacktickPos = contentWithoutComments.lastIndexOf('\x60');
    const textSinceBacktick = contentWithoutComments.substring(lastBacktickPos);
    const openInterpolations = (textSinceBacktick.match(/\$\{/g) || []).length;
    const closeInterpolations = (textSinceBacktick.match(/\}/g) || []).length;
    if (openInterpolations <= closeInterpolations) return true;
  }

  return false;
}

function isNamedConstantDeclaration(trimmed: string): boolean {
  if (/^(?:(?:export\s+)?(?:declare\s+)?(?:(?:public|private|protected|static|readonly)\s+)*const\s+[A-Z0-9_]+\b|(?:(?:public|private|protected|static)\s+)*readonly\s+[A-Z0-9_]+\b)/.test(trimmed)) {
    return true;
  }
  if (/^[A-Z0-9_]{2,}\s*[:=]\s*-?[\d.]+/.test(trimmed)) {
    return true;
  }
  return false;
}

function isExemptSyntaxDeclaration(trimmed: string): boolean {
  if (/^(?:export\s+)?(?:type|interface|enum)\s+\w+/.test(trimmed)) return true;
  if (/^import\s+/.test(trimmed)) return true;
  return false;
}

function isRegexQuantifierOrEscape(content: string, match: RegExpExecArray): boolean {
  if (match.index > 0 && (content[match.index - 1] === '\\' || content[match.index - 1] === '{')) return true;
  const afterIdx = match.index + match[0].length;
  if (afterIdx < content.length && (content[afterIdx] === '}' || content[afterIdx - 1] === '}')) return true;
  return false;
}

function isExemptLiteralOrProtocol(line: string): boolean {
  if (/rgba?\s*\(|hsl\s*\(|#[0-9a-f]{3,8}\b|0x[0-9a-f]+|0o[0-7]+|0b[01]+/i.test(line)) return true;
  if (/<svg|<path|<rect|<circle|<g\b|viewBox=|d=["']M/i.test(line)) return true;
  if (/\b(?:VARCHAR|CHAR|INT|TIMESTAMP|DECIMAL)\s*\(\s*\d+/i.test(line)) return true;
  if (/https?:\/\/|localhost|127\.0\.0\.1|utf-8/i.test(line)) return true;
  if (/\b(?:width|minWidth|maxWidth|height|minHeight|maxHeight|colSpan|rowSpan)\s*:\s*-?[\d.]+/i.test(line)) return true;
  if (/v-gsap(?:-[a-z0-9-]+)?=/i.test(line)) return true;
  if (/\b(?:[xyz]|scale|scaleX|scaleY|rotation|rotate|duration|delay|stagger|radius|top|left|right|bottom|fontSize|zIndex)\s*:\s*-?[\d.]+/i.test(line)) return true;
  if (/Math\.(?:sin|cos|tan)\s*\([^)]+\)\s*\*\s*\d+/i.test(line)) return true;
  if (/\b(?:seed|rng|hash)\s*\*\s*\d+/i.test(line)) return true;
  return false;
}

function isInsideVueStyle(content: string, matchIndex: number, filePath: string): boolean {
  if (!filePath.endsWith('.vue')) return false;
  const styleOpenIndex = content.lastIndexOf('<style', matchIndex);
  const styleCloseIndex = content.lastIndexOf('</style>', matchIndex);
  return styleOpenIndex !== -1 && styleOpenIndex > styleCloseIndex;
}

const MAX_OBJECT_DECLARATION_LOOKBACK_CHARS = 250;

const NAMED_CONST_DECL_PATTERN = /(?:export\s+)?(?:(?:public|private|protected|static|declare)\s+)*(?:const|readonly)\s+[A-Z0-9_]{2,}(?:\s*:\s*(?:[^\s=;][^=;\r\n]*)?\S)?\s*=\s*$/;

function findEnclosingOpenBrace(content: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex - 1; i >= 0; i--) {
    const ch = content[i];
    if (ch === '}') {
      depth++;
    } else if (ch === '{') {
      if (depth > 0) {
        depth--;
      } else {
        return i;
      }
    }
  }
  return -1;
}

function hasNamedConstDeclaration(content: string, braceIndex: number): boolean {
  const lookbackStart = Math.max(0, braceIndex - MAX_OBJECT_DECLARATION_LOOKBACK_CHARS);
  const precedingText = content.substring(lookbackStart, braceIndex).trim();
  return NAMED_CONST_DECL_PATTERN.test(precedingText);
}

function isInsideNamedConstantObject(content: string, matchIndex: number, trimmed: string): boolean {
  if (!/^\s*(?:[\w$]+|['"][\w$-]+['"])\s*:\s*-?[\d.]+/.test(trimmed)) {
    return false;
  }

  const openBraceIndex = findEnclosingOpenBrace(content, matchIndex);
  if (openBraceIndex === -1) return false;

  if (hasNamedConstDeclaration(content, openBraceIndex)) {
    return true;
  }

  const lookbackStart = Math.max(0, openBraceIndex - MAX_OBJECT_DECLARATION_LOOKBACK_CHARS);
  const precedingText = content.substring(lookbackStart, openBraceIndex).trim();

  if (/(?:[\w$]+|['"][\w$-]+['"])\s*:\s*$/.test(precedingText)) {
    const outerBraceIndex = findEnclosingOpenBrace(content, openBraceIndex);
    if (outerBraceIndex !== -1 && hasNamedConstDeclaration(content, outerBraceIndex)) {
      return true;
    }
  }

  return false;
}

const STANDARD_RADIX_STRINGS: ReadonlySet<string> = new Set(['2', '8', '10', '16', '36']); // runtime-set: Standard positional numeral system radices
const RADIX_PARSE_INT_REGEX = /(?:\bNumber\.)?\bparseInt\s*\([^,]+,\s*(\d+)\s*\)/;
const RADIX_TO_STRING_REGEX = /\.toString\s*\(\s*(\d+)\s*\)/;

function isStandardRadixUsage(matchValue: string | undefined, line: string): boolean {
  if (!matchValue || !STANDARD_RADIX_STRINGS.has(matchValue)) {
    return false;
  }
  const parseMatch = RADIX_PARSE_INT_REGEX.exec(line);
  if (parseMatch && parseMatch[1] === matchValue) return true;

  const toStringMatch = RADIX_TO_STRING_REGEX.exec(line);
  if (toStringMatch && toStringMatch[1] === matchValue) return true;

  return false;
}

function isMagicNumberSyntaxExempt(content: string, match: RegExpExecArray, line: string, trimmed: string, filePath: string): boolean {
  if (isNamedConstantDeclaration(trimmed)) return true;
  if (isExemptSyntaxDeclaration(trimmed)) return true;
  if (isRegexQuantifierOrEscape(content, match)) return true;
  if (isStandardRadixUsage(match[2], line)) return true;
  if (isExemptLiteralOrProtocol(line)) return true;
  if (isInsideNamedConstantObject(content, match.index, trimmed)) return true;
  return isInsideVueStyle(content, match.index, filePath);
}

function isExemptNumericValue(matchValue?: string): boolean {
  const num = parseInt(matchValue || '', 10);
  if (isNaN(num)) return true;
  if (EXEMPT_AUDIT_NUMERIC_LITERALS.has(num)) return true;
  const config = getAuditConfig();
  const customExempt = config.constants?.exemptMagicNumbers ?? [];
  return customExempt.includes(num);
}

/** Standard numeric identity values, infinite sentinels and HTTP status codes exempt from magic number audit */
export const EXEMPT_AUDIT_NUMERIC_LITERALS: ReadonlySet<number> = new Set([0, 1, 100, 200, 404, 500, 9999]); // runtime-set: Fast O(1) membership lookup set

export const magicNumbers: AuditRule = {
  regex: /([^\w#$])(\d{2,})\b/g,
  message: (match: string) => `Número mágico inline detectado: '${match.trim()}'. Viola el Absolute Prohibition on Magic Numbers (Named Constants Mandate). Declara la constante nominada descriptiva (readonly / as const) o impórtala desde un módulo de constantes.`,
  severity: 'error',
  appliesTo: (filePath: string) => !isMagicNumberExemptFile(filePath),
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (isMagicNumberExemptFile(filePath)) return false;

    const { line, lineStartPos, trimmed } = getLineAtMatch(content, match.index);
    if (isInsideStringOrComment(content, match.index, lineStartPos, line, trimmed)) return false;
    if (isMagicNumberSyntaxExempt(content, match, line, trimmed, filePath!)) return false;
    if (isExemptNumericValue(match[2])) return false;

    return true;
  },
  fixable: false
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
