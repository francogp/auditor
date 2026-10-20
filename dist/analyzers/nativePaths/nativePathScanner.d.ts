import { AuditedDocument } from "../../core/auditedDocument.js";
import { NativePathViolation } from "./nativePathTypes.js";
//#region src/analyzers/nativePaths/nativePathScanner.d.ts
/**
 * Scans a document AST and returns every native path violation (deduplicated per rule and node).
 */
export declare function scanNativePathAst(doc: AuditedDocument): NativePathViolation[];
//#endregion