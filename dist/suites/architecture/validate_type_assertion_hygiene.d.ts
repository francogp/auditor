/**
 * packages/auditor/src/suites/architecture/validate_type_assertion_hygiene.ts
 *
 * TYPE ASSERTION HYGIENE & STRICT TYPING AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict TypeScript assertion hygiene across codebase AST:
 * 1. Zero 'as any' or 'any[]' casts.
 * 2. Zero double casts ('as unknown as T').
 * 3. Zero boolean literal type annotations (': true', ': false').
 * 4. Zero floating asynchronous promises without await or void.
 * 5. Zero broad array casts ('as string[]', 'as readonly string[]').
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const TYPE_ASSERTION_RULES: readonly ["type-assertion-zero-any", "type-assertion-double-cast", "type-assertion-boolean-literal", "type-assertion-floating-promise", "type-assertion-loose-array"];
export type TypeAssertionRuleId = (typeof TYPE_ASSERTION_RULES)[number];
export interface ValidateTypeAssertionHygieneOptions {
    projectRoot?: string;
    roots?: readonly string[];
}
export declare class ValidateTypeAssertionHygieneAuditor extends FileScanAuditor<TypeAssertionRuleId> {
    constructor(options?: string | ValidateTypeAssertionHygieneOptions);
    scanFile(filePath: string, content: string): Promise<void>;
    private scanPattern;
}
//# sourceMappingURL=validate_type_assertion_hygiene.d.ts.map