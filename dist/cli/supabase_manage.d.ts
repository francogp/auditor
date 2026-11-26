/**
 * src/cli/supabase_manage.ts
 *
 * Unified CLI (`auditor-supabase`) for managing Supabase Docker stacks (`remote`, `localFull`, `lite`).
 */
export declare const supabaseManageCommand: import("citty").CommandDef<{
  readonly config: {
    readonly type: "string";
    readonly description: "Path to audit.config.ts";
  };
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
}>;