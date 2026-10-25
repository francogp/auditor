/**
 * src/core/cli/cittyHarness.ts
 *
 * CANONICAL CITTY CLI HARNESS (Node.js 26+ Native)
 *
 * Single source of truth for declarative CLI command definitions, argument parsing,
 * npm positional flag normalization (`human` -> `--human`, `key=val` -> `--key=val`),
 * and subcommand routing powered by `citty`.
 *
 * All CLI binaries under `src/cli/` MUST use this harness instead of accessing
 * `process.argv` or `node:util.parseArgs` directly.
 */

import {
  defineCommand,
  parseArgs as cittyParseArgs,
  runCommand,
  runMain,
  type ArgDef,
  type ArgsDef,
  type CommandContext,
  type CommandDef,
  type ParsedArgs
} from 'citty';

export type CittyArgsDef = ArgsDef; // Canonical Citty args definition alias

export const CONSOLE_FORMAT_VALUES = ['compact', 'human', 'verbose', 'json'] as const;
export type ConsoleFormat = (typeof CONSOLE_FORMAT_VALUES)[number];

export const KNOWN_BARE_MODE_FLAGS: ReadonlySet<string> = new Set([
  'human',
  'verbose',
  'format=human',
  'format=verbose'
]); // runtime-set: O(1) bare mode flag lookup

export {
  defineCommand,
  runCommand,
  runMain,
  type ArgDef,
  type ArgsDef,
  type CommandContext,
  type CommandDef,
  type ParsedArgs
};

/**
 * Standard global CLI arguments shared across auditor commands.
 */
export const COMMON_CLI_ARGS = {
  project: {
    type: 'string',
    alias: 'p',
    description: 'Target host project root directory',
    default: '.'
  },
  human: {
    type: 'boolean',
    description: 'Enable interactive human Box-Drawing console output',
    default: false
  },
  verbose: {
    type: 'boolean',
    description: 'Enable verbose diagnostic output',
    default: false
  },
  format: {
    type: 'string',
    description: 'Console output format (compact, human, verbose, json)'
  },
  json: {
    type: 'boolean',
    description: 'Emit structured JSON output',
    default: false
  },
  help: {
    type: 'boolean',
    alias: 'h',
    description: 'Display command help manual',
    default: false
  }
} as const satisfies ArgsDef;

const DEFAULT_BOOLEAN_FLAG_NAMES = ['human', 'verbose', 'json', 'help'] as const;
const DEFAULT_BOOLEAN_FLAG_TOKENS: ReadonlySet<string> = new Set(DEFAULT_BOOLEAN_FLAG_NAMES); // runtime-set: O(1) bare boolean flag lookup

/**
 * Returns the raw CLI arguments passed to the current Node.js process (`process.argv.slice(2)`).
 * Centralized here so no downstream CLI module accesses `process.argv` directly.
 */
export function getProcessCliArgs(): string[] {
  return process.argv.slice(2);
}

/**
 * Returns the script path executed by the current Node.js process (`process.argv[1]`).
 */
export function getProcessExecutedScript(): string {
  return process.argv[1] ?? '';
}

function collectBooleanArgNames(argsDef?: ArgsDef): Set<string> {
  const names = new Set<string>(DEFAULT_BOOLEAN_FLAG_TOKENS);
  if (!argsDef) return names;
  for (const [key, def] of Object.entries(argsDef)) {
    if (def?.type === 'boolean') {
      names.add(key);
    }
  }
  return names;
}

/**
 * Normalizes npm-style positional boolean flags (`human` -> `--human`) and
 * `key=value` pairs (`speed=light` -> `--speed=light`) before passing to Citty,
 * ensuring bare flags are never mistaken for unknown subcommands.
 */
function normalizeCliArgv(
  rawArgs: readonly string[],
  argsDef?: ArgsDef,
  subCommandNames?: ReadonlySet<string>
): string[] {
  const booleanNames = collectBooleanArgNames(argsDef);
  const normalized = new Array<string>();
  let passthrough = false;

  for (const arg of rawArgs) {
    if (passthrough) {
      normalized.push(arg);
      continue;
    }
    if (arg === '--') {
      passthrough = true;
      normalized.push(arg);
      continue;
    }
    if (!arg.startsWith('-')) {
      if (arg.includes('=')) {
        normalized.push(`--${arg}`);
        continue;
      }
      if (!subCommandNames?.has(arg) && booleanNames.has(arg)) {
        normalized.push(`--${arg}`);
        continue;
      }
    }
    normalized.push(arg);
  }

  return normalized;
}

/**
 * Parses CLI arguments against a declarative Citty `ArgsDef` schema with automatic
 * normalization of npm-style bare boolean flags and `key=value` tokens.
 */
export function parseCittyArgs<T extends ArgsDef>(
  argsDef: T,
  rawArgs: readonly string[] = getProcessCliArgs(),
  subCommandNames?: ReadonlySet<string>
): ParsedArgs<T> {
  const normalized = normalizeCliArgv(rawArgs, argsDef, subCommandNames);
  const parsed = cittyParseArgs<T>(normalized, argsDef);
  const mutableParsed = parsed as Record<string, unknown>; // Hydrate explicit 'no-*' boolean keys
  for (const [key, def] of Object.entries(argsDef)) {
    if (key.startsWith('no-') && def?.type === 'boolean') {
      const positiveKey = key.slice(3);
      if (normalized.includes(`--${key}`) || mutableParsed[positiveKey] === false) {
        mutableParsed[key] = true;
      }
    }
  }
  return parsed;
}

/**
 * Resolves whether human Box-Drawing console mode is requested from parsed Citty args.
 */
export function resolveHumanModeFromArgs(
  args?: {
    readonly human?: boolean;
    readonly verbose?: boolean;
    readonly format?: ConsoleFormat | string;
  },
  rawArgs?: readonly string[]
): boolean {
  if (
    args?.human === true ||
    args?.verbose === true ||
    args?.format === 'human' ||
    args?.format === 'verbose'
  ) {
    return true;
  }
  if (rawArgs) {
    return rawArgs.some((a) => KNOWN_BARE_MODE_FLAGS.has(a) || KNOWN_BARE_MODE_FLAGS.has(a.replace(/^--/, '')));
  }
  return false;
}
