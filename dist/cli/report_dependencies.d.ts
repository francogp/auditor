import { ProjectDependenciesReport } from "../core/auditorMinimums.js";
//#region src/cli/report_dependencies.d.ts
export interface DependencyReportCliOptions {
  readonly project?: string;
  readonly json: boolean;
  readonly commandsOnly: boolean;
  readonly all: boolean;
  readonly noFail: boolean;
}
export declare function parseCliArgs(rawArgs?: readonly string[]): DependencyReportCliOptions;
export declare function runDependenciesReport(projectRoot?: string, options?: DependencyReportCliOptions): ProjectDependenciesReport;
//#endregion