import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_console_cleanliness.d.ts
export declare const CONSOLE_CLEANLINESS_RULES: readonly ["no-debugger-statement", "no-console-log-in-src"];
export type ConsoleCleanlinessRuleId = (typeof CONSOLE_CLEANLINESS_RULES)[number];
export declare class ConsoleCleanlinessAuditor extends FileScanAuditor<ConsoleCleanlinessRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
  protected scanFile(relPath: string, content: string): void;
  private auditDebugger;
  private auditConsoleLog;
}
//#endregion