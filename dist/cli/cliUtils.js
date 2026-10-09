/**
 * src/cli/cliUtils.ts
 *
 * Shared utilities for CLI tools and entrypoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getAuditConfig, sanitizePath } from "../core/auditConfig.js";
import { parseJsonObjectOutput } from "../core/reportUtils.js";
/**
 * Checks whether the current module is being executed directly as the CLI entrypoint.
 */
export function isMainModule(metaUrl) {
    const scriptArg = process.argv[1];
    if (!scriptArg)
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
 * Early Pre-flight CLI Bootstrap:
 * Parses --project=<path>, --project <path>, project=<path>, -p <path>, -p=<path>
 * before any configuration load or sub-auditor discovery.
 * If targeting a remote project, verifies the directory and package.json,
 * records AUDITOR_HOME_DIR and AUDIT_PROJECT_ROOT, and switches process.cwd().
 */
export function bootstrapCliProject(argv = process.argv) {
    let targetCandidate = null;
    const rawHome = process.env.AUDITOR_HOME_DIR || process.cwd();
    const auditorHomeDir = sanitizePath(rawHome);
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg)
            continue;
        if (arg.startsWith('--project=')) {
            targetCandidate = arg.slice('--project='.length);
            break;
        }
        if (arg === '--project' && i + 1 < argv.length) {
            targetCandidate = argv[i + 1] ?? null;
            break;
        }
        if (arg.startsWith('project=')) {
            targetCandidate = arg.slice('project='.length);
            break;
        }
        if (arg === '-p' && i + 1 < argv.length) {
            targetCandidate = argv[i + 1] ?? null;
            break;
        }
        if (arg.startsWith('-p=')) {
            targetCandidate = arg.slice('-p='.length);
            break;
        }
    }
    if (!targetCandidate && process.env.AUDIT_PROJECT_ROOT) {
        targetCandidate = process.env.AUDIT_PROJECT_ROOT;
    }
    if (!targetCandidate) {
        return {
            projectRoot: auditorHomeDir,
            isRemote: false,
            auditorHomeDir
        };
    }
    const cleanCandidate = sanitizePath(targetCandidate);
    const resolved = path.resolve(auditorHomeDir, cleanCandidate);
    if (!fs.existsSync(resolved)) {
        throw new Error(`[Remote Execution Error] Target project directory does not exist: '${resolved}'`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        throw new Error(`[Remote Execution Error] Target project path is not a directory: '${resolved}'`);
    }
    if (!fs.existsSync(path.join(resolved, 'package.json'))) {
        throw new Error(`[Remote Execution Error] Target directory does not contain a package.json: '${resolved}'`);
    }
    process.env.AUDITOR_HOME_DIR = auditorHomeDir;
    process.env.AUDIT_PROJECT_ROOT = resolved;
    const currentResolved = path.resolve(process.cwd());
    const targetResolved = path.resolve(resolved);
    const isRemote = path.resolve(auditorHomeDir) !== targetResolved;
    if (currentResolved !== targetResolved) {
        process.chdir(targetResolved);
    }
    if (argv === process.argv && process.argv.length >= 2) {
        const stripped = stripProjectCliArgs(process.argv.slice(2));
        process.argv = [process.argv[0], process.argv[1], ...stripped];
    }
    return {
        projectRoot: targetResolved,
        isRemote,
        auditorHomeDir
    };
}
/**
 * Strips project-targeting CLI flags (--project, project=, -p) from an argument list.
 */
export function stripProjectCliArgs(argv) {
    const strippedArgs = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg)
            continue;
        if (arg.startsWith('--project=') || arg.startsWith('project=') || arg.startsWith('-p=')) {
            continue;
        }
        if ((arg === '--project' || arg === '-p') && i + 1 < argv.length) {
            i++;
            continue;
        }
        strippedArgs.push(arg);
    }
    return strippedArgs;
}
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
import { createRequire } from 'node:module';
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
    if (process.env.AUDITOR_HOME_DIR) {
        const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
        const homeCandidate = path.resolve(cleanHome, 'node_modules', relativeBinPath);
        if (fs.existsSync(homeCandidate))
            return homeCandidate;
    }
    return path.resolve(projectRoot, 'node_modules', relativeBinPath);
}
function resolveBinFromPackageJson(pkgDir, packageName) {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath))
        return null;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const relBin = typeof pkg.bin === 'string'
            ? pkg.bin
            : (pkg.bin?.[packageName] || (pkg.bin ? Object.values(pkg.bin)[0] : undefined));
        if (typeof relBin === 'string') {
            const binFile = path.resolve(pkgDir, relBin);
            if (fs.existsSync(binFile))
                return binFile;
        }
    }
    catch {
        // catch-ok: ignore invalid json
    }
    return null;
}
/**
 * Resolves the executable binary file of a package, inspecting package.json or createRequire.
 */
