/**
 * scripts/auditors/architecture/validate_native_paths.ts
 *
 * SECURITY & PATH INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces cross-platform safe path operations and security hygiene across the codebase:
 *   1. Unsafe Path Concatenation (`unsafe-path-concat`): Detects raw string templates
 *      or binary string concatenations with slashes used in filesystem operations
 *      or path variable assignments instead of `path.join`, `path.resolve`, `safeJoin`, or `safeResolve`.
 *   2. Unsanitized Env/Argv Path Sinks (`unsanitized-env-argv-path`): Detects raw `process.env`
 *      or `process.argv` passed into filesystem or path manipulation sinks without directory
 *      traversal validation (`assertSafePathComponent`, `sanitizePath`, character sanitization regex).
 *   3. Untrusted URL Fetching (`untrusted-url-fetch`): Detects dynamic URL fetching via `fetch()`
 *      without `new URL()` parsing and origin/hostname/protocol validation or `safeFetch`.
 *   4. Platform-Incompatible Path Operations (`hardcoded-slash-path`): Detects raw backslash/forward
 *      slash operations (e.g. `.lastIndexOf('\\')`, hardcoded `C:\\` drive paths, or `.split('\\')`
 *      on paths) that break POSIX/Windows cross-platform compatibility.
 *
 * Escape Hatches:
 *   `// path-ok`, `// url-ok`, `// env-ok`, `// cross-platform-ok`, `// security-ok`, `// string-ok: Internal string formatting or DOM token identifier`, `// no-domain: Non-domain utility collection or data structure`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_native_paths.ts
 *   npm run validate:native-paths
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import type { FindingSeverity } from '../../core/auditContract.ts';
import {
  CANONICAL_IGNORE_DIRS,
  isPathIgnored,
  loadFallowIgnorePatterns,
  collectRepositoryFiles,
  getEffectiveScannableRoots,
  FileScanAuditor,
  BaseAuditor,
  assertSafePathComponent
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export { CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns, getEffectiveScannableRoots };

export type NativePathRuleId =
  | 'unsafe-path-concat'
  | 'unsanitized-env-argv-path'
  | 'untrusted-url-fetch'
  | 'hardcoded-slash-path';

export interface NativePathViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: NativePathRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}

export interface NativePathAuditResult {
  readonly filesScanned: number;
  readonly violations: readonly NativePathViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<NativePathRuleId, number>;
}

const ESCAPE_HATCH_REGEX = /\/\/\s*(path-ok|url-ok|env-ok|cross-platform-ok|security-ok|string-ok|no-domain|fallow-ignore-next-line|test-ok)\b/i;

const FS_SINK_METHOD_REGEX = /\b(?:fs(?:\.promises)?|fsSync)?\.(?:readFileSync|readFile|writeFileSync|writeFile|existsSync|mkdirSync|mkdir|readdirSync|readdir|statSync|stat|lstatSync|lstat|unlinkSync|unlink|rmSync|rm|rmdirSync|rmdir|copyFileSync|copyFile|openSync|open|createReadStream|createWriteStream)\s*\(/;

const PATH_SINK_METHOD_REGEX = /\bpath\.(?:resolve|join)\s*\(/;

const PATH_VAR_ASSIGN_REGEX = /(?:const|let|var)\s+([a-zA-Z0-9_]*(?:path|dir|file|folder|filepath|dirpath|root)[a-zA-Z0-9_]*)\s*=\s*(.*)/i;


function updateArgParenDepth(char: string, depth: number): number {
  if (char === '(' || char === '[' || char === '{') return depth + 1;
  if (char === ')' || char === ']' || char === '}') return depth - 1;
  return depth;
}

function handleEscapeAndString(char: string, state: { inString: string | null; escape: boolean }): boolean {
  if (state.escape) {
    state.escape = false;
    return true;
  }
  if (char === '\\') {
    state.escape = true;
    return true;
  }
  if (state.inString) {
    if (char === state.inString) state.inString = null;
    return true;
  }
  if (char === "'" || char === '"' || char === '`') {
    state.inString = char;
    return true;
  }
  return false;
}

/**
 * Extracts the first argument from a function call argument list.
 */
function extractFirstArgument(callArgsText: string): string {
  let depth = 0;
  const state = { inString: null as string | null, escape: false };

  for (let i = 0; i < callArgsText.length; i++) {
    const char = callArgsText[i]!;
    if (handleEscapeAndString(char, state)) {
      continue;
    }
    depth = updateArgParenDepth(char, depth);
    if (char === ',' && depth === 0) {
      return callArgsText.slice(0, i).trim();
    }
  }
  return callArgsText.trim();
}

