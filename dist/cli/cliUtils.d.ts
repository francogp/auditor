/**
 * src/cli/cliUtils.ts
 *
 * Shared utilities for CLI tools and entrypoints.
 */
/**
 * Checks whether the current module is being executed directly as the CLI entrypoint.
 */
export declare function isMainModule(metaUrl: string): boolean;
export declare const DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES: number;
export declare const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
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
/**
 * Resolves the executable binary file of a package, inspecting package.json or createRequire.
 */
export declare function resolvePackageBin(packageName: string, options?: {
    projectRoot?: string;
    fallbackRelativeBin?: string;
}): string | null;
export interface ExecuteCliToFileOptions {
    cwd?: string;
    maxBuffer?: number;
    shell?: boolean;
    timeout?: number;
}
/**
 * Runs a CLI tool via spawnSync, piping output directly to an isolated ephemeral file descriptor.
 * Completely avoids stdout truncation and in-memory heap spikes.
 */
export declare function executeCliToFile(command: string, args: string[], outputFilePath: string, options?: ExecuteCliToFileOptions): void;
/**
 * Runs a CLI tool via spawnSync, pipes output to an isolated ephemeral file descriptor,
 * and parses the resulting JSON content cleanly without stdout truncation or heap spikes.
 */
export declare function executeCliAndReadJson<T>(command: string, args: string[], outputFilePath: string, options?: ExecuteCliToFileOptions): T | null;
//# sourceMappingURL=cliUtils.d.ts.map