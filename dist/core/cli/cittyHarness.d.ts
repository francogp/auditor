import { ArgDef, ArgsDef, CommandContext, CommandDef, ParsedArgs, defineCommand } from "citty";
//#region src/core/cli/cittyHarness.d.ts
export type CittyArgsDef = ArgsDef;
/**
 * Standard global CLI arguments shared across auditor commands.
 */
export declare const COMMON_CLI_ARGS: {
  readonly project: {
    readonly type: "string";
    readonly alias: "p";
    readonly description: "Target host project root directory";
    readonly default: ".";
  };
  readonly human: {
    readonly type: "boolean";
    readonly description: "Enable interactive human Box-Drawing console output";
    readonly default: false;
  };
  readonly verbose: {
    readonly type: "boolean";
    readonly description: "Enable verbose diagnostic output";
    readonly default: false;
  };
  readonly format: {
    readonly type: "string";
    readonly description: "Console output format (compact, human, verbose, json)";
  };
  readonly json: {
    readonly type: "boolean";
    readonly description: "Emit structured JSON output";
    readonly default: false;
  };
  readonly help: {
    readonly type: "boolean";
    readonly alias: "h";
    readonly description: "Display command help manual";
    readonly default: false;
  };
};
/**
 * Returns the raw CLI arguments passed to the current Node.js process (`process.argv.slice(2)`).
 * Centralized here so no downstream CLI module accesses `process.argv` directly.
 */
export declare function getProcessCliArgs(): string[];
/**
 * Returns the script path executed by the current Node.js process (`process.argv[1]`).
 */
export declare function getProcessExecutedScript(): string;
/**
 * Parses CLI arguments against a declarative Citty `ArgsDef` schema with automatic
 * normalization of npm-style bare boolean flags and `key=value` tokens.
 */
export declare function parseCittyArgs<T extends ArgsDef>(argsDef: T, rawArgs?: readonly string[], subCommandNames?: ReadonlySet<string>): ParsedArgs<T>;
/**
 * Resolves whether human Box-Drawing console mode is requested from parsed Citty args.
 */
export declare function resolveHumanModeFromArgs(args?: {
  readonly human?: boolean;
  readonly verbose?: boolean;
  readonly format?: string;
}, rawArgs?: readonly string[]): boolean;
//#endregion
export { type ArgDef, type ArgsDef, type CommandContext, type CommandDef, type ParsedArgs, defineCommand };