/**
 * Helper to check if a template literal or string is a URL, web asset, CSS, fraction or non-path literal.
 */
function isNonPathString(str: string): boolean {
  const trimmed = str.trim();
  if (
    trimmed.startsWith('`http:') ||
    trimmed.startsWith('`https:') ||
    trimmed.startsWith('`ws:') ||
    trimmed.startsWith('`wss:') ||
    trimmed.startsWith('`data:') ||
    trimmed.startsWith('`file:') ||
    trimmed.startsWith('`blob:') ||
    trimmed.startsWith('`/') ||
    trimmed.startsWith("'http:") ||
    trimmed.startsWith("'https:") ||
    trimmed.startsWith('"http:') ||
    trimmed.startsWith('"https:') ||
    trimmed.startsWith("'/") ||
    trimmed.startsWith('"/')
  ) {
    return true;
  }
  return false;
}

/**
 * Scans a file content for path integrity and security violations.
 */
function checkFsSinkConcat(rawLine: string, trimmed: string, filePath: string, lineNum: number): NativePathViolation | null {
  if (!FS_SINK_METHOD_REGEX.test(rawLine)) return null;

  const fsCallMatch = rawLine.match(FS_SINK_METHOD_REGEX);
  if (!fsCallMatch) return null;

  const afterCall = rawLine.slice(rawLine.indexOf(fsCallMatch[0]) + fsCallMatch[0].length);
  const pathArg = extractFirstArgument(afterCall);

  const hasTemplateWithSlash = /`[^`]*\$\{[^}]+\}[^`]*[/\\][^`]*`|`[^`]*[/\\][^`]*\$\{[^}]+\}[^`]*`/.test(pathArg);
  const hasConcatWithSlash = /\+\s*['"][/\\]['"]\s*\+|\+\s*['"][/\\][^'"]+['"]|['"][^'"]+[/\\]['"]\s*\+/.test(pathArg);

  if ((hasTemplateWithSlash || hasConcatWithSlash) && !isNonPathString(pathArg)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'unsafe-path-concat',
      message: `Concatenación insegura de ruta en llamada al sistema de archivos ('${fsCallMatch[0]}...'). Usa 'path.join()' o 'path.resolve()' en lugar de template literals o operadores '+' con separadores directos.`,
      context: trimmed,
      severity: 'error'
    };
  }
  return null;
}

function checkPathVarAssignConcat(rawLine: string, trimmed: string, filePath: string, lineNum: number): NativePathViolation | null {
  if (FS_SINK_METHOD_REGEX.test(rawLine)) return null;
  const assignMatch = rawLine.match(PATH_VAR_ASSIGN_REGEX);
  if (!assignMatch) return null;

  const rhs = assignMatch[2]?.replace(/;$/, '').trim() || '';
  const hasTemplateSlash = /^`[^`]*\$\{[^}]+\}[^`]*[/\\][^`]*`$|^`[^`]*[/\\][^`]*\$\{[^}]+\}[^`]*`$/.test(rhs);
  const hasBinaryConcat = /\+\s*['"][/\\]['"]\s*\+|\+\s*['"][/\\][^'"]+['"]/.test(rhs);

  if ((hasTemplateSlash || hasBinaryConcat) && !isNonPathString(rhs)) {
    if (!rhs.includes('console.') && !rhs.includes('logger.') && !rhs.startsWith('`http') && !rhs.startsWith('`data:')) {
      return {
        file: filePath,
        line: lineNum,
        ruleId: 'unsafe-path-concat',
        message: `Asignación de variable de ruta '${assignMatch[1]}' mediante concatenación directa o template literal. Usa 'path.join()' o 'path.resolve()'.`,
        context: trimmed,
        severity: 'error'
      };
    }
  }
  return null;
}

function checkUnsafePathConcat(rawLine: string, trimmed: string, filePath: string, lineNum: number): NativePathViolation | null {
  const fsViolation = checkFsSinkConcat(rawLine, trimmed, filePath, lineNum);
  if (fsViolation) return fsViolation;

  if (/\bpath\.(?:join|resolve)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*[/\\][^`]*`/.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'unsafe-path-concat',
      message: `Template literal con separadores de ruta dentro de 'path.join/resolve'. Pasa los segmentos como argumentos separados a 'path.join(a, b)'.`,
      context: trimmed,
      severity: 'error'
    };
  }

  return checkPathVarAssignConcat(rawLine, trimmed, filePath, lineNum);
}

function isEnvArgvSanitized(rawLine: string, lines: readonly string[], i: number): boolean {
  return (
    rawLine.includes('sanitizePath(') ||
    rawLine.includes('assertSafePathComponent(') ||
    (i > 0 && lines[i - 1]?.includes('assertSafePathComponent(') === true) ||
    (i > 1 && lines[i - 2]?.includes('assertSafePathComponent(') === true) ||
    rawLine.includes('.replace(') ||
    rawLine.includes('path.basename(') ||
    rawLine.includes('path.dirname(') ||
    rawLine.includes('cleanAppData') ||
    rawLine.includes('cleanPath') ||
    rawLine.includes(".includes('..')") ||
    (i > 0 && lines[i - 1]?.includes(".includes('..')") === true)
  );
}

function checkUnsanitizedEnvArgv(
  rawLine: string,
  trimmed: string,
  filePath: string,
  lineNum: number,
  lines: readonly string[],
  i: number
): NativePathViolation | null {
  if (!FS_SINK_METHOD_REGEX.test(rawLine) && !PATH_SINK_METHOD_REGEX.test(rawLine)) {
    return null;
  }
  const hasRawEnv = /\bprocess\.env\.[a-zA-Z0-9_]+\b/.test(rawLine);
  const hasRawArgv = /\bprocess\.argv\[[^\]]+\]/.test(rawLine);

  if ((hasRawEnv || hasRawArgv) && !isEnvArgvSanitized(rawLine, lines, i)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'unsanitized-env-argv-path',
      message: `Variable 'process.env' o 'process.argv' pasada directamente a una función de path/filesystem sin sanitizar contra path traversal (CWE-22). Aplica 'assertSafePathComponent()', 'sanitizePath()', o sanitización de caracteres.`,
      context: trimmed,
      severity: 'error'
    };
  }
  return null;
}

