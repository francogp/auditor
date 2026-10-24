import { RemediationPhaseId } from "../core/remediationPhases.js";
import { AuditFinding } from "../core/auditContract.js";
import { ParsedArgs } from "../core/cli/cittyHarness.js";
type Finding = AuditFinding;
declare const REPORT_FINDINGS_ARGS: {
  readonly phase: {
    readonly type: "string";
    readonly description: "Filter findings by strategic phase (setup, prune, dedup, contracts, behavior, hygiene, polish, next)";
  };
  readonly fase: {
    readonly type: "string";
    readonly description: "Alias for phase";
  };
  readonly category: {
    readonly type: "string";
    readonly alias: "c";
    readonly description: "Filter findings by category";
    readonly default: "all";
  };
  readonly severity: {
    readonly type: "string";
    readonly description: "Filter findings by severity (error, warning, all)";
    readonly default: "all";
  };
  readonly search: {
    readonly type: "string";
    readonly description: "Search string inside finding message or context";
  };
  readonly file: {
    readonly type: "string";
    readonly alias: "f";
    readonly description: "Filter findings matching file path substring or pattern";
  };
  readonly dir: {
    readonly type: "string";
    readonly description: "Filter findings matching directory path";
  };
  readonly folder: {
    readonly type: "string";
    readonly description: "Alias for dir";
  };
  readonly rule: {
    readonly type: "string";
    readonly alias: "r";
    readonly description: "Filter findings matching rule identifier";
  };
  readonly ruleid: {
    readonly type: "string";
    readonly description: "Alias for rule";
  };
  readonly suite: {
    readonly type: "string";
    readonly description: "Filter findings by suite identifier";
  };
  readonly task: {
    readonly type: "string";
    readonly description: "Alias for suite";
  };
  readonly scope: {
    readonly type: "string";
    readonly description: "Target report scope (all, host, packages)";
    readonly default: "all";
  };
  readonly top: {
    readonly type: "string";
    readonly description: "Limit number of displayed findings (number or all)";
    readonly default: "20";
  };
  readonly flat: {
    readonly type: "boolean";
    readonly description: "Emit un-truncated single-line finding dumps";
    readonly default: false;
  };
  readonly raw: {
    readonly type: "boolean";
    readonly description: "Alias for flat";
    readonly default: false;
  };
  readonly 'by-file': {
    readonly type: "boolean";
    readonly description: "Display hierarchical finding tree grouped by file";
    readonly default: false;
  };
  readonly byfile: {
    readonly type: "boolean";
    readonly description: "Alias for by-file";
    readonly default: false;
  };
  readonly 'by-rule': {
    readonly type: "boolean";
    readonly description: "Display finding table grouped by rule";
    readonly default: false;
  };
  readonly byrule: {
    readonly type: "boolean";
    readonly description: "Alias for by-rule";
    readonly default: false;
  };
  readonly rules: {
    readonly type: "boolean";
    readonly description: "Alias for by-rule";
    readonly default: false;
  };
  readonly next: {
    readonly type: "boolean";
    readonly description: "Focus sequentially on findings in the earliest active strategic phase";
    readonly default: false;
  };
  readonly errors: {
    readonly type: "boolean";
    readonly description: "Shortcut for severity=error";
    readonly default: false;
  };
  readonly error: {
    readonly type: "boolean";
    readonly description: "Alias for errors";
    readonly default: false;
  };
  readonly warnings: {
    readonly type: "boolean";
    readonly description: "Shortcut for severity=warning";
    readonly default: false;
  };
  readonly warning: {
    readonly type: "boolean";
    readonly description: "Alias for warnings";
    readonly default: false;
  };
  readonly breakdown: {
    readonly type: "boolean";
    readonly description: "Show directory breakdown";
    readonly default: false;
  };
  readonly summary: {
    readonly type: "boolean";
    readonly description: "Emit summary statistics only";
    readonly default: false;
  };
  readonly 'summary-only': {
    readonly type: "boolean";
    readonly description: "Alias for summary";
    readonly default: false;
  };
  readonly files: {
    readonly type: "boolean";
    readonly description: "Emit list of affected files only";
    readonly default: false;
  };
  readonly 'files-only': {
    readonly type: "boolean";
    readonly description: "Alias for files";
    readonly default: false;
  };
  readonly 'allow-stale': {
    readonly type: "boolean";
    readonly description: "Allow reading stale audit reports";
    readonly default: false;
  };
  readonly stale: {
    readonly type: "boolean";
    readonly description: "Alias for allow-stale";
    readonly default: false;
  };
  readonly 'allow-partial': {
    readonly type: "boolean";
    readonly description: "Allow inspecting partial audit runs";
    readonly default: false;
  };
  readonly partial: {
    readonly type: "boolean";
    readonly description: "Alias for allow-partial";
    readonly default: false;
  };
  readonly fix: {
    readonly type: "boolean";
    readonly description: "Inspect latest fix audit report";
    readonly default: false;
  };
  readonly project: {
    readonly type: "string";
    readonly alias: "p";
    readonly description: "Target host project root directory";
    readonly default: ".";
  };
  readonly human: {
    readonly type: "boolean";
    readonly description: "Enable interactive human Box-Drawing console output";
    readonly default: false;
  };
  readonly verbose: {
    readonly type: "boolean";
    readonly description: "Enable verbose diagnostic output";
    readonly default: false;
  };
  readonly format: {
    readonly type: "string";
    readonly description: "Console output format (compact, human, verbose, json)";
  };
  readonly json: {
    readonly type: "boolean";
    readonly description: "Emit structured JSON output";
    readonly default: false;
  };
  readonly help: {
    readonly type: "boolean";
    readonly alias: "h";
    readonly description: "Display command help manual";
    readonly default: false;
  };
};
type ReportFindingsArgs = ParsedArgs<typeof REPORT_FINDINGS_ARGS>;
export interface ActiveRemediationPhaseResolution {
  readonly phase: RemediationPhaseId;
  readonly errors: number;
  readonly warnings: number;
  readonly postponedCount: number;
  readonly totalErrorsInReport: number;
  readonly totalWarningsInReport: number;
}
export declare function resolveActiveRemediationPhase(allFindings: readonly Finding[]): ActiveRemediationPhaseResolution | null;
export declare function renderActivePhaseFocusBanner(resolution: ActiveRemediationPhaseResolution, isHuman?: boolean): string;
export declare function runReport(inputArgs?: ReportFindingsArgs | readonly string[]): void;
export declare const reportFindingsCommand: import("citty").CommandDef<{
  readonly phase: {
    readonly type: "string";
    readonly description: "Filter findings by strategic phase (setup, prune, dedup, contracts, behavior, hygiene, polish, next)";
  };
  readonly fase: {
    readonly type: "string";
    readonly description: "Alias for phase";
  };
  readonly category: {
    readonly type: "string";
    readonly alias: "c";
    readonly description: "Filter findings by category";
    readonly default: "all";
  };
  readonly severity: {
    readonly type: "string";
    readonly description: "Filter findings by severity (error, warning, all)";
    readonly default: "all";
  };
  readonly search: {
    readonly type: "string";
    readonly description: "Search string inside finding message or context";
  };
  readonly file: {
    readonly type: "string";
    readonly alias: "f";
    readonly description: "Filter findings matching file path substring or pattern";
  };
  readonly dir: {
    readonly type: "string";
    readonly description: "Filter findings matching directory path";
  };
  readonly folder: {
    readonly type: "string";
    readonly description: "Alias for dir";
  };
  readonly rule: {
    readonly type: "string";
    readonly alias: "r";
    readonly description: "Filter findings matching rule identifier";
  };
  readonly ruleid: {
    readonly type: "string";
    readonly description: "Alias for rule";
  };
  readonly suite: {
    readonly type: "string";
    readonly description: "Filter findings by suite identifier";
  };
  readonly task: {
    readonly type: "string";
    readonly description: "Alias for suite";
  };
  readonly scope: {
    readonly type: "string";
    readonly description: "Target report scope (all, host, packages)";
    readonly default: "all";
  };
  readonly top: {
    readonly type: "string";
    readonly description: "Limit number of displayed findings (number or all)";
    readonly default: "20";
  };
  readonly flat: {
    readonly type: "boolean";
    readonly description: "Emit un-truncated single-line finding dumps";
    readonly default: false;
  };
  readonly raw: {
    readonly type: "boolean";
    readonly description: "Alias for flat";
    readonly default: false;
  };
  readonly 'by-file': {
    readonly type: "boolean";
    readonly description: "Display hierarchical finding tree grouped by file";
    readonly default: false;
  };
  readonly byfile: {
    readonly type: "boolean";
    readonly description: "Alias for by-file";
    readonly default: false;
  };
  readonly 'by-rule': {
    readonly type: "boolean";
    readonly description: "Display finding table grouped by rule";
    readonly default: false;
  };
  readonly byrule: {
    readonly type: "boolean";
    readonly description: "Alias for by-rule";
    readonly default: false;
  };
  readonly rules: {
    readonly type: "boolean";
    readonly description: "Alias for by-rule";
    readonly default: false;
  };
  readonly next: {
    readonly type: "boolean";
    readonly description: "Focus sequentially on findings in the earliest active strategic phase";
    readonly default: false;
  };
  readonly errors: {
    readonly type: "boolean";
    readonly description: "Shortcut for severity=error";
    readonly default: false;
  };
  readonly error: {
    readonly type: "boolean";
    readonly description: "Alias for errors";
    readonly default: false;
  };
  readonly warnings: {
    readonly type: "boolean";
    readonly description: "Shortcut for severity=warning";
    readonly default: false;
  };
  readonly warning: {
    readonly type: "boolean";
    readonly description: "Alias for warnings";
    readonly default: false;
  };
  readonly breakdown: {
    readonly type: "boolean";
    readonly description: "Show directory breakdown";
    readonly default: false;
  };
  readonly summary: {
    readonly type: "boolean";
    readonly description: "Emit summary statistics only";
    readonly default: false;
  };
  readonly 'summary-only': {
    readonly type: "boolean";
    readonly description: "Alias for summary";
    readonly default: false;
  };
  readonly files: {
    readonly type: "boolean";
    readonly description: "Emit list of affected files only";
    readonly default: false;
  };
  readonly 'files-only': {
    readonly type: "boolean";
    readonly description: "Alias for files";
    readonly default: false;
  };
  readonly 'allow-stale': {
    readonly type: "boolean";
    readonly description: "Allow reading stale audit reports";
    readonly default: false;
  };
  readonly stale: {
    readonly type: "boolean";
    readonly description: "Alias for allow-stale";
    readonly default: false;
  };
  readonly 'allow-partial': {
    readonly type: "boolean";
    readonly description: "Allow inspecting partial audit runs";
    readonly default: false;
  };
  readonly partial: {
    readonly type: "boolean";
    readonly description: "Alias for allow-partial";
    readonly default: false;
  };
  readonly fix: {
    readonly type: "boolean";
    readonly description: "Inspect latest fix audit report";
    readonly default: false;
  };
  readonly project: {
    readonly type: "string";
    readonly alias: "p";
    readonly description: "Target host project root directory";
    readonly default: ".";
  };
  readonly human: {
    readonly type: "boolean";
    readonly description: "Enable interactive human Box-Drawing console output";
    readonly default: false;
  };
  readonly verbose: {
    readonly type: "boolean";
    readonly description: "Enable verbose diagnostic output";
    readonly default: false;
  };
  readonly format: {
    readonly type: "string";
    readonly description: "Console output format (compact, human, verbose, json)";
  };
  readonly json: {
    readonly type: "boolean";
    readonly description: "Emit structured JSON output";
    readonly default: false;
  };
  readonly help: {
    readonly type: "boolean";
    readonly alias: "h";
    readonly description: "Display command help manual";
    readonly default: false;
  };
}>;
export {};