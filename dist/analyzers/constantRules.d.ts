/**
 * packages/auditor/src/analyzers/constantRules.ts
 *
 * Rules and heuristics for magic numbers, constant names, numeric suffixes, and aliases.
 */
import { type AuditRule } from './auditRuleTypes.ts';
export declare function isAuditableCodeFile(filePath?: string, config?: import("../index.ts").AuditEngineConfig): filePath is string;
export declare const DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES: readonly ["GEN_", "ISO_", "UTF_8", "BASE_64", "RGB_", "RGBA_", "WASM_", "HTML_5", "CSS_3", "HTTP_", "D3_"];
export declare function isConstantNameExemptFromNumericSuffixCheck(constName: string, config?: import("../index.ts").AuditEngineConfig): boolean;
export declare const noAliasConstants: AuditRule;
export declare const noLiteralSuffixInConstantName: AuditRule;
export declare function isMagicNumberExemptFile(filePath?: string): boolean;
/** Standard numeric identity values, infinite sentinels and HTTP status codes exempt from magic number audit */
export declare const EXEMPT_AUDIT_NUMERIC_LITERALS: ReadonlySet<number>;
export declare const magicNumbers: AuditRule;
export declare const badConstantNames: AuditRule;
//# sourceMappingURL=constantRules.d.ts.map