function checkUntrustedUrlFetch(
  rawLine: string,
  trimmed: string,
  filePath: string,
  lineNum: number,
  content: string
): NativePathViolation | null {
  const fetchMatch = rawLine.match(/\b(?:await\s+)?fetch\s*\(\s*([a-zA-Z0-9_$.]+)/);
  if (!fetchMatch || !fetchMatch[1]) return null;

  const arg = fetchMatch[1];
  const isSafeArg =
    arg.startsWith("'") ||
    arg.startsWith('"') ||
    arg.startsWith('`') ||
    arg.endsWith('.href') ||
    arg.endsWith('.toString()') ||
    arg === 'safeDevUrl' ||
    rawLine.includes('safeFetch(');

  if (isSafeArg) return null;

  const hasLocalUrlValidation =
    content.includes('new URL(') &&
    (content.includes('.hostname') || content.includes('.origin') || content.includes('.protocol'));

  if (!hasLocalUrlValidation) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'untrusted-url-fetch',
      message: `Llamada dinámica a 'fetch(${arg})' sin validación de URL ni origen/host (CWE-918 SSRF). Convierte a 'new URL()' y valida hostname/origin, o usa 'safeFetch()'.`,
      context: trimmed,
      severity: 'error'
    };
  }
  return null;
}

