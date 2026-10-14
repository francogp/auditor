/**
 * src/core/npmCommandUtils.ts
 *
 * CANONICAL NPM & NPX COMMAND UTILITIES (Node.js 26+)
 * Provides shared parsers, package scripts / binaries resolvers, and violation evaluators
 * for both documentation auditors (Markdown) and executable script auditors (Shell, PowerShell, Docker, CI).
 */

import fsSync from 'node:fs';
import path from 'node:path';
import { getPackageJson } from './packageJson.ts';

export const VALID_NPM_BUILTINS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  'access', 'adduser', 'audit', 'bugs', 'cache', 'ci', 'completion',
  'config', 'dedupe', 'deprecate', 'diff', 'dist-tag', 'docs', 'doctor',
  'edit', 'empty', 'exec', 'explain', 'explore', 'find-dupes', 'fund',
  'get', 'help', 'hook', 'init', 'install', 'install-ci-test', 'install-test',
  'link', 'll', 'login', 'logout', 'ls', 'org', 'outdated', 'owner',
  'pack', 'ping', 'pkg', 'prefix', 'profile', 'prune', 'publish', 'rebuild',
  'repo', 'restart', 'root', 'run', 'run-script', 'search', 'set', 'set-script',
  'shrinkwrap', 'star', 'stars', 'start', 'stop', 'team', 'test', 'token',
  'uninstall', 'unpublish', 'unstar', 'update', 'version', 'view', 'whoami',
  'info', 'show', 'why', 'query',
  // short aliases:
  'c', 'i', 'r', 'rb', 'rm', 's', 'se', 't', 'tst', 'up', 'v'
]);

export const COMMAND_INVOCATION_TYPES = ['npm-run', 'npm-direct', 'npx'] as const;
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
    t === 'xxx' ||
    t === 'target' ||
    t === 'name' ||
    t === 'script' ||
    t === 'script-name' ||
    t === 'command' ||
    t === 'cmd' ||
    t === 'bin' ||
    t === 'arg' ||
    t === 'package-name' ||
    t === 'paquete'
  );
}

function addPackageDependenciesToBins(deps: Record<string, string> | undefined, declaredBins: Set<string>): void {
  for (const dep of Object.keys(deps ?? {})) {
    declaredBins.add(dep);
    if (dep.startsWith('@')) {
      const sub = dep.split('/')[1];
      if (sub) declaredBins.add(sub);
    }
  }
}

function populateBinsFromPackageJson(rootDir: string, scripts: Set<string>, declaredBins: Set<string>): void {
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
  try {
    if (fsSync.existsSync(binDir)) {
      for (const entry of fsSync.readdirSync(binDir)) {
        const cleanName = entry.replace(/\.(cmd|ps1|exe)$/i, '');
        installedBins.add(cleanName);
      }
    }
  } catch {
    // catch-ok: Unreadable node_modules/.bin directory
  }
  installedBins.add('node');
  installedBins.add('npm');
  installedBins.add('npx');
  installedBins.add('git');
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

export const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS = [
  'env:post-setup',
  'env:pre-setup'
] as const;
export type KnownOptionalEnvironmentHook = (typeof KNOWN_OPTIONAL_ENVIRONMENT_HOOKS)[number];
export const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET: ReadonlySet<string> = new Set(KNOWN_OPTIONAL_ENVIRONMENT_HOOKS); // runtime-set: Fast O(1) membership lookup set

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

export const NPM_RUN_REGEX = /\b(?:npm|pnpm|bun|yarn)\s+run\s+([^\s;&|'"`]+)/g;
export const NPM_DIRECT_REGEX = /\bnpm\s+([^\s;&|'"`]+)/g;
export const NPX_REGEX = /\b(?:npx|pnpm\s+dlx|yarn\s+dlx|bunx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|'"`]+)/g;

/**
 * Extracts npm and npx invocations from a single line of text (used in documentation code blocks).
 */
export function extractCommandsFromLine(
  line: string,
  lineNum: number,
  out: ExtractedCommand[],
  overrideRawText?: string
): void {
  if (!line) return;
  const rawText = overrideRawText ?? line.trim();

  // 1. Invocations of npm run / pnpm run / bun run / yarn run <target>
  extractMatchingCommands(NPM_RUN_REGEX, line, lineNum, 'npm-run', out, rawText);

  // 2. Direct npm <cmd> (avoiding false matches when target is 'run' or flags)
  extractMatchingCommands(NPM_DIRECT_REGEX, line, lineNum, 'npm-direct', out, rawText, (target, match) => {
    if (target === 'run') return false;
    if (/[=<>&|!]/.test(target)) return false;
    const prefix = line.slice(Math.max(0, match.index - 5), match.index);
    return !/run\s*$/i.test(prefix);
  });

  // 3. Invocations of npx <bin>
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

export function evaluateGenericCommandViolation(
  cmd: ExtractedCommand,
  env: NpmCommandValidationEnv
): GenericCommandViolation | null {
  if (isPlaceholder(cmd.target)) return null;

  if (cmd.type === 'npm-run') {
    if (env.scripts.has(cmd.target)) return null;
    if (KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET.has(cmd.target)) return null;
    return {
      kind: 'unregistered-npm',
      message: `El comando 'npm run ${cmd.target}' no está registrado en package.json.scripts.`,
      context: cmd.rawText,
      line: cmd.lineNum
    };
  }

  if (cmd.type === 'npm-direct') {
    if (VALID_NPM_BUILTINS.has(cmd.target)) {
      if (cmd.target === 'test' && !env.scripts.has('test')) {
        return {
          kind: 'unregistered-npm',
          message: `El comando 'npm test' requiere un script 'test' en package.json.`,
          context: cmd.rawText,
          line: cmd.lineNum
        };
      }
      return null;
    }

    if (env.scripts.has(cmd.target)) {
      return {
        kind: 'invalid-npm-syntax',
        message: `Sintaxis incorrecta: se ejecutó 'npm ${cmd.target}', pero debe ser 'npm run ${cmd.target}'.`,
        context: cmd.rawText,
        line: cmd.lineNum
      };
    }

    return {
      kind: 'invalid-npm-syntax',
      message: `'npm ${cmd.target}' no es un comando nativo de npm ni un script registrado.`,
      context: cmd.rawText,
      line: cmd.lineNum
    };
  }

  if (cmd.type === 'npx') {
    const binName = cmd.target.startsWith('@') ? (cmd.target.split('/')[1] || cmd.target) : cmd.target;
    const isKnownBin =
      env.installedBins.has(binName) ||
      env.declaredBins.has(cmd.target) ||
      env.declaredBins.has(binName) ||
      env.allowedNpx.has(cmd.target) ||
      env.allowedNpx.has(binName);

    if (!isKnownBin) {
      return {
        kind: 'unregistered-npx',
        message: `El binario 'npx ${cmd.target}' no existe en node_modules/.bin ni está declarado en package.json ni en allowedNpxBinaries.`,
        context: cmd.rawText,
        line: cmd.lineNum
      };
    }
  }

  return null;
}
