/**
 * scripts/maintenance/analyzers/constantAnalyzer.ts
 *
 * Scans codebase files for duplicate constant declarations across modules using TypeScript AST.
 */
import ts from 'typescript';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
import { SharedAstContext } from '../core/astContext.ts';
export declare const CONSTANT_ANALYZER_DESCRIPTOR: RuleDescriptor;
export declare const DEFAULT_IGNORED_CONSTANT_NAMES: readonly ["ID", "NAME", "TYPE", "KEY", "INDEX", "COUNT", "DEFAULT", "SIZE", "MAX", "MIN", "VAL", "VALUE", "ITEM", "STATE", "MODE", "TAG", "URL", "PATH", "ERR", "ERROR", "MSG", "DATA", "INFO", "OPTIONS", "CONFIG", "RESULT", "RES", "REQ", "STATUS", "LEVEL", "STEP", "DELTA", "WIDTH", "HEIGHT", "X", "Y", "Z", "I", "J", "K", "TEST", "MOCK", "STUB", "DUMMY", "VERSION", "DESC", "TITLE", "LABEL", "ICON", "COLOR", "THEME", "STYLE", "PROPS", "EMITS", "MAP", "LIST", "ITEMS", "ACTIONS", "TYPES", "KEYS", "VALUES", "ROLES", "MODALS", "VIEWS", "COMPONENTS", "STORE", "SCHEMA", "KEY_CODES", "REF", "COMPOSABLE", "PROVIDE", "INJECT", "SLOTS", "SLOT"];
export declare function getEffectiveIgnoredConstantNames(projectRoot?: string): ReadonlySet<string>;
export declare const IGNORED_CONSTANT_NAMES: ReadonlySet<string>;
interface ConstDecl {
    name: string;
    file: string;
    line: number;
    valueStr: string;
    isExported: boolean;
}
/**
 * Extracts top-level const declarations using TypeScript AST.
 */
export declare function extractConstantsFromSource(sourceFile: ts.SourceFile, filePath: string, ignoredNames?: ReadonlySet<string>): ConstDecl[];
export declare function detectDuplicateConstants(files: string[], astContext?: SharedAstContext, projectRoot?: string): Promise<Violation[]>;
export {};
//# sourceMappingURL=constantAnalyzer.d.ts.map