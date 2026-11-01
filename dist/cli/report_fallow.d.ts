export type FallowCommandRunner = <T = Record<string, unknown>>(command: string, extraArgs?: string[]) => T | null;
export declare function setFallowCommandRunner(runner: FallowCommandRunner | null): void;
export interface FallowCloudReportOptions {
  readonly fallowBin: string;
  readonly subAction: string;
  readonly repo?: string;
  readonly json: boolean;
  readonly human: boolean;
}
export declare function runFallowReportCli(): void;