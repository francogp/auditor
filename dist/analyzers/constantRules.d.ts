import { AuditEngineConfig } from "../core/auditConfigTypes.js";
import { AuditRule } from "./auditRuleTypes.js";
import "../index.js";
//#region src/analyzers/constantRules.d.ts
export declare function isAuditableCodeFile(filePath?: string, config?: AuditEngineConfig): filePath is string;
export declare const DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES: readonly ["GEN_", "ISO_", "UTF_8", "BASE_64", "RGB_", "RGBA_", "WASM_", "HTML_5", "CSS_3", "HTTP_", "D3_"];
export declare function isConstantNameExemptFromNumericSuffixCheck(constName: string, config?: AuditEngineConfig): boolean;
export declare const noAliasConstants: AuditRule;
export declare const noLiteralSuffixInConstantName: AuditRule;
export declare const badConstantNames: AuditRule;
//#endregion