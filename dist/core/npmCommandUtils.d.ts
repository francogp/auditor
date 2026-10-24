import { SpawnSyncReturns, StdioOptions } from "node:child_process";
export declare const VALID_NPM_BUILTINS: ReadonlySet<string>;
export declare const VALID_VP_BUILTINS: ReadonlySet<string>;
export declare const COMMAND_INVOCATION_TYPES: readonly ["npm-run", "npm-direct", "npx", "vp-run", "vp-direct", "vp-dlx"];
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
export declare function isPlaceholder(token: string): boolean;
export declare function loadPackageScriptsAndBins(rootDir: string): {
  scripts: Set<string>;
  declaredBins: Set<string>;
  installedBins: Set<string>;
};
export declare const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS: readonly ["env:post-setup", "env:pre-setup"];
export type KnownOptionalEnvironmentHook = (typeof KNOWN_OPTIONAL_ENVIRONMENT_HOOKS)[number];
export declare const KNOWN_OPTIONAL_ENVIRONMENT_HOOKS_SET: ReadonlySet<string>;
export declare function cleanTarget(raw: string): string;
export declare const VP_RUN_REGEX: RegExp;
export declare const VP_DIRECT_REGEX: RegExp;
export declare const VP_DLX_REGEX: RegExp;
export declare const NPM_RUN_REGEX: RegExp;
export declare const NPM_DIRECT_REGEX: RegExp;
export declare const NPX_REGEX: RegExp;
/**
 * Extracts Vite+ (vp), npm, and npx invocations from a single line of text.
 */
export declare function extractCommandsFromLine(line: string, lineNum: number, out: ExtractedCommand[], overrideRawText?: string): void;
export type GenericCommandViolationKind = 'unregistered-npm' | 'invalid-npm-syntax' | 'unregistered-npx';
export interface GenericCommandViolation {
  readonly kind: GenericCommandViolationKind;
  readonly message: string;
  readonly context: string;
  readonly line: number;
}
export declare function evaluateGenericCommandViolation(cmd: ExtractedCommand, env: NpmCommandValidationEnv): GenericCommandViolation | null;
export interface NpmCommandSpec {
  readonly binary: string;
  readonly shell: boolean;
}
/**
 * Resolves the platform-specific npm executable and shell requirement.
 * On Windows, npm is a batch script ('npm.cmd'). Node.js spawnSync requires 'npm.cmd'
 * with shell: true to prevent EINVAL (CVE-2024-27980 mitigation) or ENOENT errors.
 */
export declare function getNpmCommand(): NpmCommandSpec;
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
export declare function runNpmCommandSync(args: readonly string[], options?: RunNpmCommandOptions): SpawnSyncReturns<string>;