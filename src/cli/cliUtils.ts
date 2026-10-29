/**
 * src/cli/cliUtils.ts
 *
 * Shared utilities for CLI tools and entrypoints.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getAuditConfig, sanitizePath } from '../core/auditConfig.ts';
import { parseJsonObjectOutput } from '../core/reportUtils.ts';
import { safeReadFileSync, safeJsonParse, tryOrNull, tryOrDefault } from '../core/safeUtils.ts';

/**
 * Checks whether the current module is being executed directly as the CLI entrypoint.
 */
export function isMainModule(metaUrl: string, binaryAliases?: readonly string[]): boolean {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;

  return tryOrDefault(() => {
    const targetPath = path.resolve(fileURLToPath(metaUrl));
    const realScript = tryOrDefault(
      () => path.resolve(fs.realpathSync(scriptArg)),
      path.resolve(scriptArg)
    );
    const isExact =
      process.platform === 'win32'
        ? realScript.toLowerCase() === targetPath.toLowerCase()
        : realScript === targetPath;
    if (isExact) return true;

    // Check base name without extension (supports .ts vs .js runtime variance)
    const targetBase = path.basename(targetPath, path.extname(targetPath));
    const scriptBase = path.basename(realScript, path.extname(realScript));
    if (targetBase.toLowerCase() === scriptBase.toLowerCase()) return true;

    if (
      binaryAliases &&
      binaryAliases.some((alias) => scriptBase.toLowerCase() === alias.toLowerCase())
    ) {
      return true;
    }
    return false;
  }, false);
}

export const DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
export const DEFAULT_SUBPROCESS_TIMEOUT_MS = 0;

export interface CliBootstrapResult {
  readonly projectRoot: string;
  readonly isRemote: boolean;
  readonly auditorHomeDir: string;
}

/**
 * Early Pre-flight CLI Bootstrap:
 * Parses --project=<path>, --project <path>, project=<path>, -p <path>, -p=<path>
 * before any configuration load or sub-auditor discovery.
 * If targeting a remote project, verifies the directory and package.json,
 * records AUDITOR_HOME_DIR and AUDIT_PROJECT_ROOT, and switches process.cwd().
 */
