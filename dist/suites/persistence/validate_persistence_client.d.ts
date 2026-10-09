/**
 * packages/auditor/src/suites/persistence/validate_persistence_client.ts
 *
 * CLIENT-SIDE WEB STORAGE & PERSISTENCE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces client-side storage architecture, quota error handling, and key typing:
 * 1. Storage Uncoordinated Save (`persistence-client-uncoordinated-save`):
 *    Direct writes to localStorage / sessionStorage with reserved save prefixes outside authorizedSaveFiles.
 * 2. Storage Untyped Key (`persistence-client-untyped-key`):
 *    Arbitrary raw string literal keys passed directly to storage without typed constants or domain keys.
 * 3. Storage Unhandled Quota Error (`persistence-client-unhandled-quota-error`):
 *    Storage mutations (.setItem) invoked outside try/catch blocks susceptible to QuotaExceededError crashes.
 *
 * Escape Hatch:
 *   // storage-ok: <justification>
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const PERSISTENCE_CLIENT_RULES: readonly ["persistence-client-uncoordinated-save", "persistence-client-untyped-key", "persistence-client-unhandled-quota-error"];
export type PersistenceClientRuleId = (typeof PERSISTENCE_CLIENT_RULES)[number];
export interface ValidatePersistenceClientOptions {
    projectRoot?: string;
    roots?: readonly string[];
    authorizedSaveFiles?: readonly string[];
    saveKeyPrefixes?: readonly string[];
}
export declare class ValidatePersistenceClientAuditor extends FileScanAuditor<PersistenceClientRuleId> {
    private readonly authorizedSaveFiles;
    private readonly saveKeyPrefixes;
    constructor(options?: string | ValidatePersistenceClientOptions);
    protected scanFile(file: string, content: string): void;
    private isAuthorizedSaveFile;
    private hasStorageEscapeHatch;
    private isInsideTryCatch;
}
//# sourceMappingURL=validate_persistence_client.d.ts.map