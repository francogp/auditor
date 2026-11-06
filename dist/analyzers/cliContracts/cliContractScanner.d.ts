import { AuditedDocument } from "../../core/auditedDocument.js";
import { CliContractViolation } from "./cliContractTypes.js";
/**
 * Scans an AuditedDocument AST and returns all CLI contract violations.
 */
export declare function scanCliContractAst(doc: AuditedDocument): CliContractViolation[];