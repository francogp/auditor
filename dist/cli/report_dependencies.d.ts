import { ProjectDependenciesReport } from "../core/auditorMinimums.js";
export interface DependencyReportCliOptions {
  readonly project?: string;
  readonly json: boolean;
  readonly commandsOnly: boolean;
  readonly all: boolean;
  readonly noFail: boolean;
  readonly human?: boolean;
}
export declare function parseCliArgs(rawArgs?: readonly string[]): DependencyReportCliOptions;
export declare function runDependenciesReport(projectRoot?: string, options?: DependencyReportCliOptions): ProjectDependenciesReport;