import { FileScanAuditor } from "../../core/auditorBase.js";
export declare const PERSISTENCE_CLIENT_RULES: readonly ["persistence-client-uncoordinated-save", "persistence-client-untyped-key", "persistence-client-unhandled-quota-error"];
export type PersistenceClientRuleId = (typeof PERSISTENCE_CLIENT_RULES)[number];
export interface ValidatePersistenceClientOptions {
  projectRoot?: string;
  roots?: readonly string[];
  authorizedSaveFiles?: readonly string[];
  saveKeyPrefixes?: readonly string[];
}
export interface StorageAccessContext {
  readonly rawKeyArg: string;
  readonly matchIndex: number;
  readonly isWrite: boolean;
  readonly line: string;
  readonly mutationLabel: string;
}
export declare class ValidatePersistenceClientAuditor extends FileScanAuditor<PersistenceClientRuleId> {
  private readonly authorizedSaveFiles;
  private readonly saveKeyPrefixes;
  constructor(options?: string | ValidatePersistenceClientOptions);
  protected scanFile(file: string, content: string): void;
  private forEachStorageAccess;
  private scanUncoordinatedSave;
  private scanUntypedKey;
  private scanQuotaError;
  private isIgnoredLine;
  private isAuthorizedSaveFile;
  private isInsideTryCatch;
}