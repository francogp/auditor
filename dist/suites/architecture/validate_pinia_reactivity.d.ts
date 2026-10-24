import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
import ts from "typescript";
export type PiniaReactivityRuleId = 'no-store-destructuring-without-storetorefs' | 'no-direct-state-mutation-outside-actions';
export declare const PINIA_REACTIVITY_RULES: readonly PiniaReactivityRuleId[];
export declare const DEFAULT_AUTHORIZED_STATE_MUTATION_FILES: readonly string[];
export declare function getAuthorizedStateMutationFiles(projectRoot?: string): ReadonlySet<string>;
export declare const AUTHORIZED_STATE_MUTATION_FILES: ReadonlySet<string>;
export declare class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
  private readonly storesRoots;
  private readonly authorizedStateMutationFiles;
  constructor(options?: FileScanRootsOptions);
  private reportPiniaViolation;
  private checkStoreVariableDeclaration;
  private checkStateMutation;
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
}