/**
 * scripts/lib/unifiedTheme.ts
 *
 * UNIFIED CLI & REPORT THEME ENGINE (Node.js 26+)
 * Provides the single source of truth for visual presentation, Unicode Box-Drawing,
 * fixed-width column alignment, status badges, and Markdown generation.
 */
import { type StandardAuditResult, type AuditFinding, type FamilyMetadata, type AuditTaskDefinition } from './auditContract.ts';
export { getVisualWidth, padVisual, truncateVisual, TEXT_ALIGNMENTS, type TextAlignment } from './terminalVisuals.ts';
import { type TextAlignment } from './terminalVisuals.ts';
export interface TableColumn<T = Record<string, unknown>> {
    header: string;
    width: number;
    align?: TextAlignment;
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
export declare const NOTICE_BOX_COLORS: readonly ["yellow", "cyan", "red"];
export type NoticeBoxColor = (typeof NOTICE_BOX_COLORS)[number];
/**
 * Renders a prominent 80-column Box-Drawing warning banner when the automatic
 * installation of Fallow's vector embedding model fails, notifying both human
 * developers and AI agents with the exact command to install it manually.
 */
export declare function renderSimilarCodeWarningBanner(): string;
/**
 * Renders a prominent 80-column Box-Drawing warning banner when fixable errors or warnings
 * are detected at the end of an audit run, directing developers and AI agents to execute
 * `auditor fix` before taking any action or attempting manual suppression.
 */
export declare function renderAutoFixNoticeBanner(fixableErrors: number, fixableWarnings: number): string;
/**
 * Renders the full dynamic registry of auditors in an 80-column Box-Drawing table,
 * grouped by family, with capability flags and concise descriptions.
 */
import type { AuditListFilter } from './auditConfigTypes.ts';
export interface AuditorsRegistryTableOptions {
    readonly filter?: AuditListFilter;
    readonly disabledReasons?: ReadonlyMap<string, string>;
}
export declare function renderAuditorsRegistryTable(tasks: readonly AuditTaskDefinition[], activeFamilies: readonly string[], options?: AuditorsRegistryTableOptions): string;
/**
 * Renders a detailed inspection card for a single auditor suite (≤ 80 cols).
 */
export declare function renderAuditorDetailCard(task: AuditTaskDefinition): string;
/**
 * Renders the CLI general interactive help (≤ 80 cols).
 */
export declare function renderCliHelp(activeFamilies: readonly string[]): string;
export declare function renderFamilyHeader(meta: FamilyMetadata): string;
export declare const AUDIT_BADGE_STATUSES: readonly ["passed", "failed", "warning", "info", "skipped"];
export type AuditBadgeStatus = (typeof AUDIT_BADGE_STATUSES)[number];
export declare function formatStatusBadge(status: AuditBadgeStatus): string;
export declare function formatDuration(ms: number): string;
export declare const COUNT_BADGE_COLORS: readonly ["red", "yellow"];
export type CountBadgeColor = (typeof COUNT_BADGE_COLORS)[number];
export declare const TASK_NAME_COL_WIDTH = 38;
export declare function renderAuditTaskRow(res: StandardAuditResult): string;
export { groupFindingsByFile, formatFindingEntry, renderFindingsDetail } from './fileTreeRenderer.ts';
export { type RenderByFileTreeOptions, renderFindingsByFileTree, formatSampleErrorLine, renderSampleErrors } from './fileTreeRenderer.ts';
export declare function renderConsolidatedFooter(suitesTotal: number, suitesPassed: number, totalErrors: number, totalWarnings: number, totalDurationMs: number, errorFindings?: AuditFinding[], suitesSkipped?: number): string;
export { renderMarkdownReport } from './markdownReport.ts';
//# sourceMappingURL=unifiedTheme.d.ts.map