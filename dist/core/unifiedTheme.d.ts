/**
 * scripts/lib/unifiedTheme.ts
 *
 * UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
 * Provides the single source of truth for visual presentation, Unicode Box-Drawing,
 * fixed-width column alignment, status badges, and Markdown generation.
 */
import { type StandardAuditResult, type AuditFinding, type FamilyMetadata } from './auditContract.ts';
/**
 * Calculates the visual monospace terminal display width of a string,
 * correctly handling ANSI escapes, wide emojis (❌, ✅, ⚠️, ℹ️), and single-width glyphs (…).
 */
export declare function getVisualWidth(str: string): number;
export declare function padVisual(str: string, targetWidth: number, align?: 'left' | 'right' | 'center'): string;
export declare function truncateVisual(str: string, maxWidth: number): string;
export interface TableColumn<T = Record<string, unknown>> {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
    key?: string;
    render?: (row: T) => string;
}
export declare function renderBoxTable<T = Record<string, unknown>>(columns: readonly TableColumn<T>[], rows: readonly T[], options?: {
    emptyMessage?: string;
    footerRows?: readonly T[];
}): string;
export interface FindingCountData {
    errors: number;
    warnings: number;
}
export declare function renderFindingsBreakdownTable(items: readonly [string, FindingCountData][], labelHeader?: string): string;
export declare function renderSampleFindings(findings: readonly AuditFinding[], limitOrAll?: number | 'all'): string;
export declare function renderBanner(title: string, subtitle?: string): string;
/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export declare function renderSimilarCodeWarningBanner(): string;
export declare function renderFamilyHeader(meta: FamilyMetadata): string;
export declare function formatStatusBadge(status: 'passed' | 'failed' | 'warning' | 'info'): string;
export declare function formatDuration(ms: number): string;
export declare function renderAuditTaskRow(res: StandardAuditResult): string;
export declare function renderFindingsDetail(findings: AuditFinding[], maxLimit?: number): string;
export declare function renderConsolidatedFooter(suitesTotal: number, suitesPassed: number, totalErrors: number, totalWarnings: number, totalDurationMs: number, errorFindings?: AuditFinding[]): string;
export declare function renderMarkdownReport(results: StandardAuditResult[], suitesPassed: number, totalDurationMs: number): string;
//# sourceMappingURL=unifiedTheme.d.ts.map