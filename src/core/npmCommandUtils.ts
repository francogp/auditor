/**
 * src/core/npmCommandUtils.ts
 *
 * CANONICAL VITE+ (vp), NPM & NPX COMMAND UTILITIES (Node.js 26+)
 * Provides shared parsers, package scripts / binaries resolvers, and violation evaluators
 * for both documentation auditors (Markdown) and executable script auditors (Shell, PowerShell, Docker, CI).
 */

import childProcess, { type SpawnSyncReturns, type StdioOptions } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';

import { getPackageJson } from './packageJson.ts';
import { tryOrNull } from './safeUtils.ts';

export const VALID_NPM_BUILTINS: ReadonlySet<string> = new Set([
  'access',
  'adduser',
  'audit',
  'bugs',
  'cache',
  'ci',
  'completion',
  'config',
  'dedupe',
  'deprecate',
  'diff',
  'dist-tag',
  'docs',
  'doctor',
  'edit',
  'empty',
  'exec',
  'explain',
  'explore',
  'find-dupes',
  'fund',
  'get',
  'help',
  'hook',
  'init',
  'install',
  'install-ci-test',
  'install-test',
  'link',
  'll',
  'login',
  'logout',
  'ls',
  'org',
  'outdated',
  'owner',
  'pack',
  'ping',
  'pkg',
  'prefix',
  'profile',
  'prune',
  'publish',
  'rebuild',
  'repo',
  'restart',
  'root',
  'run',
  'run-script',
  'search',
  'set',
  'set-script',
  'shrinkwrap',
  'star',
  'stars',
  'start',
  'stop',
  'team',
  'test',
  'token',
  'uninstall',
  'unpublish',
  'unstar',
  'update',
  'version',
  'view',
  'whoami',
  'info',
  'show',
  'why',
  'query',
  'c',
  'i',
  'r',
  'rb',
  'rm',
  's',
  'se',
  't',
  'tst',
  'up',
  'v'
]);

export const VALID_VP_BUILTINS: ReadonlySet<string> = new Set([
  'dev',
  'build',
  'preview',
  'test',
  'check',
  'lint',
  'fmt',
  'pack',
  'run',
  'exec',
  'dlx',
  'create',
  'migrate',
  'env',
  'toolchain',
  'upgrade',
  'install',
  'add',
  'remove',
  'update',
  'config',
  'help'
]);

export const COMMAND_INVOCATION_TYPES = [
  'npm-run',
  'npm-direct',
  'npx',
  'vp-run',
  'vp-direct',
  'vp-dlx'
] as const;
export type CommandInvocationType = (typeof COMMAND_INVOCATION_TYPES)[number];

export interface ExtractedCommand {
  readonly lineNum: number;
  readonly rawText: string;
  readonly type: CommandInvocationType;
  readonly target: string;
}

export interface NpmCommandValidationEnv {
  readonly scripts: ReadonlySet<string>;
  readonly declaredBins: ReadonlySet<string>;
  readonly installedBins: ReadonlySet<string>;
  readonly allowedNpx: ReadonlySet<string>;
}

const PLACEHOLDER_EXACT_NAMES: ReadonlySet<string> = new Set([
  'xxx',
  'target',
  'name',
  'script',
  'script-name',
  'command',
  'cmd',
  'bin',
  'arg',
  'package-name',
  'paquete'
]);

export function isPlaceholder(token: string): boolean {
  if (!token) return true;
  const t = token.trim();
  return (
    t.startsWith('<') ||
    t.endsWith('>') ||
    t.startsWith('[') ||
    t.endsWith(']') ||
    t.startsWith('{') ||
    t.endsWith('}') ||
    t.startsWith('$') ||
    t.includes('...') ||
    t.includes('${') ||
    t.includes('*') ||
    t.includes('_or_') ||
    t.startsWith('sim_') ||
    t.endsWith(':') ||
    t.includes(':*') ||
    PLACEHOLDER_EXACT_NAMES.has(t)
  );
}

function addPackageDependenciesToBins(
  deps: Record<string, string> | undefined,
  declaredBins: Set<string>
): void {
  for (const dep of Object.keys(deps ?? {})) {
    declaredBins.add(dep);
    if (dep.startsWith('@')) {
      const sub = dep.split('/')[1];
      if (sub) declaredBins.add(sub);
    }
  }
}