function checkHardcodedSlashPath(
  rawLine: string,
  trimmed: string,
  filePath: string,
  lineNum: number
): NativePathViolation | null {
  if (/\.(?:lastIndexOf|indexOf)\s*\(\s*['"](?:\\\\|\\)['"]\s*\)/.test(rawLine)) {
    if (!rawLine.includes("'//'") && !rawLine.includes('"//"')) {
      return {
        file: filePath,
        line: lineNum,
        ruleId: 'hardcoded-slash-path',
        message: `Búsqueda manual de separador backslash ('\\\\') en ruta. Rompe compatibilidad POSIX/Linux. Usa 'path.dirname()', 'path.basename()', o 'path.sep'.`,
        context: trimmed,
        severity: 'error'
      };
    }
  }

  if (/(['"`])([a-zA-Z]:(?:\\\\|\/)[^'"`\n]+)\1/.test(rawLine)) {
    if (!rawLine.includes('// no-domain: Non-domain utility collection or data structure') && !rawLine.includes('// test-ok') && !rawLine.includes('// cross-platform-ok')) {
      return {
        file: filePath,
        line: lineNum,
        ruleId: 'hardcoded-slash-path',
        message: `Ruta absoluta con letra de unidad Windows ('C:\\' o 'C:/') detectada en código. Usa rutas relativas o 'path.resolve()'.`,
        context: trimmed,
        severity: 'error'
      };
    }
  }

  if (/\b([a-zA-Z0-9_]*(?:path|dir|file|folder|filepath|dirpath|root)[a-zA-Z0-9_]*)\.split\s*\(\s*['"](?:\\\\|\\)['"]\s*\)/i.test(rawLine)) {
    if (!rawLine.includes('.split(path.sep)') && !rawLine.includes('.replace(') && !rawLine.includes('.join(')) {
      return {
        file: filePath,
        line: lineNum,
        ruleId: 'hardcoded-slash-path',
        message: `Operación '.split(\\'\\\\\\')' directa en variable de ruta '${rawLine}'. Usa 'path.split(path.sep)' o normaliza previamente con 'path.posix.sep'.`,
        context: trimmed,
        severity: 'error'
      };
    }
  }

  return null;
}

function isIgnoredOrCommentLine(rawLine: string, trimmed: string, prevLine?: string): boolean {
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) {
    return true;
  }
  return ESCAPE_HATCH_REGEX.test(rawLine) || (!!prevLine && ESCAPE_HATCH_REGEX.test(prevLine));
}

function evaluateLineNativePathViolations(
  rawLine: string,
  trimmed: string,
  filePath: string,
  lineNum: number,
  lines: readonly string[],
  lineIndex: number,
  content: string
): NativePathViolation | null {
  return (
    checkUnsafePathConcat(rawLine, trimmed, filePath, lineNum) ||
    checkUnsanitizedEnvArgv(rawLine, trimmed, filePath, lineNum, lines, lineIndex) ||
    checkUntrustedUrlFetch(rawLine, trimmed, filePath, lineNum, content) ||
    checkHardcodedSlashPath(rawLine, trimmed, filePath, lineNum)
  );
}

export function scanFileForNativePathViolations(filePath: string, content: string): NativePathViolation[] {
  const violations: NativePathViolation[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();

    if (isIgnoredOrCommentLine(rawLine, trimmed, lines[i - 1])) {
      continue;
    }

    const violation = evaluateLineNativePathViolations(rawLine, trimmed, filePath, i + 1, lines, i, content);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Full repository audit runner for native paths and security integrity.
 */
export function auditNativePaths(targetDir = process.cwd()): NativePathAuditResult {
  assertSafePathComponent(targetDir);
  const extraIgnorePatterns = loadFallowIgnorePatterns(targetDir);
  const config = getAuditConfig(targetDir);
  const scannableRoots = getEffectiveScannableRoots(config);
  const rootsToScan = scannableRoots
    .map(r => path.resolve(targetDir, r))
    .filter(p => fs.existsSync(p));

  const allFiles: string[] = []; // no-domain: Non-domain utility collection or data structure
  for (const root of rootsToScan) {
    allFiles.push(...collectRepositoryFiles(root, targetDir, extraIgnorePatterns));
  }

  const violations: NativePathViolation[] = [];
  const countsByRule: Record<NativePathRuleId, number> = {
    'unsafe-path-concat': 0,
    'unsanitized-env-argv-path': 0,
    'untrusted-url-fetch': 0,
    'hardcoded-slash-path': 0
  };

  for (const file of allFiles) {
    const relPath = path.relative(targetDir, file).split(path.sep).join(path.posix.sep);
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const fileViolations = scanFileForNativePathViolations(relPath, content);
      for (const v of fileViolations) {
        violations.push(v);
        countsByRule[v.ruleId] = (countsByRule[v.ruleId] || 0) + 1;
      }
    } catch {
      // catch-ok: Ignore read errors on locked files
    }
  }

  return {
    filesScanned: allFiles.length,
    violations,
    passed: violations.length === 0,
    countsByRule
  };
}

export class NativePathsAuditor extends FileScanAuditor<NativePathRuleId> {
constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? getEffectiveScannableRoots(config);
    super({
id: 'validate_native_paths',
      name: 'Security & Native Path Integrity Validator',
      description: 'Garantiza uso de path.posix y evita CWE-22 traversal',
      family: 'architecture',
      ruleIds: [
        'unsafe-path-concat',
        'unsanitized-env-argv-path',
        'untrusted-url-fetch',
        'hardcoded-slash-path'
      ],
      packageName: 'Path',
      icon: '🛤️',
      ruleDescriptions: {
        'unsafe-path-concat': 'Concatenación insegura de rutas',
        'unsanitized-env-argv-path': 'Ruta argv/env sin sanitizar',
        'untrusted-url-fetch': 'Llamada HTTP sin sanitizar',
        'hardcoded-slash-path': 'Separador de ruta hardcodeado'
      },
      roots: effectiveRoots,
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const fileViolations = scanFileForNativePathViolations(relPath, content);
    for (const v of fileViolations) {
      this.addViolation(v);
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new NativePathsAuditor());