export function bootstrapCliProject(argv: readonly string[] = process.argv): CliBootstrapResult {
  let targetCandidate: string | null = null;
  const rawHome = process.env.AUDITOR_HOME_DIR || process.cwd();
  const auditorHomeDir = sanitizePath(rawHome);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

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
    throw new Error(
      `[Remote Execution Error] Target project directory does not exist: '${resolved}'`
    );
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(
      `[Remote Execution Error] Target project path is not a directory: '${resolved}'`
    );
  }
  if (!fs.existsSync(path.join(resolved, 'package.json'))) {
    throw new Error(
      `[Remote Execution Error] Target directory does not contain a package.json: '${resolved}'`
    );
  }

  process.env.AUDITOR_HOME_DIR = auditorHomeDir;
  process.env.AUDIT_PROJECT_ROOT = resolved;

  const currentResolved = path.resolve(process.cwd());
  const targetResolved = path.resolve(resolved);
  const isRemote = path.resolve(auditorHomeDir) !== targetResolved;

  if (currentResolved !== targetResolved) {
    tryOrNull(() => process.chdir(targetResolved));
  }

  if (argv === process.argv && process.argv.length >= 2) {
    const stripped = stripProjectCliArgs(process.argv.slice(2));
    process.argv = [process.argv[0]!, process.argv[1]!, ...stripped];
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
export function stripProjectCliArgs(argv: readonly string[]): string[] {
  const strippedArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
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

/** Canonical flags indicating user requested human console output. */
export const HUMAN_CONSOLE_FLAGS: ReadonlySet<string> = new Set([
  'human',
  '--human',
  'format=human',
  'verbose',
  '--verbose',
  'format=verbose'
]); // runtime-set: Fast O(1) human flags lookup

export interface HumanConsoleOptions {
  human?: boolean;
  verbose?: boolean;
  format?: string;
}

/**
 * Resolves whether the current invocation requested human Box-Drawing output.
 */
export function isHumanConsoleMode(
  options?: HumanConsoleOptions,
  argv: readonly string[] = process.argv
): boolean {
  if (
    options?.human === true ||
    options?.verbose === true ||
    options?.format === 'human' ||
    options?.format === 'verbose'
  ) {
    return true;
  }
  return argv.some((arg) => HUMAN_CONSOLE_FLAGS.has(arg));
}

export interface ExecuteNodeCliOptions {
  cwd?: string;
  maxBuffer?: number;
  timeout?: number;
}

/**
 * Runs a Node.js CLI binary with standard permission warning suppressions and returns combined stdout + stderr.
 */
export function executeNodeCli(
  binPath: string,
  args: string[],
  options?: ExecuteNodeCliOptions
): string {
  const proc = spawnSync(
    'node',
    [
      '--disable-warning=PERM0001',
      '--disable-warning=PERM0002',
      '--disable-warning=ExperimentalWarning',
      binPath,
      ...args
    ],
    {
      cwd: options?.cwd || process.cwd(),
      encoding: 'utf-8',
      maxBuffer: options?.maxBuffer ?? DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
      timeout: options?.timeout ?? DEFAULT_SUBPROCESS_TIMEOUT_MS
    }
  );
  return `${proc.stdout || ''}\n${proc.stderr || ''}`;
}

import { createRequire } from 'node:module';

/**
 * Resolves a binary or script path inside node_modules, searching project root and parent traversals.
 */
export function resolveNodeModuleBin(projectRoot: string, relativeBinPath: string): string {
  let current = path.resolve(projectRoot);
  for (let i = 0; i < 5; i++) {
    const candidate = path.resolve(current, 'node_modules', relativeBinPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (process.env.AUDITOR_HOME_DIR) {
    const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
    const homeCandidate = path.resolve(cleanHome, 'node_modules', relativeBinPath);
    if (fs.existsSync(homeCandidate)) return homeCandidate;
  }
  return path.resolve(projectRoot, 'node_modules', relativeBinPath);
}

function resolveBinFromPackageJson(pkgDir: string, packageName: string): string | null {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return null;
  const raw = safeReadFileSync(pkgJsonPath);
  if (!raw) return null;
  const pkg = safeJsonParse<{ bin?: string | Record<string, string> }>(raw);
  if (!pkg) return null;
  const relBin =
    typeof pkg.bin === 'string'
      ? pkg.bin
      : pkg.bin?.[packageName] || (pkg.bin ? Object.values(pkg.bin)[0] : undefined);
  if (typeof relBin === 'string') {
    const binFile = path.resolve(pkgDir, relBin);
    if (fs.existsSync(binFile)) return binFile;
  }
  return null;
}

/**
 * Resolves the executable binary file of a package, inspecting package.json or createRequire.
 */
export function resolvePackageBin(
  packageName: string,
  options?: { projectRoot?: string; fallbackRelativeBin?: string }
): string | null {
  // Strategy A: try import.meta.resolve(`${packageName}/package.json`)
  const fromPkgJson = tryOrNull(() => {
    const pkgJsonUrl = import.meta.resolve(`${packageName}/package.json`);
    const pkgJsonPath = fileURLToPath(pkgJsonUrl);
    return resolveBinFromPackageJson(path.dirname(pkgJsonPath), packageName);
  });
  if (fromPkgJson) return fromPkgJson;

  // Strategy B: try createRequire to resolve main entry then locate package.json
  const lookupPaths = Array.from(
    new Set(
      [options?.projectRoot, process.env.AUDITOR_HOME_DIR, process.cwd()].filter((p): p is string =>
        Boolean(p)
      )
    )
  );

  const req = createRequire(import.meta.url);
  const fromMainDir = tryOrNull(() => {
    const mainPath = req.resolve(packageName, {
      paths: lookupPaths.length > 0 ? lookupPaths : undefined
    });
    let dir = path.dirname(mainPath);
    while (dir && !fs.existsSync(path.join(dir, 'package.json'))) {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return resolveBinFromPackageJson(dir, packageName);
  });
  if (fromMainDir) return fromMainDir;

  // Strategy C: fallbackRelativeBin in projectRoot node_modules or AUDITOR_HOME_DIR
  if (options?.fallbackRelativeBin) {
    if (options.projectRoot) {
      const candidate = resolveNodeModuleBin(
        options.projectRoot,
        path.join(packageName, options.fallbackRelativeBin)
      );
      if (fs.existsSync(candidate)) return candidate;
    }
    if (process.env.AUDITOR_HOME_DIR) {
      const cleanHome = sanitizePath(process.env.AUDITOR_HOME_DIR);
      const homeCandidate = path.resolve(
        cleanHome,
        'node_modules',
        packageName,
        options.fallbackRelativeBin
      );
      if (fs.existsSync(homeCandidate)) return homeCandidate;
    }
  }

  return null;
}

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
export function executeCliToFile(
  command: string,
  args: string[],
  outputFilePath: string,
  options?: ExecuteCliToFileOptions
): void {
  const outFd = fs.openSync(outputFilePath, 'w');
  const needsShell =
    options?.shell ?? (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command));
  try {
    spawnSync(command, args, {
      cwd: options?.cwd || process.cwd(),
      stdio: ['ignore', outFd, 'pipe'],
      shell: needsShell,
      encoding: 'utf-8',
      maxBuffer: options?.maxBuffer ?? DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
      timeout: options?.timeout ?? DEFAULT_SUBPROCESS_TIMEOUT_MS
    });
  } finally {
    fs.closeSync(outFd);
  }
}

/**
 * Runs a CLI tool via spawnSync, pipes output to an isolated ephemeral file descriptor,
 * and parses the resulting JSON content cleanly without stdout truncation or heap spikes.
 */
export function executeCliAndReadJson<T>(
  command: string,
  args: string[],
  outputFilePath: string,
  options?: ExecuteCliToFileOptions
): T | null {
  executeCliToFile(command, args, outputFilePath, options);

  if (!fs.existsSync(outputFilePath)) {
    return null;
  }

  const rawContent = safeReadFileSync(outputFilePath);
  if (rawContent && rawContent.trim()) {
    return safeJsonParse<T>(rawContent) ?? null;
  }
  return null;
}

/**
 * Resolves coverage CLI arguments for Fallow commands (health, complexity).
 * Discovers configured coverage path or default 'coverage/coverage-final.json'.
 */
export function resolveCoverageArgs(projectRoot: string = process.cwd()): string[] {
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

export interface FallowExecutionResult<T> {
  readonly parsed: T | null;
  readonly status: number;
  readonly rawOutput: string;
}

/**
 * Executes a Fallow sub-command with JSON formatting, returning parsed object payload and exit code.
 */
export function executeFallowJsonCommand<T = Record<string, unknown>>(
  fallowBin: string,
  subCommandArgs: readonly string[],
  projectRoot: string = process.cwd()
): FallowExecutionResult<T> {
  const proc = spawnSync('node', [fallowBin, ...subCommandArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const parsed = parseJsonObjectOutput<T>(proc.stdout);
  return {
    parsed,
    status: proc.status ?? 0,
    rawOutput: (proc.stderr || proc.stdout || '').trim()
  };
}
