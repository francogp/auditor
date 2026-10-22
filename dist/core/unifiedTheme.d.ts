import { AuditListFilter } from "./auditConfigTypes.js";
import { RemediationPhaseId } from "./remediationPhases.js";
import { AuditFinding, AuditTaskDefinition, FamilyMetadata, StandardAuditResult } from "./auditContract.js";
import { TEXT_ALIGNMENTS, TextAlignment, padVisual, stringWidth, truncateVisual } from "./terminalVisuals.js";
import { DURATION_PAD_LENGTH, formatDuration, formatDurationMs, formatNumber } from "./durationFormatter.js";
import { RenderByFileTreeOptions, formatFindingEntry, formatSampleErrorLine, groupFindingsByFile, renderFindingsByFileTree, renderFindingsDetail, renderSampleErrors } from "./fileTreeRenderer.js";
import { renderMarkdownReport } from "./markdownReport.js";
import { ExecutiveFailPhaseBreakdown, ExecutiveFailSummaryParams, ExecutiveFixSummaryParams, ExecutivePassSummaryParams, ExecutiveSetupBlockingSummaryParams, extractPhaseBreakdown, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary } from "./executiveTheme.js";
//#region src/core/unifiedTheme.d.ts
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
export interface TieredFindingsPhaseGroup {
  readonly phaseId: RemediationPhaseId;
  readonly items: readonly [string, FindingCountData][];
  readonly errors: number;
  readonly warnings: number;
}
export declare function renderTieredFindingsBreakdownTable(groups: readonly TieredFindingsPhaseGroup[], labelHeader?: string): string;
export declare function renderSampleFindings(findings: readonly AuditFinding[], limitOrAll?: number | 'all', options?: {
  readonly title?: string;
}): string;
export declare const NOTICE_BOX_COLORS: readonly ["yellow", "cyan", "red", "green", "magenta", "blue"];
export type NoticeBoxColor = (typeof NOTICE_BOX_COLORS)[number];
export declare function renderBanner(title: string, subtitle?: string, borderColor?: NoticeBoxColor): string;
export interface NoticeBoxOptions {
  borderColor?: NoticeBoxColor;
  title: string;
  lines: string[];
}
export declare function buildNoticeBox(options: NoticeBoxOptions): string;
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
 * Renders a prominent 80-column Box-Drawing notice box when an auto-fix run (`auditor fix`)
 * completes, informing developers and AI coding agents that auto-repairs were applied and
 * explicitly instructing them to run the full auditor (`npm run auditor`) to inspect findings
 * and continue working, without displaying intermediate partial error counts or conclusions.
 */
export declare function renderAutoFixCompletionBanner(totalDurationMs?: number): string;
export interface SetupBlockingActionHints {
  readonly hasLockfileMismatch?: boolean;
  readonly hasEngineMismatch?: boolean;
  readonly hasFixableErrors?: boolean;
}
/**
 * Renders a prominent Box-Drawing critical blocking banner when setup-phase errors exist,
 * mandating that project infrastructure, configurations, dependencies, and scripts
 * must be resolved first before application code or stylesheets.
 */
export declare function renderSetupBlockingBanner(setupErrors: number, postponedAppErrors: number, hints?: SetupBlockingActionHints): string;
export interface AuditorsRegistryTableOptions {
  readonly filter?: AuditListFilter;
  readonly disabledReasons?: ReadonlyMap<string, string>;
}
export declare function renderAuditorsRegistryTable(tasks: readonly AuditTaskDefinition[], activeFamilies: readonly string[], options?: AuditorsRegistryTableOptions): string;
export declare const themeStyles: {
  boldWhite: (s: string) => string;
  boldYellow: (s: string) => string;
  boldCyan: (s: string) => string;
  dim: (s: string) => string;
  white: (s: string) => string;
};
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
export declare const COUNT_BADGE_COLORS: readonly ["red", "yellow"];
export type CountBadgeColor = (typeof COUNT_BADGE_COLORS)[number];
export declare const TASK_NAME_COL_WIDTH = 38;
export declare function renderAuditTaskRow(res: StandardAuditResult): string;
export declare function renderConsolidatedFooter(suitesTotal: number, suitesPassed: number, totalErrors: number, totalWarnings: number, totalDurationMs: number, errorFindings?: AuditFinding[], suitesSkipped?: number): string;
//#endregion
export { DURATION_PAD_LENGTH, type ExecutiveFailPhaseBreakdown, type ExecutiveFailSummaryParams, type ExecutiveFixSummaryParams, type ExecutivePassSummaryParams, type ExecutiveSetupBlockingSummaryParams, type RenderByFileTreeOptions, TEXT_ALIGNMENTS, type TextAlignment, extractPhaseBreakdown, formatDuration, formatDurationMs, formatFindingEntry, formatNumber, formatSampleErrorLine, groupFindingsByFile, padVisual, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary, renderFindingsByFileTree, renderFindingsDetail, renderMarkdownReport, renderSampleErrors, stringWidth, truncateVisual };