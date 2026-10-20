import { FindingSeverity } from "../../core/auditContract.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/nativePathTypes.d.ts
export declare const NATIVE_PATH_RULES: readonly ["unsafe-path-concat", "unsanitized-env-argv-path", "untrusted-url-fetch", "hardcoded-slash-path", "homebrew-path-manipulation", "homebrew-path-parsing", "homebrew-path-containment", "homebrew-file-url", "homebrew-url-parsing"];
export type NativePathRuleId = (typeof NATIVE_PATH_RULES)[number];
export interface NativePathViolation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: NativePathRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}
export interface NativePathFinding {
  readonly ruleId: NativePathRuleId;
  readonly node: ts.Node;
  readonly message: string;
}
/**
 * Per-file facts collected in a pre-pass and shared by every detector.
 * `claimed` lets a parent node (e.g. `.split(a).join(b)`) consume a child node
 * so narrower detectors do not double-report the same expression.
 * `isNodeContext` is true when the module can reach `node:path` (Node builtin imports,
 * `__dirname`, `import.meta.dirname`, `process.cwd()`, `process.argv`); filesystem rules
 * only apply there, while URL rules apply to browser code as well.
 */
export interface NativePathScanContext {
  readonly sourceFile: ts.SourceFile;
  readonly pathOriginNames: ReadonlySet<string>;
  readonly hasUrlValidation: boolean;
  readonly isNodeContext: boolean;
  readonly claimed: Set<ts.Node>;
}
/** Rules that only apply where `node:path` / `node:url` are available. */
export declare const NODE_ONLY_RULES: ReadonlySet<NativePathRuleId>;
export type NativePathDetector = (node: ts.Node, ctx: NativePathScanContext) => NativePathFinding | null;
//#endregion