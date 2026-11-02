import { ConfigAdvisorReport } from "../core/configAdvisor.js";
export interface ConfigAdvisorCliOptions {
  readonly project?: string;
  readonly json: boolean;
  readonly diff: boolean;
  readonly apply: boolean;
  readonly subsystem?: string;
  readonly human?: boolean;
  readonly help?: boolean;
}
export declare function parseCliArgs(rawArgs?: readonly string[]): ConfigAdvisorCliOptions;
export declare function runConfigAdvisor(projectRoot?: string, options?: ConfigAdvisorCliOptions): Promise<ConfigAdvisorReport>;