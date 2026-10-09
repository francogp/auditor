/**
 * @file reportUtils.ts
 * @description Utilidades compartidas para formateo de reportes y salida de scripts de validación
 * del proyecto. Evita la duplicación de lógica de generación de archivos de reporte.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';
import type { AuditFinding } from './auditContract.ts';

export interface ValidationSummary {
  title: string;
  scannedMetrics: Record<string, number>;
  errors: string[];
  warnings: string[];
}

export function printConsoleHeader(title: string): void {
  console.log(styleText('bold', `\n--- 🛡️  ${title} ---`));
}

export const MAX_REPORT_SAMPLE_ITEMS = 30;

export function printConsoleSummary(summary: ValidationSummary, verbose: boolean = true): void {
  console.log(`\n════════════════════════════════════`);
  console.log(`    ${summary.title.toUpperCase()}`);
  console.log(`════════════════════════════════════`);
  for (const [key, value] of Object.entries(summary.scannedMetrics)) {
    console.log(`📦 ${key}: ${value}`);
  }
  console.log(`════════════════════════════════════\n`);

  if (!verbose) {
    console.log(styleText('cyan', `\n[INFO] Modo resumen activo: ${summary.errors.length} errores, ${summary.warnings.length} advertencias.`));
  } else {
    if (summary.warnings.length) {
      console.log(styleText('yellow', `⚠️  WARNINGS (${summary.warnings.length}):`));
      const limit = MAX_REPORT_SAMPLE_ITEMS;
      summary.warnings.slice(0, limit).forEach(w => console.log(`   ${w}`));
      if (summary.warnings.length > limit) {
        console.log(styleText('cyan', `   ... y ${summary.warnings.length - limit} advertencias más (usa -o para ver todas)`));
      }
      console.log('');
    }

    if (summary.errors.length) {
      console.log(styleText('red', `❌ ERRORS (${summary.errors.length}):`));
      const limit = MAX_REPORT_SAMPLE_ITEMS;
      summary.errors.slice(0, limit).forEach(e => console.log(`   ${e}`));
      if (summary.errors.length > limit) {
        console.log(styleText('cyan', `   ... y ${summary.errors.length - limit} errores más (usa -o para ver todos)`));
      }
      console.log('\n' + styleText('red', 'Corrige estos errores para asegurar la integridad de los datos.'));
    } else {
      console.log(styleText('green', '✅ Todos los componentes pasaron la validación con éxito!'));
    }
  }
}

export async function writeReportFile(outputPathArg: string, summary: ValidationSummary): Promise<void> {
  const outputPath = path.resolve(process.cwd(), outputPathArg);
  const metricLines = Object.entries(summary.scannedMetrics).map(([key, val]) => `${key}: ${val}`);

  const lines = [
    `--- ${summary.title.toUpperCase()} ---`,
    ...metricLines,
    `\nErrors (${summary.errors.length}):`,
    ...summary.errors.map(e => `  - ${e}`),
    `\nWarnings (${summary.warnings.length}):`,
    ...summary.warnings.map(w => `  - ${w}`)
  ];

  await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  console.log(styleText('cyan', `\n✨ Reporte completo escrito en: ${outputPathArg}`));
}

/**
 * Parses raw JSON output containing an array, stripping Node.js permission and runtime noise.
 */
