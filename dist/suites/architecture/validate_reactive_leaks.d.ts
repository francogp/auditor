import { FileScanAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
//#region src/suites/architecture/validate_reactive_leaks.d.ts
export declare const REACTIVE_LEAK_RULES: readonly ["dom-event-leak", "interval-leak"];
export type ReactiveLeakRuleId = (typeof REACTIVE_LEAK_RULES)[number];
export declare class ReactiveLeaksAuditor extends FileScanAuditor<ReactiveLeakRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
  private checkEventListenerLeak;
  private checkIntervalLeak;
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
}
//#endregion