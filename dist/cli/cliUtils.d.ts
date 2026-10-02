/**
 * src/cli/cliUtils.ts
 *
 * Shared utilities for CLI tools and entrypoints.
 */
/**
 * Checks whether the current module is being executed directly as the CLI entrypoint.
 */
export declare function isMainModule(metaUrl: string): boolean;
export interface ExecuteNodeCliOptions {
    cwd?: string;
    maxBuffer?: number;
    timeout?: number;
}
/**
 * Runs a Node.js CLI binary with standard permission warning suppressions and returns combined stdout + stderr.
 */
export declare function executeNodeCli(binPath: string, args: string[], options?: ExecuteNodeCliOptions): string;
/**
 * Resolves a binary or script path inside node_modules, searching project root and parent traversals.
 */
export declare function resolveNodeModuleBin(projectRoot: string, relativeBinPath: string): string;
//# sourceMappingURL=cliUtils.d.ts.map