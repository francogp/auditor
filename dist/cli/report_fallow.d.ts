export type FallowCommandRunner = <T = Record<string, unknown>>(command: string, extraArgs?: string[]) => T | null;
export declare function setFallowCommandRunner(runner: FallowCommandRunner | null): void;
export declare function runFallowReportCli(): void;