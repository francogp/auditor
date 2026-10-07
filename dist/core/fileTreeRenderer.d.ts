/**
 * packages/auditor/src/core/fileTreeRenderer.ts
 *
 * Renders audit findings structured by file and ordered by line number
 * in a hierarchical Box-Drawing tree format.
 */
import { type AuditFinding, type AuditFileSummary } from './auditContract.ts';
export declare function groupFindingsByFile(findings: readonly AuditFinding[]): Map<string, AuditFinding[]>;
export declare function formatFindingEntry(item: AuditFinding): string;
export declare function renderFindingsDetail(findings: AuditFinding[], maxLimit?: number): string;
export interface RenderByFileTreeOptions {
    maxFiles?: number | 'all';
    maxFindingsPerFile?: number | 'all';
    showRule?: boolean;
}
/**
 * Renders audit findings structured by file and ordered by line number in a Box-Drawing tree format.
 */
export declare function renderFindingsByFileTree(fileSummaries: readonly AuditFileSummary[], options?: RenderByFileTreeOptions): string;
export declare function formatSampleErrorLine(err: AuditFinding, index: number): string;
export declare function renderSampleErrors(errorFindings: readonly AuditFinding[]): string[];
//# sourceMappingURL=fileTreeRenderer.d.ts.map