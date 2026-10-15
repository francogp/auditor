import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/tsAstDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/tsAstDetector.ts
 *
 * Detects direct ts.createSourceFile() calls in sub-auditors and analyzers
 * instead of leveraging SharedAstContext, this.context.getAst(), or AuditedDocument.getScriptAst().
 */
export declare const tsAstDetector: HomebrewDetector;
//#endregion