function populateBinsFromPackageJson(
  rootDir: string,
  scripts: Set<string>,
  declaredBins: Set<string>
): void {
  const pkg = getPackageJson(rootDir);
  if (!pkg) return;

  if (pkg.scripts) {
    for (const k of Object.keys(pkg.scripts)) scripts.add(k);
  }
  if (typeof pkg.bin === 'string' && pkg.name) {
    const binName = pkg.name.startsWith('@') ? pkg.name.split('/')[1] : pkg.name;
    if (binName) declaredBins.add(binName);
  } else if (pkg.bin && typeof pkg.bin === 'object') {
    for (const k of Object.keys(pkg.bin)) declaredBins.add(k);
  }
  addPackageDependenciesToBins(pkg.dependencies, declaredBins);
  addPackageDependenciesToBins(pkg.devDependencies, declaredBins);
}

function populateInstalledBins(binDir: string, installedBins: Set<string>): void {
  const entries =
    tryOrNull(() => (fsSync.existsSync(binDir) ? fsSync.readdirSync(binDir) : [])) ?? [];
  for (const entry of entries) {
    const cleanName = entry.replace(/\.(cmd|ps1|exe)$/i, '');
    installedBins.add(cleanName);
  }
  installedBins.add('node');
  installedBins.add('npm');
  installedBins.add('npx');
  installedBins.add('git');
  installedBins.add('vp');
  installedBins.add('vpr');
  installedBins.add('vpx');
}

export function loadPackageScriptsAndBins(rootDir: string): {
  scripts: Set<string>;
  declaredBins: Set<string>;
  installedBins: Set<string>;
} {
  const scripts = new Set<string>();
  const declaredBins = new Set<string>();
  const installedBins = new Set<string>();

  populateBinsFromPackageJson(rootDir, scripts, declaredBins);
  populateInstalledBins(path.resolve(rootDir, 'node_modules/.bin'), installedBins);

  return { scripts, declaredBins, installedBins };
}

export const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS = ['env:post-setup', 'env:pre-setup'] as const;
export type KnownOptionalEnvironmentHook = (typeof KNOWN_OPTIONAL_ENVIRONMENT_HOOKS)[number];
export const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET: ReadonlySet<string> = new Set(
  KNOWN_OPTIONAL_ENVIRONMENT_HOOKS
);

