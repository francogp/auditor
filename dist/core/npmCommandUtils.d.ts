//#region src/core/npmCommandUtils.d.ts
/**
 * src/core/npmCommandUtils.ts
 *
 * CANONICAL VITE+ (vp), NPM & NPX COMMAND UTILITIES (Node.js 26+)
 * Provides shared parsers, package scripts / binaries resolvers, and violation evaluators
 * for both documentation auditors (Markdown) and executable script auditors (Shell, PowerShell, Docker, CI).
 */
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
//#endregion