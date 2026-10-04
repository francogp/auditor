/**
 * @file reportUtils.ts
 * @description Utilidades compartidas para formateo de reportes y salida de scripts de validación
 * del proyecto. Evita la duplicación de lógica de generación de archivos de reporte.
 */
import type { AuditFinding } from './auditContract.ts';
export interface ValidationSummary {
    title: string;
    scannedMetrics: Record<string, number>;
    errors: string[];
    warnings: string[];
}
export declare function printConsoleHeader(title: string): void;
export declare const MAX_REPORT_SAMPLE_ITEMS = 30;
export declare function printConsoleSummary(summary: ValidationSummary, verbose?: boolean): void;
export declare function writeReportFile(outputPathArg: string, summary: ValidationSummary): Promise<void>;
/**
 * Parses raw JSON output containing an array, stripping Node.js permission and runtime noise.
 */
export declare function parseJsonArrayOutput<T = unknown>(input: string | unknown[], options?: {
    throwOnError?: boolean;
    toolName?: string;
}): T[];
/**
 * Normalizes any absolute or relative path to a clean POSIX relative path from CWD.
 */
export declare function normalizePosixPath(filePath: string, cwd?: string): string;
/**
 * Parses raw JSON output containing an object, handling stdout strings or execSync error objects.
 */
export declare function parseJsonObjectOutput<T = Record<string, unknown>>(input: unknown): T | null;
export interface RawLintMessage {
    ruleId?: string;
    message?: string;
    line?: number;
    column?: number;
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
export declare function parseLintResultsToFindings(input: string | object[], options: ParseLintFindingsOptions): AuditFinding[];
//# sourceMappingURL=reportUtils.d.ts.map