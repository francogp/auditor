import { CliContractScanContext } from "./cliContractTypes.js";
import ts from "typescript";
export declare const GLOBAL_HOST_OBJECTS: ReadonlySet<string>;
export declare const PROCESS_MODULE_SPECIFIERS: ReadonlySet<string>;
export declare const UTIL_MODULE_SPECIFIERS: ReadonlySet<string>;
export declare const BANNED_CLI_PACKAGES: ReadonlySet<string>;
export declare const CLI_ARG_COLLECTION_NAMES: ReadonlySet<string>;
export declare const CLI_ARG_ITEM_NAMES: ReadonlySet<string>;
export declare const CANONICAL_CITTY_BUILDERS: ReadonlySet<string>;
/**
 * Unwraps parenthesized expressions, type assertions, non-null expressions, and satisfies.
 */
export declare function unwrapCliExpression(expr: ts.Expression): ts.Expression;
/**
 * Checks whether an expression resolves to the Node.js `process` object (direct, global, or alias).
 */
export declare function isProcessObjectExpression(rawExpr: ts.Expression, ctx: CliContractScanContext): boolean;
/**
 * Extracts the string value from a StringLiteral or NoSubstitutionTemplateLiteral.
 */
export declare function getStaticStringValue(node: ts.Node | undefined): string | undefined;