export function parseJsonArrayOutput<T = unknown>(
  input: string | unknown[],
  options?: { throwOnError?: boolean; toolName?: string }
): T[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as T[];
  if (typeof input !== 'string') return [];

  const cleanedLines = input
    .split('\n')
    .filter((line) => !line.startsWith('(node:') && !line.startsWith('(Use `node') && !line.includes('SecurityWarning') && !line.startsWith('[PERM') && !line.startsWith('npm notice'));
  const trimmed = cleanedLines.join('\n').trim();
  if (!trimmed) return [];
  const startIdx = trimmed.indexOf('[');
  const endIdx = trimmed.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];

  try {
    return JSON.parse(trimmed.substring(startIdx, endIdx + 1)) as T[];
  } catch (err) {
    if (options?.throwOnError) {
      const toolSuffix = options.toolName ? ` de ${options.toolName}` : '';
      throw new Error(`Error al procesar salida JSON${toolSuffix}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    return [];
  }
}

/**
 * Normalizes any absolute or relative path to a clean POSIX relative path from CWD.
 */
export function normalizePosixPath(filePath: string, cwd: string = process.cwd()): string {
  if (!filePath) return '';
  const resolved = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return resolved.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Parses raw JSON output containing an object, handling stdout strings or execSync error objects.
 */
export function parseJsonObjectOutput<T = Record<string, unknown>>(input: unknown): T | null {
  if (!input) return null;
  let str = '';
  if (typeof input === 'string') {
    str = input;
  } else if (Buffer.isBuffer(input)) {
    str = input.toString('utf-8');
  } else if (typeof input === 'object' && input !== null && 'stdout' in input) {
    const rawStdout = (input as { stdout?: unknown }).stdout;
    if (typeof rawStdout === 'string') {
      str = rawStdout;
    } else if (Buffer.isBuffer(rawStdout)) {
      str = rawStdout.toString('utf-8');
    }
  }

  const jsonStart = str.indexOf('{');
  const jsonEnd = str.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;

  try {
    return JSON.parse(str.substring(jsonStart, jsonEnd + 1)) as T;
  } catch {
    // catch-ok: Ignore parse errors on fallback
    return null;
  }
}

export interface RawLintMessage {
  ruleId?: string;
  message?: string;
  line?: number;
  column?: number;
  fix?: unknown;
}

export interface RawLintFileReport {
  filePath?: string;
  messages?: RawLintMessage[];
  errorCount?: number;
  warningCount?: number;
}

export interface ParseLintFindingsOptions {
  cwd?: string;
  suiteId: string;
  suiteName: string;
  ruleId: string;
  ruleDescription: string;
  defaultRuleName?: string;
  defaultMessage?: string;
}

/**
 * Parses raw JSON output or an array of file reports from standard linters (ESLint, HTML-Validate)
 * into canonical AuditFindings, elevating both warnings and errors to severity: 'error' (Zero-Warning Policy).
 */
export function parseLintResultsToFindings(
  input: string | object[],
  options: ParseLintFindingsOptions
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (!input) return findings;

  const rawList = parseJsonArrayOutput<RawLintFileReport>(input);
  const cwd = options.cwd || process.cwd();

  for (const fileReport of rawList) {
    const cleanFile = normalizePosixPath(fileReport.filePath || '', cwd);
    if (!fileReport.messages || fileReport.messages.length === 0) continue;

    for (const msg of fileReport.messages) {
      const rule = msg.ruleId || options.defaultRuleName || options.ruleId;
      const text = msg.message || options.defaultMessage || 'Lint issue';

      findings.push({
        suiteId: options.suiteId,
        suiteName: options.suiteName,
        ruleId: options.ruleId,
        ruleDescription: options.ruleDescription,
        severity: 'error',
        file: cleanFile,
        line: msg.line || 1,
        context: rule,
        message: `[${rule}] ${text}`,
        fixable: Boolean(msg.fix)
      });
    }
  }

  return findings;
}

/**
 * Extracts scanned file paths from a JSON report containing an array of objects with `filePath`,
 * falling back to finding file paths if JSON parsing fails or output is not an array.
 */
export function extractJsonReportFilePaths(
  rawJson: string,
  fallbackFindings?: readonly { file?: string }[]
): string[] {
  const result: string[] = []; // no-domain: Non-domain utility collection or data structure
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.filePath === 'string') {
          result.push(item.filePath);
        }
      }
      return result;
    }
  } catch {
    // catch-ok: fallback to finding files if JSON is malformed
  }
  if (fallbackFindings) {
    for (const f of fallbackFindings) {
      if (f.file) result.push(f.file);
    }
  }
  return result;
}
