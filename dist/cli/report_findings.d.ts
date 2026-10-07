#!/usr/bin/env -S node --experimental-strip-types
export declare const SEVERITY_FILTERS: readonly ["all", "error", "warning"];
export type SeverityFilter = (typeof SEVERITY_FILTERS)[number];
export declare const REPORT_SCOPES: readonly ["all", "host", "packages"];
export type ReportScope = (typeof REPORT_SCOPES)[number];
export declare function runReport(): void;
//# sourceMappingURL=report_findings.d.ts.map