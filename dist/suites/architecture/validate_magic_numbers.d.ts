/**
 * src/suites/architecture/validate_magic_numbers.ts
 *
 * UNIFIED TYPESCRIPT AST MAGIC NUMBERS AUDITOR (Node.js 26+ Native)
 *
 * Enforces zero naked magic numbers in business logic by leveraging the TypeScript Compiler AST:
 *   - Allows legitimate constants declared anywhere:
 *     * Top-level const: const TIMEOUT = 5000
 *     * as const expressions: const X = [10, 20] as const
 *     * Arrays & Matrices: const MATRIX = [[1, 2], [3, 4]]
 *     * Dictionaries: const DICT = { A: 1, B: 2 }
 *     * Formulas: const TIME = 1000 * 60 * 5
 *     * Enums: enum Status { OK = 200 }
 *     * Types & Interfaces: type Port = 8080; interface C { port: 8080 }
 *     * Class readonly fields: static readonly MAX = 100
 *   - Universal exemptions:
 *     * Universal sentinels: -1, 0, 1, 2, 10, 100, 1000, 1024
 *     * Octal, Hex & Binary bitmasks / permissions: 0o755, 0xFF, 0b1010
 *     * Array/Tuple element indexing (ignoreArrayIndexes): arr[0], match[2], lines[i - 2]
 *     * Default parameter values (ignoreDefaultValues): function foo(limit = 5)
 *     * Precision arguments: .toFixed(0), .toFixed(1), .toFixed(2)
 *     * CLI and slice boundaries: .slice(2)
 *     * Radix arguments: parseInt(x, 10), (num).toString(16)
 *     * JSON formatting indentation: JSON.stringify(obj, null, 2)
 *   - Escape hatch: '// const-ok: <justification>'
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_magic_numbers.ts
 */
import ts from 'typescript';
import { FileScanAuditor, type AuditedDocument } from '../../core/auditorBase.ts';
export declare const MAGIC_NUMBERS_RULES: readonly ["magic-number-naked"];
export type MagicNumbersRuleId = (typeof MAGIC_NUMBERS_RULES)[number];
export interface ValidateMagicNumbersOptions {
    readonly projectRoot?: string;
    readonly roots?: readonly string[];
}
export declare class ValidateMagicNumbersAuditor extends FileScanAuditor<MagicNumbersRuleId> {
    constructor(options?: ValidateMagicNumbersOptions | readonly string[], maybeProjectRoot?: string);
    private inspectAst;
    protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void;
}
export { ValidateMagicNumbersAuditor as MagicNumbersAuditor };
//# sourceMappingURL=validate_magic_numbers.d.ts.map