export function resolvePackageBin(packageName, options) {
    // Strategy A: try import.meta.resolve(`${packageName}/package.json`)
    try {
        const pkgJsonUrl = import.meta.resolve(`${packageName}/package.json`);
        const pkgJsonPath = fileURLToPath(pkgJsonUrl);
        const fromPkgJson = resolveBinFromPackageJson(path.dirname(pkgJsonPath), packageName);
        if (fromPkgJson)
            return fromPkgJson;
    }
    catch {
        // catch-ok: Fallback to createRequire if package.json is not exported
    }
    // Strategy B: try createRequire to resolve main entry then locate package.json
    const lookupPaths = Array.from(new Set([
        options?.projectRoot,
        process.env.AUDITOR_HOME_DIR,
        process.cwd()
    ].filter((p) => Boolean(p))));
    const req = createRequire(import.meta.url);
    try {
        const mainPath = req.resolve(packageName, {
            paths: lookupPaths.length > 0 ? lookupPaths : undefined
        });
        let dir = path.dirname(mainPath);
        while (dir && !fs.existsSync(path.join(dir, 'package.json'))) {
            const parent = path.dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
        const fromMainDir = resolveBinFromPackageJson(dir, packageName);
        if (fromMainDir)
            return fromMainDir;
    }
    catch {
        // catch-ok: Fallback when createRequire fails
    }
    // Strategy C: fallbackRelativeBin in projectRoot node_modules or AUDITOR_HOME_DIR
    if (options?.fallbackRelativeBin) {
        if (options.projectRoot) {
            const candidate = resolveNodeModuleBin(options.projectRoot, `${packageName}/${options.fallbackRelativeBin}`);
            if (fs.existsSync(candidate))
                return candidate;
        }
        if (process.env.AUDITOR_HOME_DIR) {
            const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
            const homeCandidate = path.resolve(cleanHome, 'node_modules', `${packageName}/${options.fallbackRelativeBin}`);
            if (fs.existsSync(homeCandidate))
                return homeCandidate;
        }
    }
    return null;
}
/**
 * Runs a CLI tool via spawnSync, piping output directly to an isolated ephemeral file descriptor.
 * Completely avoids stdout truncation and in-memory heap spikes.
 */
export function executeCliToFile(command, args, outputFilePath, options) {
    const outFd = fs.openSync(outputFilePath, 'w'); // resource-ok: Primitive numeric file descriptor closed synchronously in finally
    try {
        spawnSync(command, args, {
            cwd: options?.cwd || process.cwd(),
            stdio: ['ignore', outFd, 'pipe'],
            shell: options?.shell ?? true,
            encoding: 'utf-8',
            maxBuffer: options?.maxBuffer ?? DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
            timeout: options?.timeout ?? DEFAULT_SUBPROCESS_TIMEOUT_MS
        });
    }
    finally {
        fs.closeSync(outFd);
    }
}
/**
 * Runs a CLI tool via spawnSync, pipes output to an isolated ephemeral file descriptor,
 * and parses the resulting JSON content cleanly without stdout truncation or heap spikes.
 */
export function executeCliAndReadJson(command, args, outputFilePath, options) {
    executeCliToFile(command, args, outputFilePath, options);
    if (!fs.existsSync(outputFilePath)) {
        return null;
    }
    try {
        const rawContent = fs.readFileSync(outputFilePath, 'utf-8');
        if (rawContent.trim()) {
            return JSON.parse(rawContent); // type-ok: Parsed JSON from ephemeral tool output
        }
    }
    catch (_err) {
        // catch-ok: If output is not JSON, it might be empty or syntax error
        return null;
    }
    return null;
}
/**
  * Resolves coverage CLI arguments for Fallow commands (health, complexity).
  * Discovers configured coverage path or default 'coverage/coverage-final.json'.
  */
export function resolveCoverageArgs(projectRoot = process.cwd()) {
    const config = getAuditConfig();
    const configuredPath = config.fallow?.coverage?.path;
    if (configuredPath && fs.existsSync(path.resolve(projectRoot, configuredPath))) {
        return ['--coverage', path.resolve(projectRoot, configuredPath)];
    }
    const defaultCoveragePath = path.resolve(projectRoot, 'coverage/coverage-final.json');
    if (fs.existsSync(defaultCoveragePath)) {
        return ['--coverage', defaultCoveragePath];
    }
    return [];
}
/**
  * Executes a Fallow sub-command with JSON formatting, returning parsed object payload and exit code.
  */
export function executeFallowJsonCommand(fallowBin, subCommandArgs, projectRoot = process.cwd()) {
    const proc = spawnSync('node', [fallowBin, ...subCommandArgs], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
    });
    const parsed = parseJsonObjectOutput(proc.stdout);
    return {
        parsed,
        status: proc.status ?? 0,
        rawOutput: (proc.stderr || proc.stdout || '').trim()
    };
}
//# sourceMappingURL=cliUtils.js.map