export function cleanTarget(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^[([{<"'`]+/, '');
  cleaned = cleaned.replace(/[)\]}>"'`,.:;]+$/, '');
  return cleaned;
}

function extractMatchingCommands(
  regex: RegExp,
  line: string,
  lineNum: number,
  type: CommandInvocationType,
  out: ExtractedCommand[],
  rawText: string,
  filter?: (target: string, match: RegExpExecArray) => boolean
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const rawTarget = match[1]!;
    if (isPlaceholder(rawTarget)) continue;
    const target = cleanTarget(rawTarget);
    if (!target || target.startsWith('-') || isPlaceholder(target)) continue;
    if (filter && !filter(target, match)) continue;

    out.push({
      lineNum,
      rawText,
      type,
      target
    });
  }
}

export const VP_RUN_REGEX = /\b(?:vp\s+run|vpr)\s+([^\s;&|'"`]+)/g;
export const VP_DIRECT_REGEX = /\bvp\s+([^\s;&|'"`]+)/g;
export const VP_DLX_REGEX = /\b(?:vp\s+dlx|vpx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|'"`]+)/g;

export const NPM_RUN_REGEX = /\b(?:npm|pnpm|bun|yarn)\s+run\s+([^\s;&|'"`]+)/g;
export const NPM_DIRECT_REGEX = /\bnpm\s+([^\s;&|'"`]+)/g;
export const NPX_REGEX =
  /\b(?:npx|pnpm\s+dlx|yarn\s+dlx|bunx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|'"`]+)/g;

const VP_IGNORED_DIRECT_COMMANDS: ReadonlySet<string> = new Set(['run', 'dlx', 'exec']); // runtime-set: CLI ignore set
const NPM_IGNORED_DIRECT_COMMANDS: ReadonlySet<string> = new Set(['run']); // runtime-set: CLI ignore set

function isValidDirectCliCommand(
  target: string,
  match: RegExpExecArray,
  line: string,
  ignoredSubcommands: ReadonlySet<string>
): boolean {
  if (ignoredSubcommands.has(target)) return false;
  if (/[=<>&|!]/.test(target)) return false;
  const prefix = line.slice(Math.max(0, match.index - 5), match.index);
  return !/run\s*$/i.test(prefix);
}

/**
 * Extracts Vite+ (vp), npm, and npx invocations from a single line of text.
 */
export function extractCommandsFromLine(
  line: string,
  lineNum: number,
  out: ExtractedCommand[],
  overrideRawText?: string
): void {
  if (!line) return;
  const rawText = overrideRawText ?? line.trim();

  // 1. Invocations of vp run / vpr <target>
  extractMatchingCommands(VP_RUN_REGEX, line, lineNum, 'vp-run', out, rawText);

  // 2. Direct vp <cmd>
  extractMatchingCommands(
    VP_DIRECT_REGEX,
    line,
    lineNum,
    'vp-direct',
    out,
    rawText,
    (target, match) => isValidDirectCliCommand(target, match, line, VP_IGNORED_DIRECT_COMMANDS)
  );

  // 3. Invocations of vp dlx / vpx <bin>
  extractMatchingCommands(VP_DLX_REGEX, line, lineNum, 'vp-dlx', out, rawText);

  // 4. Invocations of npm run / pnpm run / bun run / yarn run <target>
  extractMatchingCommands(NPM_RUN_REGEX, line, lineNum, 'npm-run', out, rawText);

  // 5. Direct npm <cmd> (avoiding false matches when target is 'run' or flags)
  extractMatchingCommands(
    NPM_DIRECT_REGEX,
    line,
    lineNum,
    'npm-direct',
    out,
    rawText,
    (target, match) => isValidDirectCliCommand(target, match, line, NPM_IGNORED_DIRECT_COMMANDS)
  );

  // 6. Invocations of npx <bin>
  extractMatchingCommands(NPX_REGEX, line, lineNum, 'npx', out, rawText);
}

export type GenericCommandViolationKind =
  | 'unregistered-npm'
  | 'invalid-npm-syntax'
  | 'unregistered-npx';

export interface GenericCommandViolation {
  readonly kind: GenericCommandViolationKind;
  readonly message: string;
  readonly context: string;
  readonly line: number;
}

function evaluateBinaryExecution(
  cmd: ExtractedCommand,
  env: NpmCommandValidationEnv,
  runnerName: 'vp dlx / vpx' | 'npx'
): GenericCommandViolation | null {
  const binName = cmd.target.startsWith('@') ? cmd.target.split('/')[1] || cmd.target : cmd.target;
  const isKnownBin =
    env.installedBins.has(binName) ||
    env.declaredBins.has(cmd.target) ||
    env.declaredBins.has(binName) ||
    env.allowedNpx.has(cmd.target) ||
    env.allowedNpx.has(binName);

  if (!isKnownBin) {
    let detail =
      runnerName === 'npx'
        ? `does not exist in node_modules/.bin nor is declared in package.json or allowedNpxBinaries.`
        : `does not exist nor is declared in dependencies.`;

    if (cmd.target === 'vite' && runnerName === 'npx') {
      detail += ` In projects governed by Vite+, use 'vp dev' or 'node_modules/.bin/vite' instead of 'npx vite'.`;
    }

    return {
      kind: 'unregistered-npx',
      message: `Binary '${cmd.target}' executed via ${runnerName} ${detail}`,
      context: cmd.rawText,
      line: cmd.lineNum
    };
  }
  return null;
}

function evaluateVpDirectCommand(
  cmd: ExtractedCommand,
  env: NpmCommandValidationEnv
): GenericCommandViolation | null {
  if (VALID_VP_BUILTINS.has(cmd.target)) return null;
  if (env.scripts.has(cmd.target)) {
    return {
      kind: 'invalid-npm-syntax',
      message: `Incorrect syntax: '${cmd.target}' is a project script, not a native Vite+ command. Use 'vp run ${cmd.target}' or 'vpr ${cmd.target}'.`,
      context: cmd.rawText,
      line: cmd.lineNum
    };
  }
  return {
    kind: 'invalid-npm-syntax',
    message: `'vp ${cmd.target}' is not a native Vite+ command (${Array.from(VALID_VP_BUILTINS).join(', ')}).`,
    context: cmd.rawText,
    line: cmd.lineNum
  };
}

function evaluateNpmDirectCommand(
  cmd: ExtractedCommand,
  env: NpmCommandValidationEnv
): GenericCommandViolation | null {
  if (VALID_NPM_BUILTINS.has(cmd.target)) {
    if (cmd.target === 'test' && !env.scripts.has('test')) {
      return {
        kind: 'unregistered-npm',
        message: `Command 'npm test' requires a 'test' script in package.json.`,
        context: cmd.rawText,
        line: cmd.lineNum
      };
    }
    return null;
  }
  if (env.scripts.has(cmd.target)) {
    return {
      kind: 'invalid-npm-syntax',
      message: `Incorrect syntax: executed 'npm ${cmd.target}', but must be 'npm run ${cmd.target}'.`,
      context: cmd.rawText,
      line: cmd.lineNum
    };
  }
  return {
    kind: 'invalid-npm-syntax',
    message: `'npm ${cmd.target}' is not a native npm command nor a registered script.`,
    context: cmd.rawText,
    line: cmd.lineNum
  };
}

export function evaluateGenericCommandViolation(
  cmd: ExtractedCommand,
  env: NpmCommandValidationEnv
): GenericCommandViolation | null {
  if (isPlaceholder(cmd.target)) return null;

  switch (cmd.type) {
    case 'vp-run':
      if (env.scripts.has(cmd.target) || KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET.has(cmd.target))
        return null;
      return {
        kind: 'unregistered-npm',
        message: `Command 'vp run ${cmd.target}' (or 'vpr ${cmd.target}') is not registered in package.json.scripts or run.tasks.`,
        context: cmd.rawText,
        line: cmd.lineNum
      };

    case 'vp-direct':
      return evaluateVpDirectCommand(cmd, env);

    case 'vp-dlx':
      return evaluateBinaryExecution(cmd, env, 'vp dlx / vpx');

    case 'npm-run':
      if (env.scripts.has(cmd.target) || KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET.has(cmd.target))
        return null;
      return {
        kind: 'unregistered-npm',
        message: `Command 'npm run ${cmd.target}' is not registered in package.json.scripts.`,
        context: cmd.rawText,
        line: cmd.lineNum
      };

    case 'npm-direct':
      return evaluateNpmDirectCommand(cmd, env);

    case 'npx':
      return evaluateBinaryExecution(cmd, env, 'npx');

    default:
      return null;
  }
}

export interface NpmCommandSpec {
  readonly binary: string;
  readonly shell: boolean;
}

/**
 * Resolves the platform-specific npm executable and shell requirement.
 * On Windows, npm is a batch script ('npm.cmd'). Node.js spawnSync requires 'npm.cmd'
 * with shell: true to prevent EINVAL (CVE-2024-27980 mitigation) or ENOENT errors.
 */
export function getNpmCommand(): NpmCommandSpec {
  const isWindows = process.platform === 'win32';
  return {
    binary: isWindows ? 'npm.cmd' : 'npm',
    shell: isWindows
  };
}

export interface RunNpmCommandOptions {
  readonly cwd?: string;
  readonly stdio?: StdioOptions;
  readonly encoding?: BufferEncoding;
  readonly timeout?: number;
  readonly maxBuffer?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Standardized cross-platform synchronous execution of npm commands.
 * Automatically resolves 'npm.cmd' and 'shell: true' on Windows.
 */
export function runNpmCommandSync(
  args: readonly string[],
  options: RunNpmCommandOptions = {}
): SpawnSyncReturns<string> {
  const { binary, shell } = getNpmCommand();
  return childProcess.spawnSync(binary, [...args], {
    cwd: options.cwd ?? process.cwd(),
    stdio: options.stdio ?? 'pipe',
    encoding: options.encoding ?? 'utf-8',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    shell,
    env: options.env ?? process.env
  });
}
