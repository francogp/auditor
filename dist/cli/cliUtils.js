/**
 * src/cli/cliUtils.ts
 *
 * Shared utilities for CLI tools and entrypoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
/**
 * Checks whether the current module is being executed directly as the CLI entrypoint.
 */
export function isMainModule(metaUrl) {
    const scriptArg = process.argv[1];
    if (!scriptArg || scriptArg.includes('..'))
        return false;
    try {
        const targetPath = path.resolve(fileURLToPath(metaUrl));
        try {
            const realScript = path.resolve(fs.realpathSync(scriptArg));
            return process.platform === 'win32'
                ? realScript.toLowerCase() === targetPath.toLowerCase()
                : realScript === targetPath;
        }
        catch {
            // catch-ok: Fallback to path.resolve if realpath fails
            const resolvedScript = path.resolve(scriptArg);
            return process.platform === 'win32'
                ? resolvedScript.toLowerCase() === targetPath.toLowerCase()
                : resolvedScript === targetPath;
        }
    }
    catch {
        // catch-ok: Fallback when targetPath cannot be parsed
        return false;
    }
}
export const DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
export const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;
/**
 * Runs a Node.js CLI binary with standard permission warning suppressions and returns combined stdout + stderr.
 */
export function executeNodeCli(binPath, args, options) {
    const proc = spawnSync('node', [
        '--disable-warning=PERM0001',
        '--disable-warning=PERM0002',
        '--disable-warning=ExperimentalWarning',
        binPath,
        ...args
    ], {
        cwd: options?.cwd || process.cwd(),
        encoding: 'utf-8',
        maxBuffer: options?.maxBuffer ?? DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
        timeout: options?.timeout ?? DEFAULT_SUBPROCESS_TIMEOUT_MS
    });
    return `${proc.stdout || ''}\n${proc.stderr || ''}`;
}
/**
 * Resolves a binary or script path inside node_modules, searching project root and parent traversals.
 */
export function resolveNodeModuleBin(projectRoot, relativeBinPath) {
    let current = path.resolve(projectRoot);
    for (let i = 0; i < 5; i++) {
        const candidate = path.resolve(current, 'node_modules', relativeBinPath);
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return path.resolve(projectRoot, 'node_modules', relativeBinPath);
}
//# sourceMappingURL=cliUtils.js.map