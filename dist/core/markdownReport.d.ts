import { StandardAuditResult } from "./auditContract.js";
//#region src/core/markdownReport.d.ts
export declare function renderMarkdownReport(results: StandardAuditResult[], suitesPassed: number, totalDurationMs: number): string;
//#endregion