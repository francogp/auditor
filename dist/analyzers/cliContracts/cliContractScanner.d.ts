import { CliContractViolation } from "./cliContractTypes.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
//#region src/analyzers/cliContracts/cliContractScanner.d.ts
/**
 * Scans an AuditedDocument AST and returns all CLI contract violations.
 */
export declare function scanCliContractAst(doc: AuditedDocument): CliContractViolation[];
//#endregion